/**
 * Subtitle Routes — Subtitle Track & Translation API
 *
 * Provides endpoints for attaching subtitle tracks to media assets,
 * listing tracks/versions/cues, requesting translations, and soft-deleting tracks.
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

export async function subtitleRoutes(app: FastifyInstance) {
  // =========================================================================
  // POST /api/v1/projects/:projectId/assets/:mediaAssetId/subtitle-tracks
  // Attach a subtitle track to a media asset and enqueue parsing
  // =========================================================================
  app.post('/api/v1/projects/:projectId/assets/:mediaAssetId/subtitle-tracks', {
    schema: {
      tags: ['subtitles'],
      description: 'Attach a subtitle track to a media asset and enqueue parsing',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['sourceAssetId', 'languageCode', 'trackKind'],
        properties: {
          sourceAssetId: { type: 'string', format: 'uuid' },
          languageCode: { type: 'string', minLength: 2, maxLength: 10 },
          languageName: { type: 'string', maxLength: 100 },
          trackKind: { type: 'string', enum: ['original', 'translated', 'manual', 'generated'] },
          isDefault: { type: 'boolean' },
          isForced: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { projectId, mediaAssetId } = request.params as { projectId: string; mediaAssetId: string };
    await requireProjectPermission(request, projectId, 'subtitles.create');

    const { sourceAssetId, languageCode, languageName, trackKind, isDefault, isForced } = request.body as {
      sourceAssetId: string;
      languageCode: string;
      languageName?: string;
      trackKind: string;
      isDefault?: boolean;
      isForced?: boolean;
    };

    const identity = request.identity!;

    // Verify media asset exists and belongs to project
    const mediaAssetResult = await pgPool.query(
      `SELECT id FROM aidilam_app.assets
       WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
      [mediaAssetId, projectId],
    );

    if (mediaAssetResult.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Media asset not found');
    }

    // Verify source asset exists and is available
    const sourceAssetResult = await pgPool.query(
      `SELECT id, status FROM aidilam_app.assets
       WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
      [sourceAssetId, projectId],
    );

    if (sourceAssetResult.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Source subtitle asset not found');
    }

    if (sourceAssetResult.rows[0].status !== 'available') {
      throw new AppError('CONFLICT', `Source asset is not available (status: ${sourceAssetResult.rows[0].status})`);
    }

    // Create track and job in transaction (with idempotency)
    let result: { track: { id: string; status: string }; job: { id: string; status: string; created_at: string } };
    try {
      result = await withTransaction(pgPool, async (client) => {
        // Create subtitle_track (unique constraint prevents duplicates)
        const trackResult = await client.query(
          `INSERT INTO aidilam_app.subtitle_tracks
             (project_id, media_asset_id, source_asset_id, language_code, language_name,
              track_kind, is_default, is_forced, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id, status`,
          [projectId, mediaAssetId, sourceAssetId, languageCode, languageName || null,
           trackKind, isDefault || false, isForced || false, identity.actorId],
        );

        const track = trackResult.rows[0];

        // Create job for parsing
        const jobResult = await client.query(
          `INSERT INTO aidilam_app.jobs
             (project_id, job_type, priority, input_payload, queue_name)
           VALUES ($1, 'subtitle_parse', 0, $2, 'aidilam-jobs')
           RETURNING id, status, created_at`,
          [projectId, JSON.stringify({ trackId: track.id })],
        );

        const job = jobResult.rows[0];

        // Record job event
        await client.query(
          `INSERT INTO aidilam_app.job_events (job_id, event_type, payload) VALUES ($1, 'job_created', $2)`,
          [job.id, JSON.stringify({ jobType: 'subtitle_parse', trackId: track.id })],
        );

        await recordAuditEvent({
          requestId: request.id,
          identity,
          action: 'subtitle_track.create',
          resourceType: 'subtitle_track',
          resourceId: track.id,
          projectId,
          outcome: 'success',
          sourceIp: request.ip,
          userAgent: request.headers['user-agent'],
          newValues: { languageCode, trackKind, sourceAssetId, mediaAssetId, jobId: job.id },
        }, client);

        return { track, job };
      });
    } catch (err: unknown) {
      // Handle unique constraint race: another concurrent request created the track
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') {
        // Duplicate — find the existing track and return it (idempotent replay)
        const existing = await pgPool.query(
          `SELECT id, status FROM aidilam_app.subtitle_tracks
           WHERE project_id = $1 AND media_asset_id = $2 AND source_asset_id = $3
             AND language_code = $4 AND track_kind = $5
             AND status NOT IN ('deleting', 'deleted')
           LIMIT 1`,
          [projectId, mediaAssetId, sourceAssetId, languageCode, trackKind],
        );
        if (existing.rows.length > 0) {
          return reply.status(200).send({
            data: {
              trackId: existing.rows[0].id,
              status: existing.rows[0].status,
              languageCode,
              trackKind,
            },
            meta: { requestId: request.id, idempotencyReplayed: true },
          });
        }
      }
      throw err;
    }

    // Enqueue to Redis (best-effort)
    try {
      await jobQueue.add('subtitle_parse', {
        jobId: result.job.id,
        jobType: 'subtitle_parse',
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
        trackId: result.track.id,
        status: result.track.status,
        jobId: result.job.id,
        languageCode,
        trackKind,
      },
      meta: { requestId: request.id },
    });
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/assets/:mediaAssetId/subtitle-tracks
  // List subtitle tracks for a media asset
  // =========================================================================
  app.get('/api/v1/projects/:projectId/assets/:mediaAssetId/subtitle-tracks', {
    schema: {
      tags: ['subtitles'],
      description: 'List subtitle tracks for a media asset',
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
    const { projectId, mediaAssetId } = request.params as { projectId: string; mediaAssetId: string };
    await requireProjectPermission(request, projectId, 'subtitles.read');

    const query = request.query as { page?: string; pageSize?: string };
    const { page, pageSize } = parsePagination(query);
    const offset = (page - 1) * pageSize;

    const [countRes, dataRes] = await Promise.all([
      pgPool.query(
        `SELECT count(*) FROM aidilam_app.subtitle_tracks
         WHERE project_id = $1 AND media_asset_id = $2 AND status != 'deleted'`,
        [projectId, mediaAssetId],
      ),
      pgPool.query(
        `SELECT id, project_id, media_asset_id, source_asset_id, language_code, language_name,
                track_kind, status, source_format, is_default, is_forced, cue_count,
                duration_ms, created_by, created_at, updated_at
         FROM aidilam_app.subtitle_tracks
         WHERE project_id = $1 AND media_asset_id = $2 AND status != 'deleted'
         ORDER BY created_at DESC
         LIMIT $3 OFFSET $4`,
        [projectId, mediaAssetId, pageSize, offset],
      ),
    ]);

    const total = parseInt(countRes.rows[0].count, 10);
    return {
      data: dataRes.rows,
      meta: { requestId: request.id, page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/subtitle-tracks/:trackId
  // Get subtitle track details
  // =========================================================================
  app.get('/api/v1/projects/:projectId/subtitle-tracks/:trackId', {
    schema: {
      tags: ['subtitles'],
      description: 'Get subtitle track details',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, trackId } = request.params as { projectId: string; trackId: string };
    await requireProjectPermission(request, projectId, 'subtitles.read');

    const result = await pgPool.query(
      `SELECT t.id, t.project_id, t.media_asset_id, t.source_asset_id, t.language_code,
              t.language_name, t.track_kind, t.status, t.source_format, t.is_default,
              t.is_forced, t.cue_count, t.duration_ms, t.created_by, t.created_at, t.updated_at, t.version
       FROM aidilam_app.subtitle_tracks t
       WHERE t.id = $1 AND t.project_id = $2 AND t.status != 'deleted'`,
      [trackId, projectId],
    );

    if (result.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Subtitle track not found');
    }

    // Also fetch versions for this track
    const versionsResult = await pgPool.query(
      `SELECT id, version_number, version_type, language_code, status, cue_count,
              source_provider, source_model, content_checksum, created_by, created_at,
              approved_by, approved_at
       FROM aidilam_app.subtitle_versions
       WHERE subtitle_track_id = $1
       ORDER BY version_number`,
      [trackId],
    );

    return {
      data: { ...result.rows[0], versions: versionsResult.rows },
      meta: { requestId: request.id },
    };
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/subtitle-tracks/:trackId/versions/:versionId/cues
  // List cues for a subtitle version (paginated)
  // =========================================================================
  app.get('/api/v1/projects/:projectId/subtitle-tracks/:trackId/versions/:versionId/cues', {
    schema: {
      tags: ['subtitles'],
      description: 'List cues for a subtitle version (paginated)',
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
    const { projectId, trackId, versionId } = request.params as {
      projectId: string; trackId: string; versionId: string;
    };
    await requireProjectPermission(request, projectId, 'subtitles.read');

    // Verify track belongs to project
    const trackResult = await pgPool.query(
      `SELECT id FROM aidilam_app.subtitle_tracks
       WHERE id = $1 AND project_id = $2 AND status != 'deleted'`,
      [trackId, projectId],
    );

    if (trackResult.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Subtitle track not found');
    }

    // Verify version belongs to track
    const versionResult = await pgPool.query(
      `SELECT id, cue_count FROM aidilam_app.subtitle_versions
       WHERE id = $1 AND subtitle_track_id = $2`,
      [versionId, trackId],
    );

    if (versionResult.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Subtitle version not found');
    }

    const query = request.query as { page?: string; pageSize?: string };
    const { page, pageSize } = parsePagination(query);
    const offset = (page - 1) * pageSize;

    const [countRes, dataRes] = await Promise.all([
      pgPool.query(
        `SELECT count(*) FROM aidilam_app.subtitle_cues WHERE subtitle_version_id = $1`,
        [versionId],
      ),
      pgPool.query(
        `SELECT id, cue_index, start_ms, end_ms, duration_ms, text_plain, text_format,
                speaker_label, position_json, style_json, source_cue_identifier,
                created_at, updated_at
         FROM aidilam_app.subtitle_cues
         WHERE subtitle_version_id = $1
         ORDER BY cue_index
         LIMIT $2 OFFSET $3`,
        [versionId, pageSize, offset],
      ),
    ]);

    const total = parseInt(countRes.rows[0].count, 10);
    return {
      data: dataRes.rows,
      meta: { requestId: request.id, page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  });

  // =========================================================================
  // POST /api/v1/projects/:projectId/subtitle-tracks/:trackId/versions/:versionId/translate
  // Request translation of a subtitle version
  // =========================================================================
  app.post('/api/v1/projects/:projectId/subtitle-tracks/:trackId/versions/:versionId/translate', {
    schema: {
      tags: ['subtitles'],
      description: 'Request translation of a subtitle version',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['translationProfileCode'],
        properties: {
          translationProfileCode: { type: 'string', minLength: 1, maxLength: 128 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { projectId, trackId, versionId } = request.params as {
      projectId: string; trackId: string; versionId: string;
    };
    await requireProjectPermission(request, projectId, 'subtitles.translate');

    const { translationProfileCode } = request.body as { translationProfileCode: string };
    const identity = request.identity!;

    // Verify track belongs to project
    const trackResult = await pgPool.query(
      `SELECT id, language_code FROM aidilam_app.subtitle_tracks
       WHERE id = $1 AND project_id = $2 AND status != 'deleted'`,
      [trackId, projectId],
    );

    if (trackResult.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Subtitle track not found');
    }

    // Verify source version belongs to track and is ready
    const sourceVersionResult = await pgPool.query(
      `SELECT id, version_number, status, cue_count, language_code
       FROM aidilam_app.subtitle_versions
       WHERE id = $1 AND subtitle_track_id = $2`,
      [versionId, trackId],
    );

    if (sourceVersionResult.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Source subtitle version not found');
    }

    const sourceVersion = sourceVersionResult.rows[0];
    if (sourceVersion.status !== 'ready' && sourceVersion.status !== 'approved') {
      throw new AppError('CONFLICT', `Source version is not ready for translation (status: ${sourceVersion.status})`);
    }

    // Load translation profile
    const profileResult = await pgPool.query(
      `SELECT id, code, name, target_language, configuration_hash, is_active
       FROM aidilam_app.translation_profiles
       WHERE code = $1`,
      [translationProfileCode],
    );

    if (profileResult.rows.length === 0) {
      throw new AppError('VALIDATION_ERROR', `Translation profile not found: ${translationProfileCode}`);
    }

    const profile = profileResult.rows[0];
    if (!profile.is_active) {
      throw new AppError('VALIDATION_ERROR', `Translation profile is not active: ${translationProfileCode}`);
    }

    // Create target version, translation run, and job in transaction
    // Use advisory lock to serialize concurrent translation admission for same source+profile
    let result: { targetVersionId: string; targetVersionNumber: number; run: { id: string; status: string }; job: { id: string; status: string; created_at: string } };
    try {
      result = await withTransaction(pgPool, async (client) => {
      // Advisory lock: serialize on hash of (trackId + profileId)
      // This prevents concurrent transactions from both computing MAX(version_number)
      const lockKey = Buffer.from(trackId + profile.id).reduce((h, b) => (h * 31 + b) | 0, 0);
      await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

      // Check if an active translation already exists for this source+profile
      const existingRun = await client.query(
        `SELECT tr.id, tr.status, tr.target_subtitle_version_id, sv.version_number, j.id as job_id
         FROM aidilam_app.translation_runs tr
         JOIN aidilam_app.subtitle_versions sv ON sv.id = tr.target_subtitle_version_id
         LEFT JOIN aidilam_app.jobs j ON j.id = tr.job_id
         WHERE tr.source_subtitle_version_id = $1 AND tr.translation_profile_id = $2
           AND tr.status IN ('requested', 'queued', 'running', 'succeeded')
         LIMIT 1`,
        [versionId, profile.id],
      );

      if (existingRun.rows.length > 0) {
        // Already exists — return it (idempotent)
        const e = existingRun.rows[0];
        return {
          run: { id: e.id, status: e.status },
          job: { id: e.job_id, status: 'existing', created_at: '' },
          targetVersionId: e.target_subtitle_version_id,
          targetVersionNumber: e.version_number,
          replayed: true,
        };
      }

      // Determine next version number for the track
      const nextVersionRes = await client.query(
        `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
         FROM aidilam_app.subtitle_versions
         WHERE subtitle_track_id = $1`,
        [trackId],
      );
      const nextVersion = nextVersionRes.rows[0].next_version;

      // Create target subtitle version
      const targetVersionRes = await client.query(
        `INSERT INTO aidilam_app.subtitle_versions
           (subtitle_track_id, version_number, parent_version_id, version_type,
            language_code, status, translation_profile_id, created_by)
         VALUES ($1, $2, $3, 'translated', $4, 'processing', $5, $6)
         RETURNING id`,
        [trackId, nextVersion, versionId, profile.target_language, profile.id, identity.actorId],
      );

      const targetVersionId = targetVersionRes.rows[0].id;

      // Create translation run
      const runRes = await client.query(
        `INSERT INTO aidilam_app.translation_runs
           (project_id, source_subtitle_version_id, target_subtitle_version_id,
            translation_profile_id, configuration_hash, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, status`,
        [projectId, versionId, targetVersionId, profile.id, profile.configuration_hash, identity.actorId],
      );

      const run = runRes.rows[0];

      // Create job
      const jobRes = await client.query(
        `INSERT INTO aidilam_app.jobs
           (project_id, job_type, priority, input_payload, queue_name)
         VALUES ($1, 'subtitle_translate', 0, $2, 'aidilam-jobs')
         RETURNING id, status, created_at`,
        [projectId, JSON.stringify({ translationRunId: run.id })],
      );

      const job = jobRes.rows[0];

      // Link job to run
      await client.query(
        `UPDATE aidilam_app.translation_runs SET job_id = $1, status = 'queued', updated_at = now()
         WHERE id = $2`,
        [job.id, run.id],
      );

      // Record job event
      await client.query(
        `INSERT INTO aidilam_app.job_events (job_id, event_type, payload) VALUES ($1, 'job_created', $2)`,
        [job.id, JSON.stringify({ jobType: 'subtitle_translate', translationRunId: run.id, profileCode: translationProfileCode })],
      );

      await recordAuditEvent({
        requestId: request.id,
        identity,
        action: 'subtitle_track.translate',
        resourceType: 'translation_run',
        resourceId: run.id,
        projectId,
        outcome: 'success',
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'],
        newValues: {
          profileCode: translationProfileCode,
          sourceVersionId: versionId,
          targetVersionId,
          jobId: job.id,
        },
      }, client);

      return { run, job, targetVersionId, targetVersionNumber: nextVersion, replayed: false };
    });
    } catch (err: unknown) {
      // Handle unique constraint race (belt-and-suspenders with advisory lock)
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') {
        const existing = await pgPool.query(
          `SELECT tr.id as run_id, tr.status, sv.id as version_id, sv.version_number, j.id as job_id
           FROM aidilam_app.translation_runs tr
           JOIN aidilam_app.subtitle_versions sv ON sv.id = tr.target_subtitle_version_id
           LEFT JOIN aidilam_app.jobs j ON j.id = tr.job_id
           WHERE tr.source_subtitle_version_id = $1 AND tr.translation_profile_id = $2
             AND tr.status IN ('requested', 'queued', 'running', 'succeeded')
           ORDER BY tr.created_at DESC LIMIT 1`,
          [versionId, profile.id],
        );
        if (existing.rows.length > 0) {
          const e = existing.rows[0];
          return reply.status(200).send({
            data: { translationRunId: e.run_id, targetVersionId: e.version_id, targetVersionNumber: e.version_number, status: e.status, jobId: e.job_id, profileCode: translationProfileCode },
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
          translationRunId: result.run.id,
          targetVersionId: result.targetVersionId,
          targetVersionNumber: result.targetVersionNumber,
          status: result.run.status,
          jobId: result.job.id,
          profileCode: translationProfileCode,
        },
        meta: { requestId: request.id, idempotencyReplayed: true },
      });
    }

    // Enqueue to Redis (best-effort)
    try {
      await jobQueue.add('subtitle_translate', {
        jobId: result.job.id,
        jobType: 'subtitle_translate',
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
        translationRunId: result.run.id,
        targetVersionId: result.targetVersionId,
        targetVersionNumber: result.targetVersionNumber,
        status: 'queued',
        jobId: result.job.id,
        profileCode: translationProfileCode,
      },
      meta: { requestId: request.id },
    });
  });

  // =========================================================================
  // DELETE /api/v1/projects/:projectId/subtitle-tracks/:trackId
  // Soft delete a subtitle track
  // =========================================================================
  app.delete('/api/v1/projects/:projectId/subtitle-tracks/:trackId', {
    schema: {
      tags: ['subtitles'],
      description: 'Soft delete a subtitle track',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, trackId } = request.params as { projectId: string; trackId: string };
    await requireProjectPermission(request, projectId, 'subtitles.delete');

    const identity = request.identity!;

    const trackResult = await pgPool.query(
      `SELECT id, status FROM aidilam_app.subtitle_tracks
       WHERE id = $1 AND project_id = $2 AND status != 'deleted'`,
      [trackId, projectId],
    );

    if (trackResult.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Subtitle track not found');
    }

    const previousStatus = trackResult.rows[0].status;

    await pgPool.query(
      `UPDATE aidilam_app.subtitle_tracks
       SET status = 'deleted', updated_at = now(), version = version + 1
       WHERE id = $1`,
      [trackId],
    );

    await recordAuditEvent({
      requestId: request.id,
      identity,
      action: 'subtitle_track.delete',
      resourceType: 'subtitle_track',
      resourceId: trackId,
      projectId,
      outcome: 'success',
      sourceIp: request.ip,
      userAgent: request.headers['user-agent'],
      previousValues: { status: previousStatus },
      newValues: { status: 'deleted' },
    });

    return {
      data: { trackId, status: 'deleted' },
      meta: { requestId: request.id },
    };
  });
}
