import { FastifyInstance } from 'fastify';
import { pgPool } from '../../../infrastructure/database/index.js';
import { AppError } from '../../../core/errors/index.js';
import { withTransaction } from '../../../core/transactions/index.js';
import { requirePermission, requireProjectPermission } from '../../security/domain/authorization.js';
import { recordAuditEvent } from '../../security/infrastructure/audit-events.js';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../../../config/index.js';
import { computeJobFingerprint } from '../domain/fingerprint.js';

// Separate Redis connection for BullMQ (it requires its own connection)
const bullmqRedis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.secrets.redisPassword,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// Job queue for enqueuing references
const jobQueue = new Queue('aidilam-jobs', {
  connection: bullmqRedis,
  prefix: 'aidilam:queue',
  defaultJobOptions: {
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

// Enabled job types
const ENABLED_JOB_TYPES = new Set(['integration_test', 'asset_ingest', 'media_preprocess', 'subtitle_parse', 'subtitle_translate', 'transcription_orchestrate']);
const REGISTERED_JOB_TYPES = new Set(['integration_test', 'asset_ingest', 'media_preprocess', 'subtitle_parse', 'subtitle_translate', 'transcription_orchestrate', 'workflow_execute', 'video_render']);

// Cancellable statuses
const CANCELLABLE_STATUSES = new Set(['queued', 'claimed', 'running', 'retry_wait']);
// Retryable statuses
const RETRYABLE_STATUSES = new Set(['failed', 'cancelled', 'timed_out', 'dead_letter']);

export async function jobRoutes(app: FastifyInstance) {
  app.post('/api/v1/jobs', {
    schema: {
      tags: ['jobs'],
      description: 'Create a new job - requires jobs.create for the target project. Returns 202 Accepted.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['projectId', 'jobType'],
        properties: {
          projectId: { type: 'string', format: 'uuid' },
          jobType: { type: 'string', enum: ['integration_test', 'asset_ingest', 'media_preprocess', 'subtitle_parse', 'subtitle_translate', 'transcription_orchestrate', 'workflow_execute', 'video_render'] },
          priority: { type: 'integer', minimum: 0, maximum: 100 },
          inputPayload: { type: 'object' },
          idempotencyKey: { type: 'string', minLength: 1, maxLength: 128 },
          timeoutSeconds: { type: 'integer', minimum: 10, maximum: 86400 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { projectId, jobType, priority, inputPayload, idempotencyKey, timeoutSeconds } = request.body as {
      projectId: string; jobType: string; priority?: number; inputPayload?: Record<string, unknown>;
      idempotencyKey?: string; timeoutSeconds?: number;
    };

    await requireProjectPermission(request, projectId, 'jobs.create');

    // Validate job type is registered
    if (!REGISTERED_JOB_TYPES.has(jobType)) {
      throw new AppError('VALIDATION_ERROR', `Unknown job type: ${jobType}`);
    }
    // Validate job type is enabled
    if (!ENABLED_JOB_TYPES.has(jobType)) {
      throw new AppError('VALIDATION_ERROR', `Job type '${jobType}' is registered but not currently enabled`);
    }

    const identity = request.identity!;

    // Idempotency check with canonical fingerprint
    if (idempotencyKey) {
      const fingerprint = computeJobFingerprint({
        actorId: identity.actorId,
        projectId,
        jobType,
        priority: priority || 0,
        timeoutSeconds: timeoutSeconds || 300,
        inputPayload: inputPayload ?? null,
      });

      // Check existing idempotency record (scoped by actor + project + operation + key)
      const existing = await pgPool.query(
        `SELECT resource_id, request_fingerprint FROM aidilam_app.idempotency_records
         WHERE actor_id = $1 AND project_id = $2 AND operation = 'job.create' AND idempotency_key = $3
         AND expires_at > now()`,
        [identity.actorId, projectId, idempotencyKey]
      );

      if (existing.rows.length > 0) {
        const record = existing.rows[0];
        if (record.request_fingerprint === fingerprint) {
          // Same request - return original job (idempotent replay)
          const originalJob = await pgPool.query(
            `SELECT id, job_type, status, created_at FROM aidilam_app.jobs WHERE id = $1`,
            [record.resource_id]
          );
          if (originalJob.rows.length > 0) {
            const job = originalJob.rows[0];
            return reply.status(200).send({
              data: { id: job.id, jobType: job.job_type, status: job.status, createdAt: job.created_at },
              meta: { requestId: request.id, idempotencyReplayed: true },
            });
          }
        } else {
          // Different fingerprint with same key = conflict
          throw new AppError('CONFLICT', 'Idempotency key already used with a materially different request');
        }
      }

      // Store fingerprint with job creation (below)
      (request as any)._idempotencyFingerprint = fingerprint;
    }

    // Create job in PostgreSQL (with race-condition handling)
    let job: { id: string; status: string; created_at: string };
    try {
      job = await withTransaction(pgPool, async (client) => {
        const jobRes = await client.query(
          `INSERT INTO aidilam_app.jobs (project_id, job_type, priority, input_payload, idempotency_key, timeout_seconds, queue_name)
           VALUES ($1, $2, $3, $4, $5, $6, 'aidilam-jobs') RETURNING id, status, created_at`,
          [projectId, jobType, priority || 0, inputPayload ? JSON.stringify(inputPayload) : null, idempotencyKey || null, timeoutSeconds || 300]
        );
        const job = jobRes.rows[0];

        // Store idempotency record if key provided
        const fingerprint = (request as any)._idempotencyFingerprint;
        if (idempotencyKey && fingerprint) {
          await client.query(
            `INSERT INTO aidilam_app.idempotency_records (actor_id, project_id, operation, idempotency_key, request_fingerprint, resource_type, resource_id)
             VALUES ($1, $2, 'job.create', $3, $4, 'job', $5)
             ON CONFLICT (actor_id, project_id, operation, idempotency_key) DO NOTHING`,
            [identity.actorId, projectId, idempotencyKey, fingerprint, job.id]
          );
        }

        await client.query(
          `INSERT INTO aidilam_app.job_events (job_id, event_type, payload) VALUES ($1, 'job_created', $2)`,
          [job.id, JSON.stringify({ jobType, priority: priority || 0, idempotencyKey: idempotencyKey || null })]
        );

      await recordAuditEvent({
        requestId: request.id,
        identity,
        action: 'job.create',
        resourceType: 'job',
        resourceId: job.id,
        projectId,
        outcome: 'success',
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'],
        newValues: { jobType, priority: priority || 0 },
      }, client);

      return job;
    });
    } catch (err: unknown) {
      // Handle unique constraint race: another request created the job first
      const pgErr = err as { code?: string; constraint?: string };
      if (pgErr.code === '23505' && idempotencyKey) {
        // Unique violation on idempotency_key - retry lookup (the winner created it)
        // First check if our fingerprint matches the winner's
        const existingRecord = await pgPool.query(
          `SELECT resource_id, request_fingerprint FROM aidilam_app.idempotency_records
           WHERE actor_id = $1 AND project_id = $2 AND operation = 'job.create' AND idempotency_key = $3`,
          [identity.actorId, projectId, idempotencyKey]
        );

        if (existingRecord.rows.length > 0) {
          const fingerprint = (request as any)._idempotencyFingerprint;
          if (fingerprint && existingRecord.rows[0].request_fingerprint !== fingerprint) {
            // Different fingerprint = conflict
            throw new AppError('CONFLICT', 'Idempotency key already used with a materially different request');
          }
        }

        // Same fingerprint or no record yet - replay the existing job
        const existing = await pgPool.query(
          `SELECT id, job_type, status, created_at FROM aidilam_app.jobs WHERE idempotency_key = $1`,
          [idempotencyKey]
        );
        if (existing.rows.length > 0) {
          const existingJob = existing.rows[0];
          return reply.status(200).send({
            data: { id: existingJob.id, jobType: existingJob.job_type, status: existingJob.status, createdAt: existingJob.created_at },
            meta: { requestId: request.id, idempotencyReplayed: true },
          });
        }
      }
      throw err; // Re-throw non-idempotency errors
    }

    // Enqueue reference to Redis (best-effort; reconciliation catches failures)
    try {
      await jobQueue.add(jobType, {
        jobId: job.id,
        jobType,
        schemaVersion: 1,
        traceId: request.id,
      }, {
        jobId: job.id, // Use PG UUID as queue job ID for idempotent enqueue
        priority: priority || 0,
      });

      // Record enqueue event
      await pgPool.query(
        `INSERT INTO aidilam_app.job_events (job_id, event_type, payload) VALUES ($1, 'job_enqueued', $2)`,
        [job.id, JSON.stringify({ queueName: 'aidilam-jobs' })]
      );
    } catch {
      // Enqueue failed - job remains in PostgreSQL as 'queued'; reconciliation will recover
    }

    reply.status(202).send({
      data: { id: job.id, jobType, status: job.status, createdAt: job.created_at },
      meta: { requestId: request.id },
    });
  });

  app.get('/api/v1/jobs/:jobId', {
    schema: {
      tags: ['jobs'],
      description: 'Get job details - requires jobs.read for the job project',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { jobId } = request.params as { jobId: string };

    const result = await pgPool.query(
      `SELECT id, project_id, job_type, status, priority, progress_percent,
              attempt_count, max_attempts, timeout_seconds,
              scheduled_at, started_at, completed_at, created_at, updated_at
       FROM aidilam_app.jobs WHERE id = $1`,
      [jobId]
    );
    if (result.rows.length === 0) throw new AppError('RESOURCE_NOT_FOUND', 'Job not found');

    const job = result.rows[0];
    await requireProjectPermission(request, job.project_id, 'jobs.read');

    return { data: job, meta: { requestId: request.id } };
  });

  app.get('/api/v1/jobs/:jobId/events', {
    schema: {
      tags: ['jobs'],
      description: 'Get job events - requires jobs.read for the job project',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { jobId } = request.params as { jobId: string };

    const jobResult = await pgPool.query('SELECT project_id FROM aidilam_app.jobs WHERE id = $1', [jobId]);
    if (jobResult.rows.length === 0) throw new AppError('RESOURCE_NOT_FOUND', 'Job not found');

    await requireProjectPermission(request, jobResult.rows[0].project_id, 'jobs.read');

    const result = await pgPool.query(
      'SELECT id, event_type, payload, created_at FROM aidilam_app.job_events WHERE job_id = $1 ORDER BY created_at',
      [jobId]
    );
    return { data: result.rows, meta: { requestId: request.id } };
  });

  app.post('/api/v1/jobs/:jobId/cancel', {
    schema: {
      tags: ['jobs'],
      description: 'Cancel a job - requires jobs.cancel for the job project',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { jobId } = request.params as { jobId: string };

    const jobResult = await pgPool.query('SELECT id, project_id, status FROM aidilam_app.jobs WHERE id = $1', [jobId]);
    if (jobResult.rows.length === 0) throw new AppError('RESOURCE_NOT_FOUND', 'Job not found');

    const job = jobResult.rows[0];
    await requireProjectPermission(request, job.project_id, 'jobs.cancel');

    if (!CANCELLABLE_STATUSES.has(job.status)) {
      throw new AppError('CONFLICT', `Job cannot be cancelled in status: ${job.status}`);
    }

    const identity = request.identity!;

    // For queued jobs, cancel immediately. For running/claimed jobs, request cancellation.
    const newStatus = job.status === 'queued' ? 'cancelled' : 'cancel_requested';
    const completedAt = newStatus === 'cancelled' ? 'now()' : 'NULL';

    const result = await withTransaction(pgPool, async (client) => {
      const updated = await client.query(
        `UPDATE aidilam_app.jobs SET status = $1, cancel_requested_at = now(),
         completed_at = ${newStatus === 'cancelled' ? 'now()' : 'completed_at'},
         version = version + 1
         WHERE id = $2 RETURNING id, status, cancel_requested_at`,
        [newStatus, jobId]
      );

      const eventType = newStatus === 'cancelled' ? 'job_cancelled' : 'job_cancel_requested';
      await client.query(
        `INSERT INTO aidilam_app.job_events (job_id, event_type, payload) VALUES ($1, $2, $3)`,
        [jobId, eventType, JSON.stringify({ cancelledBy: identity.actorId, previousStatus: job.status })]
      );

      await recordAuditEvent({
        requestId: request.id,
        identity,
        action: 'job.cancel',
        resourceType: 'job',
        resourceId: jobId,
        projectId: job.project_id,
        outcome: 'success',
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'],
        previousValues: { status: job.status },
        newValues: { status: newStatus },
      }, client);

      return updated.rows[0];
    });

    return { data: result, meta: { requestId: request.id } };
  });

  app.post('/api/v1/jobs/:jobId/retry', {
    schema: {
      tags: ['jobs'],
      description: 'Retry a terminal job - requires jobs.retry for the job project',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { jobId } = request.params as { jobId: string };

    const jobResult = await pgPool.query(
      'SELECT id, project_id, status, attempt_count, max_attempts, job_type FROM aidilam_app.jobs WHERE id = $1',
      [jobId]
    );
    if (jobResult.rows.length === 0) throw new AppError('RESOURCE_NOT_FOUND', 'Job not found');

    const job = jobResult.rows[0];
    await requireProjectPermission(request, job.project_id, 'jobs.retry');

    if (!RETRYABLE_STATUSES.has(job.status)) {
      throw new AppError('CONFLICT', `Job cannot be retried in status: ${job.status}`);
    }

    const identity = request.identity!;
    const result = await withTransaction(pgPool, async (client) => {
      const updated = await client.query(
        `UPDATE aidilam_app.jobs SET status = 'queued', completed_at = NULL,
         worker_id = NULL, lease_expires_at = NULL, heartbeat_at = NULL,
         cancel_requested_at = NULL, next_retry_at = NULL, progress_percent = 0,
         version = version + 1
         WHERE id = $1 RETURNING id, status, attempt_count`,
        [jobId]
      );

      await client.query(
        `INSERT INTO aidilam_app.job_events (job_id, event_type, payload) VALUES ($1, 'job_enqueued', $2)`,
        [jobId, JSON.stringify({ retriedBy: identity.actorId, previousStatus: job.status })]
      );

      await recordAuditEvent({
        requestId: request.id,
        identity,
        action: 'job.retry',
        resourceType: 'job',
        resourceId: jobId,
        projectId: job.project_id,
        outcome: 'success',
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'],
        previousValues: { status: job.status },
        newValues: { status: 'queued' },
      }, client);

      return updated.rows[0];
    });

    // Re-enqueue to Redis
    try {
      await jobQueue.add(job.job_type, {
        jobId: job.id,
        jobType: job.job_type,
        schemaVersion: 1,
        traceId: request.id,
      }, { jobId: job.id });
    } catch {
      // Reconciliation will catch it
    }

    return { data: result, meta: { requestId: request.id } };
  });
}
