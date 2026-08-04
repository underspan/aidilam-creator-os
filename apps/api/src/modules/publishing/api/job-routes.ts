import { FastifyInstance } from 'fastify';
import { pgPool } from '../../../infrastructure/database/index.js';
import { AppError } from '../../../core/errors/index.js';
import { withTransaction } from '../../../core/transactions/index.js';
import { parsePagination } from '../../../core/types/index.js';
import { requireProjectPermission } from '../../security/domain/authorization.js';
import { recordAuditEvent } from '../../security/infrastructure/audit-events.js';
import { enqueuePublishingJob } from '../services/enqueue.js';

const CREDENTIAL_FIELDS = new Set([
  'access_token', 'accesstoken', 'refresh_token', 'refreshtoken',
  'password', 'cookie', 'cookies', 'authorization',
  'client_secret', 'clientsecret', 'session', 'session_id',
  'sessionid', 'oauth_token', 'oauthtoken', 'bearer',
]);

function rejectCredentialFields(body: unknown, depth = 0): void {
  if (depth > 5 || body === null || body === undefined) return;
  if (typeof body === 'object' && !Array.isArray(body)) {
    for (const key of Object.keys(body as Record<string, unknown>)) {
      const normalized = key.toLowerCase().replace(/[-_]/g, '');
      if (CREDENTIAL_FIELDS.has(normalized) || CREDENTIAL_FIELDS.has(key.toLowerCase())) {
        throw new AppError('VALIDATION_ERROR', 'Credential fields are not allowed in publishing requests');
      }
      const val = (body as Record<string, unknown>)[key];
      if (typeof val === 'object' && val !== null) rejectCredentialFields(val, depth + 1);
    }
  } else if (Array.isArray(body)) {
    for (let i = 0; i < Math.min(body.length, 20); i++) {
      if (typeof body[i] === 'object' && body[i] !== null) rejectCredentialFields(body[i], depth + 1);
    }
  }
}

export async function publishingJobRoutes(app: FastifyInstance) {
  // Credential detection before schema strips additionalProperties
  app.addHook('preValidation', async (request) => {
    if (request.method === 'GET') return;
    if (request.body && typeof request.body === 'object') {
      rejectCredentialFields(request.body);
    }
  });

  // POST /api/v1/projects/:projectId/publishing/jobs
  app.post('/api/v1/projects/:projectId/publishing/jobs', {
    schema: { tags: ['publishing'], security: [{ bearerAuth: [] }],
      body: { type: 'object', required: ['publishingProfileId', 'sourceAssetId', 'idempotencyKey'],
        properties: {
          publishingProfileId: { type: 'string', format: 'uuid' },
          sourceAssetId: { type: 'string', format: 'uuid' },
          scheduledAt: { type: 'string' },
          idempotencyKey: { type: 'string', minLength: 1, maxLength: 255 },
          captionVariables: { type: 'object' },
        }, additionalProperties: false } } },
  async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'publishing.job.create');
    const body = request.body as { publishingProfileId: string; sourceAssetId: string; scheduledAt?: string; idempotencyKey: string; captionVariables?: Record<string, string> };
    const identity = request.identity!;

    // Idempotency check
    const existing = await pgPool.query(
      `SELECT id, status, publishing_profile_id, source_asset_id FROM aidilam_app.publishing_jobs WHERE project_id = $1 AND idempotency_key = $2`,
      [projectId, body.idempotencyKey]
    );
    if (existing.rows.length > 0) {
      const ex = existing.rows[0];
      if (ex.publishing_profile_id === body.publishingProfileId && ex.source_asset_id === body.sourceAssetId) {
        return reply.status(200).send({ data: { jobId: ex.id, status: ex.status, replayed: true }, meta: { requestId: request.id } });
      }
      throw new AppError('CONFLICT', 'PUBLISHING_IDEMPOTENCY_CONFLICT');
    }

    // Resolve profile
    const profile = await pgPool.query(
      `SELECT pp.id, pp.platform_id, pp.publishing_account_id, pp.publishing_destination_id, pp.is_validation_only, pp.is_active,
              pp.caption_template, pp.hashtag_policy_json, pp.privacy_policy_json, pp.schedule_policy_json, pp.retry_policy_json, pp.quota_policy_json,
              pl.platform_key, pl.capabilities_json, pl.limits_json, pl.adapter_key
       FROM aidilam_app.publishing_profiles pp
       JOIN aidilam_app.publishing_platforms pl ON pl.id = pp.platform_id
       WHERE pp.id = $1 AND pp.project_id = $2 AND pp.is_active = true`, [body.publishingProfileId, projectId]);
    if (profile.rows.length === 0) throw new AppError('RESOURCE_NOT_FOUND', 'Publishing profile not found or inactive');
    const prof = profile.rows[0];

    // Resolve account
    const account = await pgPool.query(`SELECT id, status, display_name FROM aidilam_app.publishing_accounts WHERE id = $1 AND project_id = $2`, [prof.publishing_account_id, projectId]);
    if (account.rows.length === 0 || ['revoked', 'error'].includes(account.rows[0].status)) throw new AppError('VALIDATION_ERROR', 'Publishing account invalid');

    // Resolve destination
    const dest = await pgPool.query(`SELECT id, status, display_name FROM aidilam_app.publishing_destinations WHERE id = $1 AND project_id = $2`, [prof.publishing_destination_id, projectId]);
    if (dest.rows.length === 0) throw new AppError('VALIDATION_ERROR', 'Publishing destination not found');

    // Resolve source asset
    const asset = await pgPool.query(`SELECT id, size_bytes, duration_ms, width, height, content_type, status, asset_role, checksum_sha256 FROM aidilam_app.assets WHERE id = $1 AND project_id = $2`, [body.sourceAssetId, projectId]);
    if (asset.rows.length === 0) throw new AppError('RESOURCE_NOT_FOUND', 'Source asset not found');
    const src = asset.rows[0];
    if (src.status !== 'available') throw new AppError('VALIDATION_ERROR', 'Source asset not available');
    if (!['rendered', 'derived'].includes(src.asset_role)) throw new AppError('VALIDATION_ERROR', 'Only rendered assets may be published');

    // Platform limit checks
    const limits = prof.limits_json || {};
    if (limits.max_file_size_bytes && src.size_bytes > limits.max_file_size_bytes) throw new AppError('VALIDATION_ERROR', 'File size exceeds platform limit');
    if (limits.max_video_duration_ms && src.duration_ms > limits.max_video_duration_ms) throw new AppError('VALIDATION_ERROR', 'Duration exceeds platform limit');

    // Schedule validation
    let status: string = 'queued';
    let scheduledAt: string | null = null;
    if (body.scheduledAt) {
      const dt = new Date(body.scheduledAt);
      if (isNaN(dt.getTime())) throw new AppError('VALIDATION_ERROR', 'Invalid scheduledAt');
      const now = Date.now();
      if (dt.getTime() > now + 90 * 24 * 3600 * 1000) throw new AppError('VALIDATION_ERROR', 'Schedule beyond 90 day maximum');
      if (dt.getTime() > now + 60000) { status = 'scheduled'; scheduledAt = dt.toISOString(); }
    }

    // Quota estimate
    const quotaEst = { publishOperations: 1, platformRequests: 2, uploadBytes: Number(src.size_bytes) || 0, quotaUnits: 1, estimatedCost: 0.01 };

    // Quota admission: check profile quota_policy_json for daily limits
    const quotaPolicy = prof.quota_policy_json || {};
    const dailyOpsLimit = Number(quotaPolicy.maxPublishOperationsPerDay) || 0; // 0 = unlimited

    // Create job + plan + reservation atomically with quota admission
    let result;
    try {
      result = await withTransaction(pgPool, async (client) => {
        // Acquire project-level publishing quota advisory lock
        const lockKey = Buffer.from(projectId + ':publishing:quota').reduce((h, b) => (h * 31 + b) | 0, 0);
        await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

        // Quota admission check
        if (dailyOpsLimit > 0) {
          const usage = await client.query(
            `SELECT COALESCE(SUM(reserved_publish_operations), 0) as reserved FROM aidilam_app.publishing_quota_reservations WHERE project_id = $1 AND status = 'reserved' AND created_at >= CURRENT_DATE`,
            [projectId]
          );
          const committed = await client.query(
            `SELECT COALESCE(SUM(publish_operations), 0) as committed FROM aidilam_app.publishing_usage_records WHERE project_id = $1 AND created_at >= CURRENT_DATE`,
            [projectId]
          );
          const remaining = dailyOpsLimit - Number(usage.rows[0].reserved) - Number(committed.rows[0].committed);
          if (remaining < quotaEst.publishOperations) {
            throw Object.assign(new Error('PUBLISHING_QUOTA_EXCEEDED'), { isQuotaDenied: true });
          }
        }

        const jobRes = await client.query(
          `INSERT INTO aidilam_app.publishing_jobs (project_id, publishing_profile_id, source_asset_id, status, scheduled_at, idempotency_key, max_attempts, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, 3, $7) RETURNING id, status, created_at`,
          [projectId, body.publishingProfileId, body.sourceAssetId, status, scheduledAt, body.idempotencyKey, identity.actorId]
        );
        const job = jobRes.rows[0];

      await client.query(
        `INSERT INTO aidilam_app.publishing_plans (publishing_job_id, project_id, platform_snapshot_json, account_snapshot_json, destination_snapshot_json, source_asset_snapshot_json, content_snapshot_json, retry_snapshot_json, quota_snapshot_json, adapter_snapshot_json, request_fingerprint)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [job.id, projectId,
         JSON.stringify({ platformKey: prof.platform_key, capabilities: prof.capabilities_json, limits: prof.limits_json }),
         JSON.stringify({ accountId: account.rows[0].id, displayName: account.rows[0].display_name }),
         JSON.stringify({ destinationId: dest.rows[0].id, displayName: dest.rows[0].display_name }),
         JSON.stringify({ assetId: src.id, sizeBytes: src.size_bytes, durationMs: src.duration_ms, width: src.width, height: src.height, mimeType: src.content_type, checksumSha256: src.checksum_sha256 || null }),
         JSON.stringify({ captionTemplate: prof.caption_template, captionVariables: body.captionVariables || {}, hashtagPolicy: prof.hashtag_policy_json, privacyPolicy: prof.privacy_policy_json }),
         JSON.stringify(prof.retry_policy_json || { maxAttempts: 3, backoffMs: 5000, backoffMultiplier: 2 }),
         JSON.stringify(quotaEst),
         JSON.stringify({ adapterKey: prof.adapter_key, platformKey: prof.platform_key }),
         body.idempotencyKey]
      );

      await client.query(
        `INSERT INTO aidilam_app.publishing_quota_reservations (project_id, publishing_job_id, status, reserved_publish_operations, reserved_platform_requests, reserved_upload_bytes, reserved_quota_units, reserved_cost, expires_at)
         VALUES ($1, $2, 'reserved', $3, $4, $5, $6, $7, now() + interval '60 minutes')`,
        [projectId, job.id, quotaEst.publishOperations, quotaEst.platformRequests, quotaEst.uploadBytes, quotaEst.quotaUnits, quotaEst.estimatedCost]
      );

      await client.query(
        `INSERT INTO aidilam_app.publishing_audit_events (project_id, publishing_job_id, event_type, actor_type, actor_id, metadata_safe_json) VALUES ($1, $2, 'publishing_job_created', 'user', $3, $4)`,
        [projectId, job.id, identity.actorId, JSON.stringify({ profileId: body.publishingProfileId, platformKey: prof.platform_key, status })]
      );

      return job;
      });
    } catch (err: any) {
      // Quota denial — propagate as structured error
      if (err.isQuotaDenied) {
        throw new AppError('CONFLICT', 'PUBLISHING_QUOTA_EXCEEDED');
      }
      // 23505 unique constraint on publishing_jobs_idempotency_unique
      if (err.code === '23505' && err.constraint === 'publishing_jobs_idempotency_unique') {
        // Transaction rolled back — safe to read fresh
        const winner = await pgPool.query(
          `SELECT j.id, j.status, j.publishing_profile_id, j.source_asset_id FROM aidilam_app.publishing_jobs j WHERE j.project_id = $1 AND j.idempotency_key = $2`,
          [projectId, body.idempotencyKey]
        );
        if (winner.rows.length > 0) {
          const w = winner.rows[0];
          if (w.publishing_profile_id === body.publishingProfileId && w.source_asset_id === body.sourceAssetId) {
            return reply.status(200).send({ data: { jobId: w.id, status: w.status, replayed: true }, meta: { requestId: request.id } });
          }
          throw new AppError('CONFLICT', 'PUBLISHING_IDEMPOTENCY_CONFLICT');
        }
        throw new AppError('CONFLICT', 'PUBLISHING_IDEMPOTENCY_CONFLICT');
      }
      throw err;
    }

    // Enqueue to publishing worker if immediate (queued)
    if (result.status === 'queued') {
      enqueuePublishingJob(result.id, projectId, 'job_created').catch(() => {});
    }

    reply.status(202).send({ data: { jobId: result.id, status: result.status, createdAt: result.created_at }, meta: { requestId: request.id } });
  });

  // GET /api/v1/projects/:projectId/publishing/jobs
  app.get('/api/v1/projects/:projectId/publishing/jobs', { schema: { tags: ['publishing'], security: [{ bearerAuth: [] }] } },
  async (request) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'publishing.job.read');
    const { page, pageSize } = parsePagination(request.query as Record<string, string>);
    const result = await pgPool.query(
      `SELECT j.id, j.status, j.scheduled_at, j.progress_percent, j.current_attempt, j.max_attempts, j.external_publish_id, j.published_url_safe, j.error_code, j.created_at, j.completed_at,
              pp.name as profile_name, pl.platform_key
       FROM aidilam_app.publishing_jobs j
       JOIN aidilam_app.publishing_profiles pp ON pp.id = j.publishing_profile_id
       JOIN aidilam_app.publishing_platforms pl ON pl.id = pp.platform_id
       WHERE j.project_id = $1 ORDER BY j.created_at DESC LIMIT $2 OFFSET $3`,
      [projectId, pageSize, (page - 1) * pageSize]);
    return { data: result.rows, meta: { requestId: request.id, page, pageSize } };
  });

  // GET /api/v1/projects/:projectId/publishing/jobs/:jobId
  app.get('/api/v1/projects/:projectId/publishing/jobs/:jobId', { schema: { tags: ['publishing'], security: [{ bearerAuth: [] }] } },
  async (request) => {
    const { projectId, jobId } = request.params as { projectId: string; jobId: string };
    await requireProjectPermission(request, projectId, 'publishing.job.read');
    const result = await pgPool.query(`SELECT * FROM aidilam_app.publishing_jobs WHERE id = $1 AND project_id = $2`, [jobId, projectId]);
    if (result.rows.length === 0) throw new AppError('RESOURCE_NOT_FOUND', 'Publishing job not found');
    return { data: result.rows[0], meta: { requestId: request.id } };
  });

  // GET /api/v1/projects/:projectId/publishing/jobs/:jobId/plan
  app.get('/api/v1/projects/:projectId/publishing/jobs/:jobId/plan', { schema: { tags: ['publishing'], security: [{ bearerAuth: [] }] } },
  async (request) => {
    const { projectId, jobId } = request.params as { projectId: string; jobId: string };
    await requireProjectPermission(request, projectId, 'publishing.job.read');
    const job = await pgPool.query(`SELECT id FROM aidilam_app.publishing_jobs WHERE id = $1 AND project_id = $2`, [jobId, projectId]);
    if (job.rows.length === 0) throw new AppError('RESOURCE_NOT_FOUND', 'Publishing job not found');
    const plan = await pgPool.query(`SELECT id, plan_version, platform_snapshot_json, account_snapshot_json, destination_snapshot_json, source_asset_snapshot_json, content_snapshot_json, quota_snapshot_json, adapter_snapshot_json, created_at FROM aidilam_app.publishing_plans WHERE publishing_job_id = $1 AND project_id = $2`, [jobId, projectId]);
    if (plan.rows.length === 0) throw new AppError('RESOURCE_NOT_FOUND', 'Plan not found');
    return { data: plan.rows[0], meta: { requestId: request.id } };
  });

  // GET /api/v1/projects/:projectId/publishing/jobs/:jobId/attempts
  app.get('/api/v1/projects/:projectId/publishing/jobs/:jobId/attempts', { schema: { tags: ['publishing'], security: [{ bearerAuth: [] }] } },
  async (request) => {
    const { projectId, jobId } = request.params as { projectId: string; jobId: string };
    await requireProjectPermission(request, projectId, 'publishing.job.read');
    const job = await pgPool.query(`SELECT id FROM aidilam_app.publishing_jobs WHERE id = $1 AND project_id = $2`, [jobId, projectId]);
    if (job.rows.length === 0) throw new AppError('RESOURCE_NOT_FOUND', 'Publishing job not found');
    const attempts = await pgPool.query(`SELECT id, attempt_number, status, adapter_key, started_at, completed_at, external_publish_id, error_code, error_message_safe, created_at FROM aidilam_app.publishing_attempts WHERE publishing_job_id = $1 AND project_id = $2 ORDER BY attempt_number`, [jobId, projectId]);
    return { data: attempts.rows, meta: { requestId: request.id } };
  });

  // GET /api/v1/projects/:projectId/publishing/usage
  app.get('/api/v1/projects/:projectId/publishing/usage', { schema: { tags: ['publishing'], security: [{ bearerAuth: [] }] } },
  async (request) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'publishing.usage.read');
    const result = await pgPool.query(`SELECT * FROM aidilam_app.publishing_usage_records WHERE project_id = $1 ORDER BY created_at DESC LIMIT 50`, [projectId]);
    return { data: result.rows, meta: { requestId: request.id } };
  });

  // GET /api/v1/projects/:projectId/publishing/quota
  app.get('/api/v1/projects/:projectId/publishing/quota', { schema: { tags: ['publishing'], security: [{ bearerAuth: [] }] } },
  async (request) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'publishing.quota.read');
    const reserved = await pgPool.query(`SELECT COALESCE(SUM(reserved_cost),0) as reserved_cost, COALESCE(SUM(reserved_quota_units),0) as reserved_units, count(*) as active_count FROM aidilam_app.publishing_quota_reservations WHERE project_id = $1 AND status = 'reserved'`, [projectId]);
    const committed = await pgPool.query(`SELECT COALESCE(SUM(committed_cost),0) as committed_cost, COALESCE(SUM(quota_units),0) as committed_units FROM aidilam_app.publishing_usage_records WHERE project_id = $1`, [projectId]);
    return { data: { reserved: reserved.rows[0], committed: committed.rows[0] }, meta: { requestId: request.id } };
  });

  // POST /api/v1/projects/:projectId/publishing/jobs/:jobId/cancel
  app.post('/api/v1/projects/:projectId/publishing/jobs/:jobId/cancel', { schema: { tags: ['publishing'], security: [{ bearerAuth: [] }] } },
  async (request) => {
    const { projectId, jobId } = request.params as { projectId: string; jobId: string };
    await requireProjectPermission(request, projectId, 'publishing.job.cancel');
    const job = await pgPool.query(`SELECT id, status FROM aidilam_app.publishing_jobs WHERE id = $1 AND project_id = $2`, [jobId, projectId]);
    if (job.rows.length === 0) throw new AppError('RESOURCE_NOT_FOUND', 'Publishing job not found');
    const s = job.rows[0].status;
    if (['cancelled', 'succeeded', 'failed'].includes(s)) throw new AppError('CONFLICT', 'Job is already terminal');
    if (s === 'cancel_requested') throw new AppError('CONFLICT', 'Cancellation already requested');
    if (s === 'publishing') {
      // Active cancellation — worker will handle adapter.cancel()
      await pgPool.query(`UPDATE aidilam_app.publishing_jobs SET status = 'cancel_requested', cancel_requested_at = now(), updated_at = now() WHERE id = $1`, [jobId]);
      await pgPool.query(`INSERT INTO aidilam_app.publishing_audit_events (project_id, publishing_job_id, event_type, actor_type, actor_id, metadata_safe_json) VALUES ($1, $2, 'publishing_cancel_requested', 'user', $3, '{}')`, [projectId, jobId, request.identity!.actorId]);
      return { data: { jobId, status: 'cancel_requested' }, meta: { requestId: request.id } };
    }
    if (!['scheduled', 'queued', 'retry_wait'].includes(s)) throw new AppError('CONFLICT', 'Cannot cancel job in current state');
    await pgPool.query(`UPDATE aidilam_app.publishing_jobs SET status = 'cancelled', cancel_requested_at = now(), completed_at = now(), updated_at = now() WHERE id = $1`, [jobId]);
    await pgPool.query(`UPDATE aidilam_app.publishing_quota_reservations SET status = 'released', settled_at = now(), updated_at = now() WHERE publishing_job_id = $1 AND status = 'reserved'`, [jobId]);
    await pgPool.query(`INSERT INTO aidilam_app.publishing_audit_events (project_id, publishing_job_id, event_type, actor_type, actor_id, metadata_safe_json) VALUES ($1, $2, 'publishing_job_cancelled', 'user', $3, '{}')`, [projectId, jobId, request.identity!.actorId]);
    return { data: { jobId, status: 'cancelled' }, meta: { requestId: request.id } };
  });

  // POST /api/v1/projects/:projectId/publishing/jobs/:jobId/retry
  app.post('/api/v1/projects/:projectId/publishing/jobs/:jobId/retry', { schema: { tags: ['publishing'], security: [{ bearerAuth: [] }] } },
  async (request, reply) => {
    const { projectId, jobId } = request.params as { projectId: string; jobId: string };
    await requireProjectPermission(request, projectId, 'publishing.job.retry');

    // Atomic retry with row-level lock
    let result;
    try {
      result = await withTransaction(pgPool, async (client) => {
      const job = await client.query(`SELECT id, status, current_attempt, max_attempts, publishing_profile_id, source_asset_id FROM aidilam_app.publishing_jobs WHERE id = $1 AND project_id = $2 FOR UPDATE`, [jobId, projectId]);
      if (job.rows.length === 0) throw new AppError('RESOURCE_NOT_FOUND', 'Publishing job not found');
      const j = job.rows[0];
      if (j.status !== 'failed') throw new AppError('CONFLICT', 'PUBLISHING_JOB_NOT_RETRYABLE');
      if (j.current_attempt >= j.max_attempts) throw new AppError('CONFLICT', 'PUBLISHING_RETRY_LIMIT_REACHED');

      // Quota check for retry
      const prof = await client.query(`SELECT pp.quota_policy_json FROM aidilam_app.publishing_profiles pp WHERE pp.id = $1`, [j.publishing_profile_id]);
      const quotaPolicy = prof.rows[0]?.quota_policy_json || {};
      const dailyOpsLimit = Number(quotaPolicy.maxPublishOperationsPerDay) || 0;
      if (dailyOpsLimit > 0) {
        const lockKey = Buffer.from(projectId + ':publishing:quota').reduce((h, b) => (h * 31 + b) | 0, 0);
        await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);
        const usage = await client.query(`SELECT COALESCE(SUM(reserved_publish_operations), 0) as reserved FROM aidilam_app.publishing_quota_reservations WHERE project_id = $1 AND status = 'reserved' AND created_at >= CURRENT_DATE`, [projectId]);
        const committed = await client.query(`SELECT COALESCE(SUM(publish_operations), 0) as committed FROM aidilam_app.publishing_usage_records WHERE project_id = $1 AND created_at >= CURRENT_DATE`, [projectId]);
        const remaining = dailyOpsLimit - Number(usage.rows[0].reserved) - Number(committed.rows[0].committed);
        if (remaining < 1) throw Object.assign(new Error('PUBLISHING_QUOTA_EXCEEDED'), { isQuotaDenied: true });
      }

      // Release existing reservation if any (e.g. expired), then create new one
      await client.query(`UPDATE aidilam_app.publishing_quota_reservations SET status = 'released', settled_at = now(), updated_at = now() WHERE publishing_job_id = $1 AND status = 'reserved'`, [jobId]);

      const asset = await client.query(`SELECT size_bytes FROM aidilam_app.assets WHERE id = $1`, [j.source_asset_id]);
      const uploadBytes = Number(asset.rows[0]?.size_bytes) || 0;
      await client.query(
        `INSERT INTO aidilam_app.publishing_quota_reservations (project_id, publishing_job_id, status, reserved_publish_operations, reserved_platform_requests, reserved_upload_bytes, reserved_quota_units, reserved_cost, expires_at)
         VALUES ($1, $2, 'reserved', 1, 2, $3, 1, 0.01, now() + interval '60 minutes')
         ON CONFLICT (publishing_job_id) DO UPDATE SET status = 'reserved', reserved_publish_operations = 1, reserved_platform_requests = 2, reserved_upload_bytes = $3, reserved_quota_units = 1, reserved_cost = 0.01, expires_at = now() + interval '60 minutes', updated_at = now(), settled_at = NULL`,
        [projectId, jobId, uploadBytes]
      );

      // Transition job
      await client.query(`UPDATE aidilam_app.publishing_jobs SET status = 'queued', progress_percent = 0, current_stage = NULL, error_code = NULL, error_message_safe = NULL, completed_at = NULL, updated_at = now() WHERE id = $1`, [jobId]);
      await client.query(`INSERT INTO aidilam_app.publishing_audit_events (project_id, publishing_job_id, event_type, actor_type, actor_id, metadata_safe_json) VALUES ($1, $2, 'publishing_job_retry_requested', 'user', $3, '{}')`, [projectId, jobId, request.identity!.actorId]);
      return { jobId, status: 'queued', retried: true };
    });
    } catch (err: any) {
      if (err.isQuotaDenied) throw new AppError('CONFLICT', 'PUBLISHING_QUOTA_EXCEEDED');
      throw err;
    }

    // Enqueue for worker execution
    enqueuePublishingJob(result.jobId, projectId, 'retry').catch(() => {});

    return { data: result, meta: { requestId: request.id } };
  });
}
