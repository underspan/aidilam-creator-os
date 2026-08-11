/**
 * Media Routes — Media Preprocessing API
 *
 * Provides endpoints for initiating media preprocessing operations,
 * listing/viewing operations, cancelling, and listing derived assets.
 */

import { FastifyInstance } from 'fastify';
import { pgPool } from '../../../infrastructure/database/index.js';
import { AppError } from '../../../core/errors/index.js';
import { withTransaction } from '../../../core/transactions/index.js';
import { parsePagination } from '../../../core/types/index.js';
import { requireProjectPermission } from '../../security/domain/authorization.js';
import { recordAuditEvent } from '../../security/infrastructure/audit-events.js';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../../../config/index.js';

// Separate Redis connection for BullMQ
const bullmqRedis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.secrets.redisPassword,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const jobQueue = new Queue('aidilam-jobs', {
  connection: bullmqRedis,
  prefix: 'aidilam:queue',
  defaultJobOptions: {
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export async function mediaRoutes(app: FastifyInstance) {
  // =========================================================================
  // POST /api/v1/projects/:projectId/assets/:assetId/preprocess
  // =========================================================================
  app.post('/api/v1/projects/:projectId/assets/:assetId/preprocess', {
    schema: {
      tags: ['media'],
      description: 'Initiate media preprocessing for an asset',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['profileCode'],
        properties: {
          profileCode: { type: 'string', minLength: 1, maxLength: 128 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { projectId, assetId } = request.params as { projectId: string; assetId: string };
    await requireProjectPermission(request, projectId, 'assets.create');

    const { profileCode } = request.body as { profileCode: string };
    const identity = request.identity!;

    // Load source asset
    const assetResult = await pgPool.query(
      `SELECT id, project_id, status, media_kind, checksum_sha256
       FROM aidilam_app.assets
       WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
      [assetId, projectId],
    );

    if (assetResult.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Asset not found');
    }

    const asset = assetResult.rows[0];

    if (asset.status !== 'available') {
      throw new AppError('CONFLICT', `Asset is not available for processing (status: ${asset.status})`);
    }

    // Load profile
    const profileResult = await pgPool.query(
      `SELECT id, code, name, media_kind, version, operation_type, configuration_json, configuration_hash, is_active
       FROM aidilam_app.media_processing_profiles
       WHERE code = $1`,
      [profileCode],
    );

    if (profileResult.rows.length === 0) {
      throw new AppError('VALIDATION_ERROR', `Profile not found: ${profileCode}`);
    }

    const profile = profileResult.rows[0];

    if (!profile.is_active) {
      throw new AppError('VALIDATION_ERROR', `Profile is not active: ${profileCode}`);
    }

    // Verify media_kind matches
    if (asset.media_kind !== profile.media_kind) {
      throw new AppError('VALIDATION_ERROR',
        `Media kind mismatch: asset is '${asset.media_kind}', profile requires '${profile.media_kind}'`);
    }

    const configurationHash = profile.configuration_hash;

    // Idempotency check via unique constraint
    // Check if an active operation already exists
    const existingOp = await pgPool.query(
      `SELECT id, status, job_id FROM aidilam_app.media_operations
       WHERE project_id = $1 AND source_asset_id = $2 AND profile_id = $3 AND configuration_hash = $4
         AND status IN ('requested', 'queued', 'running', 'succeeded')
       LIMIT 1`,
      [projectId, assetId, profile.id, configurationHash],
    );

    if (existingOp.rows.length > 0) {
      const existing = existingOp.rows[0];
      return reply.status(200).send({
        data: { operationId: existing.id, status: existing.status, jobId: existing.job_id },
        meta: { requestId: request.id, idempotencyReplayed: true },
      });
    }

    // Create operation and job in transaction
    const result = await withTransaction(pgPool, async (client) => {
      // Create media_operation
      const opResult = await client.query(
        `INSERT INTO aidilam_app.media_operations
          (project_id, source_asset_id, profile_id, configuration_hash, input_checksum, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, status`,
        [projectId, assetId, profile.id, configurationHash, asset.checksum_sha256 || null, identity.actorId],
      );

      const operation = opResult.rows[0];

      // Create job
      const jobResult = await client.query(
        `INSERT INTO aidilam_app.jobs
          (project_id, job_type, priority, input_payload, queue_name)
         VALUES ($1, 'media_preprocess', 0, $2, 'aidilam-jobs')
         RETURNING id, status, created_at`,
        [projectId, JSON.stringify({
          operationId: operation.id,
          sourceAssetId: assetId,
          profileCode,
        })],
      );

      const job = jobResult.rows[0];

      // Link job to operation
      await client.query(
        `UPDATE aidilam_app.media_operations SET job_id = $1, status = 'queued' WHERE id = $2`,
        [job.id, operation.id],
      );

      // Record job event
      await client.query(
        `INSERT INTO aidilam_app.job_events (job_id, event_type, payload) VALUES ($1, 'job_created', $2)`,
        [job.id, JSON.stringify({ jobType: 'media_preprocess', operationId: operation.id, profileCode })],
      );

      await recordAuditEvent({
        requestId: request.id,
        identity,
        action: 'media.preprocess',
        resourceType: 'media_operation',
        resourceId: operation.id,
        projectId,
        outcome: 'success',
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'],
        newValues: { profileCode, assetId, jobId: job.id },
      }, client);

      return { operation, job };
    });

    // Enqueue to Redis (best-effort)
    try {
      await jobQueue.add('media_preprocess', {
        jobId: result.job.id,
        jobType: 'media_preprocess',
        schemaVersion: 1,
        traceId: request.id,
      }, {
        jobId: result.job.id,
        priority: 0,
      });
    } catch {
      // Reconciliation will recover
    }

    reply.status(202).send({
      data: {
        operationId: result.operation.id,
        status: 'queued',
        jobId: result.job.id,
        profileCode,
      },
      meta: { requestId: request.id },
    });
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/media-operations
  // =========================================================================
  app.get('/api/v1/projects/:projectId/media-operations', {
    schema: {
      tags: ['media'],
      description: 'List media operations for a project',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          pageSize: { type: 'string' },
          status: { type: 'string' },
          sourceAssetId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'assets.read');

    const query = request.query as { page?: string; pageSize?: string; status?: string; sourceAssetId?: string };
    const { page, pageSize } = parsePagination(query);
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['mo.project_id = $1'];
    const params: unknown[] = [projectId];
    let paramIdx = 2;

    if (query.status) {
      conditions.push(`mo.status = $${paramIdx}`);
      params.push(query.status);
      paramIdx++;
    }

    if (query.sourceAssetId) {
      conditions.push(`mo.source_asset_id = $${paramIdx}`);
      params.push(query.sourceAssetId);
      paramIdx++;
    }

    const where = conditions.join(' AND ');

    const [countRes, dataRes] = await Promise.all([
      pgPool.query(`SELECT count(*) FROM aidilam_app.media_operations mo WHERE ${where}`, params),
      pgPool.query(
        `SELECT mo.id, mo.project_id, mo.source_asset_id, mo.profile_id, mo.job_id,
                mo.status, mo.progress_percent, mo.configuration_hash,
                mo.started_at, mo.completed_at, mo.error_code, mo.error_message,
                mo.created_by, mo.created_at, mo.updated_at,
                mpp.code AS profile_code, mpp.name AS profile_name, mpp.operation_type
         FROM aidilam_app.media_operations mo
         JOIN aidilam_app.media_processing_profiles mpp ON mpp.id = mo.profile_id
         WHERE ${where}
         ORDER BY mo.created_at DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, pageSize, offset],
      ),
    ]);

    const total = parseInt(countRes.rows[0].count, 10);
    return {
      data: dataRes.rows,
      meta: { requestId: request.id, page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/media-operations/:operationId
  // =========================================================================
  app.get('/api/v1/projects/:projectId/media-operations/:operationId', {
    schema: {
      tags: ['media'],
      description: 'Get media operation details',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, operationId } = request.params as { projectId: string; operationId: string };
    await requireProjectPermission(request, projectId, 'assets.read');

    const result = await pgPool.query(
      `SELECT mo.id, mo.project_id, mo.source_asset_id, mo.profile_id, mo.job_id,
              mo.status, mo.input_checksum, mo.configuration_hash, mo.progress_percent,
              mo.started_at, mo.completed_at, mo.error_code, mo.error_message,
              mo.created_by, mo.created_at, mo.updated_at, mo.version,
              mpp.code AS profile_code, mpp.name AS profile_name, mpp.operation_type,
              mpp.media_kind AS profile_media_kind
       FROM aidilam_app.media_operations mo
       JOIN aidilam_app.media_processing_profiles mpp ON mpp.id = mo.profile_id
       WHERE mo.id = $1 AND mo.project_id = $2`,
      [operationId, projectId],
    );

    if (result.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Media operation not found');
    }

    return { data: result.rows[0], meta: { requestId: request.id } };
  });

  // =========================================================================
  // POST /api/v1/projects/:projectId/media-operations/:operationId/cancel
  // =========================================================================
  app.post('/api/v1/projects/:projectId/media-operations/:operationId/cancel', {
    schema: {
      tags: ['media'],
      description: 'Cancel a media operation',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, operationId } = request.params as { projectId: string; operationId: string };
    await requireProjectPermission(request, projectId, 'assets.create');

    const identity = request.identity!;

    const opResult = await pgPool.query(
      `SELECT id, status, job_id FROM aidilam_app.media_operations
       WHERE id = $1 AND project_id = $2`,
      [operationId, projectId],
    );

    if (opResult.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Media operation not found');
    }

    const operation = opResult.rows[0];
    const cancellableStatuses = new Set(['requested', 'queued', 'running']);

    if (!cancellableStatuses.has(operation.status)) {
      throw new AppError('CONFLICT', `Operation cannot be cancelled in status: ${operation.status}`);
    }

    // For queued/requested, cancel directly. For running, request cancellation via job.
    if (operation.status === 'running' && operation.job_id) {
      // Request cancellation on the job
      await pgPool.query(
        `UPDATE aidilam_app.jobs SET cancel_requested_at = NOW(), status = 'cancel_requested', version = version + 1
         WHERE id = $1 AND status IN ('running', 'claimed')`,
        [operation.job_id],
      );
      await pgPool.query(
        `UPDATE aidilam_app.media_operations SET status = 'cancel_requested', updated_at = NOW(), version = version + 1
         WHERE id = $1`,
        [operationId],
      );
    } else {
      // Cancel directly
      await pgPool.query(
        `UPDATE aidilam_app.media_operations SET status = 'cancelled', completed_at = NOW(), updated_at = NOW(), version = version + 1
         WHERE id = $1`,
        [operationId],
      );
      // Also cancel the job if it exists
      if (operation.job_id) {
        await pgPool.query(
          `UPDATE aidilam_app.jobs SET status = 'cancelled', completed_at = NOW(), cancel_requested_at = NOW(), version = version + 1
           WHERE id = $1 AND status IN ('queued', 'claimed')`,
          [operation.job_id],
        );
      }
    }

    await recordAuditEvent({
      requestId: request.id,
      identity,
      action: 'media.cancel',
      resourceType: 'media_operation',
      resourceId: operationId,
      projectId,
      outcome: 'success',
      sourceIp: request.ip,
      userAgent: request.headers['user-agent'],
      previousValues: { status: operation.status },
      newValues: { status: operation.status === 'running' ? 'cancel_requested' : 'cancelled' },
    });

    return {
      data: {
        operationId,
        status: operation.status === 'running' ? 'cancel_requested' : 'cancelled',
      },
      meta: { requestId: request.id },
    };
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/assets/:assetId/derived
  // =========================================================================
  app.get('/api/v1/projects/:projectId/assets/:assetId/derived', {
    schema: {
      tags: ['media'],
      description: 'List derived assets for a source asset',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          pageSize: { type: 'string' },
          assetRole: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const { projectId, assetId } = request.params as { projectId: string; assetId: string };
    await requireProjectPermission(request, projectId, 'assets.read');

    const query = request.query as { page?: string; pageSize?: string; assetRole?: string };
    const { page, pageSize } = parsePagination(query);
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['project_id = $1', 'source_asset_id = $2', 'deleted_at IS NULL'];
    const params: unknown[] = [projectId, assetId];
    let paramIdx = 3;

    if (query.assetRole) {
      conditions.push(`asset_role = $${paramIdx}`);
      params.push(query.assetRole);
      paramIdx++;
    }

    const where = conditions.join(' AND ');

    const [countRes, dataRes] = await Promise.all([
      pgPool.query(`SELECT count(*) FROM aidilam_app.assets WHERE ${where}`, params),
      pgPool.query(
        `SELECT id, original_filename, content_type, media_kind, status, size_bytes,
                asset_role, profile_code, profile_version, configuration_hash,
                created_at, updated_at
         FROM aidilam_app.assets
         WHERE ${where}
         ORDER BY created_at DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, pageSize, offset],
      ),
    ]);

    const total = parseInt(countRes.rows[0].count, 10);
    return {
      data: dataRes.rows,
      meta: { requestId: request.id, page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  });
}
