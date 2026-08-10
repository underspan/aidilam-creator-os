/**
 * Creator Dashboard Routes
 * AIDILAM-VIDEOMVP-004
 *
 * Self-contained internal dashboard served by the API.
 * Provides project-scoped video pipeline management without terminal access.
 */
import { FastifyInstance } from 'fastify';
import { pgPool } from '../../../infrastructure/database/index.js';
import { requireProjectPermission } from '../../security/domain/authorization.js';
import { recordAuditEvent } from '../../security/infrastructure/audit-events.js';
import { dashboardHtml } from './dashboard-html.js';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../../../config/index.js';

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
});

export async function dashboardRoutes(app: FastifyInstance) {

  // =========================================================================
  // GET /api/v1/projects/:projectId/dashboard
  // Project dashboard summary (JSON)
  // =========================================================================
  app.get('/api/v1/projects/:projectId/dashboard', {
    schema: { tags: ['dashboard'], security: [{ bearerAuth: [] }] },
  }, async (request) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'media.asset.read');

    const [jobCounts, assetCounts, recentJobs] = await Promise.all([
      pgPool.query(`
        SELECT status, count(*)::int as cnt
        FROM aidilam_app.jobs WHERE project_id = $1
        GROUP BY status`, [projectId]),
      pgPool.query(`
        SELECT media_kind, count(*)::int as cnt, coalesce(sum(size_bytes),0)::bigint as total_bytes
        FROM aidilam_app.assets WHERE project_id = $1 AND status = 'available'
        GROUP BY media_kind`, [projectId]),
      pgPool.query(`
        SELECT id, job_type, status, created_at, updated_at
        FROM aidilam_app.jobs WHERE project_id = $1
        ORDER BY created_at DESC LIMIT 20`, [projectId]),
    ]);

    const statusMap: Record<string, number> = {};
    for (const r of jobCounts.rows) statusMap[r.status] = r.cnt;

    const assetMap: Record<string, { count: number; bytes: number }> = {};
    for (const r of assetCounts.rows) assetMap[r.media_kind] = { count: r.cnt, bytes: Number(r.total_bytes) };

    return {
      data: {
        jobs: {
          total: Object.values(statusMap).reduce((a, b) => a + b, 0),
          queued: statusMap['queued'] || 0,
          running: statusMap['running'] || 0,
          succeeded: statusMap['succeeded'] || 0,
          failed: statusMap['failed'] || 0,
          cancelled: statusMap['cancelled'] || 0,
        },
        assets: assetMap,
        recentJobs: recentJobs.rows,
      },
    };
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/dashboard/ui
  // Full dashboard HTML page
  // =========================================================================
  app.get('/api/v1/projects/:projectId/dashboard/ui', {
    schema: { tags: ['dashboard'] },
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    // If token was passed as query param, the page JS will strip it.
    // The server does NOT read token from query — only from Authorization header.
    try {
      await requireProjectPermission(request, projectId, 'media.asset.read');
    } catch {
      reply.code(401).type('text/html')
        .header('Cache-Control', 'no-store')
        .header('X-Content-Type-Options', 'nosniff')
        .send(
          '<html><body style="background:#0a0a0f;color:#fff;font-family:sans-serif;padding:40px"><h1>Authentication Required</h1><p style="color:#888">This page requires authentication. The dashboard will prompt for credentials on load.</p><p style="margin-top:12px"><a href="'+ request.url +'" style="color:#818cf8">Reload to authenticate</a></p></body></html>'
        );
      return;
    }
    reply.type('text/html')
      .header('Cache-Control', 'no-store, no-cache, must-revalidate')
      .header('X-Content-Type-Options', 'nosniff')
      .header('X-Frame-Options', 'DENY')
      .header('Referrer-Policy', 'no-referrer')
      .header('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'")
      .send(dashboardHtml(projectId));
  });

  // =========================================================================
  // POST /api/v1/projects/:projectId/video-pipeline
  // Create a video pipeline job
  // =========================================================================
  app.post('/api/v1/projects/:projectId/video-pipeline', {
    schema: {
      tags: ['dashboard'],
      description: 'Create a one-click video pipeline job',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['sourceAssetId', 'idempotencyKey'],
        properties: {
          sourceAssetId: { type: 'string', format: 'uuid' },
          templateId: { type: 'string', format: 'uuid' },
          sourceLanguage: { type: 'string', default: 'zh' },
          targetLanguage: { type: 'string', default: 'vi' },
          voiceCode: { type: 'string', default: 'vi-VN-HoaiMyNeural' },
          outputWidth: { type: 'integer', default: 1080 },
          outputHeight: { type: 'integer', default: 1920 },
          idempotencyKey: { type: 'string', minLength: 8, maxLength: 128 },
        },
        additionalProperties: false,
      },
    },
  }, async (request) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'media.asset.manage');
    const identity = request.identity!;
    const body = request.body as {
      sourceAssetId: string;
      templateId?: string;
      sourceLanguage?: string;
      targetLanguage?: string;
      voiceCode?: string;
      outputWidth?: number;
      outputHeight?: number;
      idempotencyKey: string;
    };

    // Verify source asset
    const assetRes = await pgPool.query(
      `SELECT id FROM aidilam_app.assets WHERE id = $1 AND project_id = $2 AND status = 'available'`,
      [body.sourceAssetId, projectId]
    );
    if (assetRes.rows.length === 0) {
      return { error: { code: 'VALIDATION_ERROR', message: 'Source asset not found or unavailable' } };
    }

    // Resolve template if provided
    let templateId: string | null = null;
    let templateVersionId: string | null = null;
    let effectiveConfig: any = null;

    if (body.templateId) {
      const tmplRes = await pgPool.query(
        `SELECT td.id, td.status, tv.id as version_id, tv.config_json
         FROM aidilam_app.template_definitions td
         JOIN aidilam_app.template_versions tv ON tv.id = td.current_version_id
         WHERE td.id = $1 AND td.status = 'active'`,
        [body.templateId]
      );
      if (tmplRes.rows.length > 0) {
        templateId = tmplRes.rows[0].id;
        templateVersionId = tmplRes.rows[0].version_id;
        const tmplConfig = tmplRes.rows[0].config_json || {};
        // Merge template with user overrides
        effectiveConfig = {
          ...tmplConfig,
          language: { source: body.sourceLanguage || tmplConfig.language?.source || 'zh', target: body.targetLanguage || tmplConfig.language?.target || 'vi' },
          voice: { ...tmplConfig.voice, voice: body.voiceCode || tmplConfig.voice?.voice || 'vi-VN-HoaiMyNeural' },
          video: { ...tmplConfig.video, resolution: `${body.outputWidth || 1080}x${body.outputHeight || 1920}` },
        };
      }
    }

    // Build effective config (with or without template)
    if (!effectiveConfig) {
      effectiveConfig = {
        language: { source: body.sourceLanguage || 'zh', target: body.targetLanguage || 'vi' },
        voice: { voice: body.voiceCode || 'vi-VN-HoaiMyNeural' },
        video: { aspect_ratio: '9:16', resolution: `${body.outputWidth || 1080}x${body.outputHeight || 1920}` },
      };
    }

    // Idempotency check
    const existing = await pgPool.query(
      `SELECT id, status FROM aidilam_app.jobs WHERE project_id = $1 AND idempotency_key = $2`,
      [projectId, body.idempotencyKey]
    );
    if (existing.rows.length > 0) {
      return { data: { jobId: existing.rows[0].id, status: existing.rows[0].status, replayed: true } };
    }

    // Create job with template snapshot
    const jobRes = await pgPool.query(
      `INSERT INTO aidilam_app.jobs (project_id, job_type, status, idempotency_key, input_payload, template_id, template_version_id, effective_config_json)
       VALUES ($1, 'video_pipeline', 'queued', $2, $3, $4, $5, $6)
       RETURNING id, status, created_at`,
      [projectId, body.idempotencyKey, JSON.stringify({
        projectId,
        sourceAssetId: body.sourceAssetId,
        sourceLanguage: effectiveConfig.language?.source || 'zh',
        targetLanguage: effectiveConfig.language?.target || 'vi',
        voiceCode: effectiveConfig.voice?.voice || 'vi-VN-HoaiMyNeural',
        outputWidth: body.outputWidth || 1080,
        outputHeight: body.outputHeight || 1920,
      }), templateId, templateVersionId, effectiveConfig ? JSON.stringify(effectiveConfig) : null]
    );

    const job = jobRes.rows[0];

    // Enqueue to BullMQ
    await jobQueue.add('video_pipeline', {
      jobId: job.id,
      jobType: 'video_pipeline',
      projectId,
    }, {
      jobId: `pipeline-${job.id}`,
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    });

    // Audit
    await recordAuditEvent({
      identity,
      action: 'video_pipeline_created',
      resourceType: 'job',
      resourceId: job.id,
      projectId,
      outcome: 'success',
      metadata: { sourceAssetId: body.sourceAssetId, targetLanguage: body.targetLanguage || 'vi' },
    });

    return {
      data: {
        jobId: job.id,
        status: 'queued',
        createdAt: job.created_at,
        publishingTriggered: false,
      },
    };
  });
}
