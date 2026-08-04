/**
 * Transcription Routes — STT API
 *
 * Provides endpoints for requesting speech-to-text transcription of media assets,
 * listing transcription runs, viewing results, and cancelling runs.
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

export async function transcriptionRoutes(app: FastifyInstance) {
  // =========================================================================
  // POST /api/v1/projects/:projectId/assets/:mediaAssetId/transcriptions
  // Request speech-to-text transcription of a media asset
  // =========================================================================
  app.post('/api/v1/projects/:projectId/assets/:mediaAssetId/transcriptions', {
    schema: {
      tags: ['transcriptions'],
      description: 'Request speech-to-text transcription of a media asset',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['sttProfileCode'],
        properties: {
          sttProfileCode: { type: 'string', minLength: 1, maxLength: 128 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { projectId, mediaAssetId } = request.params as { projectId: string; mediaAssetId: string };
    await requireProjectPermission(request, projectId, 'transcriptions.create');

    const { sttProfileCode } = request.body as { sttProfileCode: string };
    const identity = request.identity!;

    // Verify media asset exists and belongs to project
    const mediaAssetResult = await pgPool.query(
      `SELECT id, status FROM aidilam_app.assets
       WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
      [mediaAssetId, projectId],
    );

    if (mediaAssetResult.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Media asset not found');
    }

    if (mediaAssetResult.rows[0].status !== 'available') {
      throw new AppError('CONFLICT', `Media asset is not available (status: ${mediaAssetResult.rows[0].status})`);
    }

    // Load STT profile
    const profileResult = await pgPool.query(
      `SELECT id, code, name, provider_code, source_language, configuration_hash, is_active
       FROM aidilam_app.stt_profiles
       WHERE code = $1`,
      [sttProfileCode],
    );

    if (profileResult.rows.length === 0) {
      throw new AppError('VALIDATION_ERROR', `STT profile not found: ${sttProfileCode}`);
    }

    const profile = profileResult.rows[0];
    if (!profile.is_active) {
      throw new AppError('VALIDATION_ERROR', `STT profile is not active: ${sttProfileCode}`);
    }

    // Create transcription run and job in transaction
    // Use advisory lock to serialize concurrent admission for same media+profile
    let result: { run: { id: string; status: string }; job: { id: string; status: string; created_at: string } };
    try {
      result = await withTransaction(pgPool, async (client) => {
        // Advisory lock: serialize on hash of (projectId + mediaAssetId + profileId)
        const lockKey = Buffer.from(projectId + mediaAssetId + profile.id).reduce((h, b) => (h * 31 + b) | 0, 0);
        await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

        // Check if an active transcription already exists for this media+profile+config
        const existingRun = await client.query(
          `SELECT tr.id, tr.status, j.id as job_id
           FROM aidilam_app.transcription_runs tr
           LEFT JOIN aidilam_app.jobs j ON j.id = tr.job_id
           WHERE tr.project_id = $1 AND tr.media_asset_id = $2
             AND tr.stt_profile_id = $3 AND tr.configuration_hash = $4
             AND tr.status IN ('requested', 'queued', 'preparing_audio', 'segmenting', 'transcribing', 'assembling', 'succeeded')
           LIMIT 1`,
          [projectId, mediaAssetId, profile.id, profile.configuration_hash],
        );

        if (existingRun.rows.length > 0) {
          // Already exists — return it (idempotent)
          const e = existingRun.rows[0];
          return {
            run: { id: e.id, status: e.status },
            job: { id: e.job_id, status: 'existing', created_at: '' },
            replayed: true,
          };
        }

        // Create transcription run
        const runRes = await client.query(
          `INSERT INTO aidilam_app.transcription_runs
             (project_id, media_asset_id, stt_profile_id, configuration_hash,
              source_language, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, status`,
          [projectId, mediaAssetId, profile.id, profile.configuration_hash,
           profile.source_language || null, identity.actorId],
        );

        const run = runRes.rows[0];

        // Create job
        const jobRes = await client.query(
          `INSERT INTO aidilam_app.jobs
             (project_id, job_type, priority, input_payload, queue_name)
           VALUES ($1, 'transcription_orchestrate', 0, $2, 'aidilam-jobs')
           RETURNING id, status, created_at`,
          [projectId, JSON.stringify({ runId: run.id })],
        );

        const job = jobRes.rows[0];

        // Link job to run and transition to queued
        await client.query(
          `UPDATE aidilam_app.transcription_runs
           SET job_id = $1, status = 'queued', updated_at = now()
           WHERE id = $2`,
          [job.id, run.id],
        );

        // Record job event
        await client.query(
          `INSERT INTO aidilam_app.job_events (job_id, event_type, payload) VALUES ($1, 'job_created', $2)`,
          [job.id, JSON.stringify({ jobType: 'transcription_orchestrate', runId: run.id, profileCode: sttProfileCode })],
        );

        await recordAuditEvent({
          requestId: request.id,
          identity,
          action: 'transcription.create',
          resourceType: 'transcription_run',
          resourceId: run.id,
          projectId,
          outcome: 'success',
          sourceIp: request.ip,
          userAgent: request.headers['user-agent'],
          newValues: {
            profileCode: sttProfileCode,
            mediaAssetId,
            jobId: job.id,
          },
        }, client);

        return { run, job, replayed: false };
      });
    } catch (err: unknown) {
      // Handle unique constraint race (belt-and-suspenders with advisory lock)
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') {
        const existing = await pgPool.query(
          `SELECT tr.id as run_id, tr.status, j.id as job_id
           FROM aidilam_app.transcription_runs tr
           LEFT JOIN aidilam_app.jobs j ON j.id = tr.job_id
           WHERE tr.project_id = $1 AND tr.media_asset_id = $2
             AND tr.stt_profile_id = $3 AND tr.configuration_hash = $4
             AND tr.status IN ('requested', 'queued', 'preparing_audio', 'segmenting', 'transcribing', 'assembling', 'succeeded')
           ORDER BY tr.created_at DESC LIMIT 1`,
          [projectId, mediaAssetId, profile.id, profile.configuration_hash],
        );
        if (existing.rows.length > 0) {
          const e = existing.rows[0];
          return reply.status(200).send({
            data: { transcriptionRunId: e.run_id, status: e.status, jobId: e.job_id, profileCode: sttProfileCode },
            meta: { requestId: request.id, idempotencyReplayed: true },
          });
        }
      }
      throw err;
    }

    // If replayed from within transaction (advisory lock found existing)
    if ((result as any).replayed) {
      return reply.status(200).send({
        data: {
          transcriptionRunId: result.run.id,
          status: result.run.status,
          jobId: result.job.id,
          profileCode: sttProfileCode,
        },
        meta: { requestId: request.id, idempotencyReplayed: true },
      });
    }

    // Enqueue to Redis (best-effort)
    try {
      await jobQueue.add('transcription_orchestrate', {
        jobId: result.job.id,
        jobType: 'transcription_orchestrate',
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
        transcriptionRunId: result.run.id,
        status: 'queued',
        jobId: result.job.id,
        profileCode: sttProfileCode,
        mediaAssetId,
      },
      meta: { requestId: request.id },
    });
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/transcriptions
  // List transcription runs for a project
  // =========================================================================
  app.get('/api/v1/projects/:projectId/transcriptions', {
    schema: {
      tags: ['transcriptions'],
      description: 'List transcription runs for a project',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          pageSize: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'transcriptions.read');

    const query = request.query as { page?: string; pageSize?: string };
    const { page, pageSize } = parsePagination(query);
    const offset = (page - 1) * pageSize;

    const [countRes, dataRes] = await Promise.all([
      pgPool.query(
        `SELECT count(*) FROM aidilam_app.transcription_runs WHERE project_id = $1`,
        [projectId],
      ),
      pgPool.query(
        `SELECT tr.id, tr.project_id, tr.media_asset_id, tr.audio_asset_id,
                tr.stt_profile_id, tr.job_id, tr.status, tr.source_language,
                tr.detected_language, tr.provider_code, tr.duration_ms,
                tr.segment_count, tr.word_count, tr.utterance_count,
                tr.started_at, tr.completed_at, tr.error_code, tr.error_message,
                tr.created_by, tr.created_at, tr.updated_at,
                sp.code AS profile_code, sp.name AS profile_name
         FROM aidilam_app.transcription_runs tr
         JOIN aidilam_app.stt_profiles sp ON sp.id = tr.stt_profile_id
         WHERE tr.project_id = $1
         ORDER BY tr.created_at DESC
         LIMIT $2 OFFSET $3`,
        [projectId, pageSize, offset],
      ),
    ]);

    const total = parseInt(countRes.rows[0].count, 10);
    return {
      data: dataRes.rows,
      meta: { requestId: request.id, page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/transcriptions/:runId
  // Get transcription run details
  // =========================================================================
  app.get('/api/v1/projects/:projectId/transcriptions/:runId', {
    schema: {
      tags: ['transcriptions'],
      description: 'Get transcription run details',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, runId } = request.params as { projectId: string; runId: string };
    await requireProjectPermission(request, projectId, 'transcriptions.read');

    const result = await pgPool.query(
      `SELECT tr.id, tr.project_id, tr.media_asset_id, tr.audio_asset_id,
              tr.stt_profile_id, tr.job_id, tr.status, tr.source_language,
              tr.detected_language, tr.provider_code, tr.model_code,
              tr.input_checksum, tr.configuration_hash, tr.duration_ms,
              tr.segment_count, tr.word_count, tr.utterance_count,
              tr.started_at, tr.completed_at, tr.error_code, tr.error_message,
              tr.created_by, tr.created_at, tr.updated_at, tr.version,
              sp.code AS profile_code, sp.name AS profile_name
       FROM aidilam_app.transcription_runs tr
       JOIN aidilam_app.stt_profiles sp ON sp.id = tr.stt_profile_id
       WHERE tr.id = $1 AND tr.project_id = $2`,
      [runId, projectId],
    );

    if (result.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Transcription run not found');
    }

    return { data: result.rows[0], meta: { requestId: request.id } };
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/transcriptions/:runId/segments
  // List segments for a transcription run
  // =========================================================================
  app.get('/api/v1/projects/:projectId/transcriptions/:runId/segments', {
    schema: {
      tags: ['transcriptions'],
      description: 'List segments for a transcription run',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          pageSize: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const { projectId, runId } = request.params as { projectId: string; runId: string };
    await requireProjectPermission(request, projectId, 'transcriptions.read');

    // Verify run belongs to project
    const runResult = await pgPool.query(
      `SELECT id FROM aidilam_app.transcription_runs WHERE id = $1 AND project_id = $2`,
      [runId, projectId],
    );

    if (runResult.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Transcription run not found');
    }

    const query = request.query as { page?: string; pageSize?: string };
    const { page, pageSize } = parsePagination(query);
    const offset = (page - 1) * pageSize;

    const [countRes, dataRes] = await Promise.all([
      pgPool.query(
        `SELECT count(*) FROM aidilam_app.transcription_segments WHERE transcription_run_id = $1`,
        [runId],
      ),
      pgPool.query(
        `SELECT id, transcription_run_id, segment_index, start_ms, end_ms, duration_ms,
                audio_asset_id, status, checksum, text_plain, confidence,
                detected_language, created_at, updated_at
         FROM aidilam_app.transcription_segments
         WHERE transcription_run_id = $1
         ORDER BY segment_index
         LIMIT $2 OFFSET $3`,
        [runId, pageSize, offset],
      ),
    ]);

    const total = parseInt(countRes.rows[0].count, 10);
    return {
      data: dataRes.rows,
      meta: { requestId: request.id, page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  });

  // =========================================================================
  // POST /api/v1/projects/:projectId/transcriptions/:runId/cancel
  // Cancel a transcription run
  // =========================================================================
  app.post('/api/v1/projects/:projectId/transcriptions/:runId/cancel', {
    schema: {
      tags: ['transcriptions'],
      description: 'Cancel a transcription run',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, runId } = request.params as { projectId: string; runId: string };
    await requireProjectPermission(request, projectId, 'transcriptions.create');

    const identity = request.identity!;

    // Load transcription run
    const runResult = await pgPool.query(
      `SELECT tr.id, tr.status, tr.job_id
       FROM aidilam_app.transcription_runs tr
       WHERE tr.id = $1 AND tr.project_id = $2`,
      [runId, projectId],
    );

    if (runResult.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Transcription run not found');
    }

    const run = runResult.rows[0];

    const cancellableStatuses = new Set([
      'requested', 'queued', 'preparing_audio', 'segmenting', 'transcribing', 'assembling',
    ]);

    if (!cancellableStatuses.has(run.status)) {
      throw new AppError('CONFLICT', `Transcription run cannot be cancelled in status: ${run.status}`);
    }

    // Transition run to cancel_requested (or cancelled if still queued/requested)
    const immediateCancel = run.status === 'requested' || run.status === 'queued';
    const newStatus = immediateCancel ? 'cancelled' : 'cancel_requested';

    await withTransaction(pgPool, async (client) => {
      await client.query(
        `UPDATE aidilam_app.transcription_runs
         SET status = $2, ${immediateCancel ? 'completed_at = now(),' : ''}
             updated_at = now(), version = version + 1
         WHERE id = $1`,
        [runId, newStatus],
      );

      // Also request cancellation on the associated job
      if (run.job_id) {
        const jobCancelStatus = immediateCancel ? 'cancelled' : 'cancel_requested';
        await client.query(
          `UPDATE aidilam_app.jobs
           SET status = $2, cancel_requested_at = now(),
               ${immediateCancel ? 'completed_at = now(),' : ''}
               version = version + 1
           WHERE id = $1 AND status NOT IN ('succeeded', 'failed', 'cancelled')`,
          [run.job_id, jobCancelStatus],
        );
      }

      await recordAuditEvent({
        requestId: request.id,
        identity,
        action: 'transcription.cancel',
        resourceType: 'transcription_run',
        resourceId: runId,
        projectId,
        outcome: 'success',
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'],
        previousValues: { status: run.status },
        newValues: { status: newStatus },
      }, client);
    });

    return {
      data: { id: runId, status: newStatus },
      meta: { requestId: request.id },
    };
  });
}
