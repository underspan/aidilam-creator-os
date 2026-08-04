/**
 * Render Routes — Video Render Pipeline API
 *
 * Provides endpoints for managing subtitle styles, render profiles,
 * render runs, render plans, and render usage/cost tracking.
 */

import { FastifyInstance } from 'fastify';
import { pgPool } from '../../../infrastructure/database/index.js';
import { AppError } from '../../../core/errors/index.js';
import { withTransaction } from '../../../core/transactions/index.js';
import { parsePagination } from '../../../core/types/index.js';
import { requirePermission, requireProjectPermission } from '../../security/domain/authorization.js';
import { recordAuditEvent } from '../../security/infrastructure/audit-events.js';
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

export async function renderRoutes(app: FastifyInstance) {
  // =========================================================================
  // GET /api/v1/projects/:projectId/subtitle-styles
  // List subtitle styles (project + global where project_id IS NULL)
  // =========================================================================
  app.get('/api/v1/projects/:projectId/subtitle-styles', {
    schema: {
      tags: ['render'],
      description: 'List subtitle styles for a project (includes global styles)',
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
    await requireProjectPermission(request, projectId, 'render.subtitle_style.read');

    const query = request.query as { page?: string; pageSize?: string };
    const { page, pageSize } = parsePagination(query);
    const offset = (page - 1) * pageSize;

    const [countRes, dataRes] = await Promise.all([
      pgPool.query(
        `SELECT count(*) FROM aidilam_app.subtitle_styles
         WHERE (project_id = $1 OR project_id IS NULL) AND is_active = true`,
        [projectId],
      ),
      pgPool.query(
        `SELECT id, project_id, name, font_family, font_size, font_weight,
                primary_color, outline_color, outline_width, shadow, alignment,
                margin_left, margin_right, margin_vertical, background_enabled,
                background_color, max_lines, safe_area_percent, validation_only,
                is_active, version, created_at, updated_at
         FROM aidilam_app.subtitle_styles
         WHERE (project_id = $1 OR project_id IS NULL) AND is_active = true
         ORDER BY project_id IS NULL ASC, name
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
  // POST /api/v1/projects/:projectId/subtitle-styles
  // Create a project subtitle style
  // =========================================================================
  app.post('/api/v1/projects/:projectId/subtitle-styles', {
    schema: {
      tags: ['render'],
      description: 'Create a subtitle style for a project',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name', 'fontFamily', 'fontSize'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 200 },
          fontFamily: { type: 'string', minLength: 1, maxLength: 100 },
          fontSize: { type: 'integer', minimum: 8, maximum: 200 },
          fontWeight: { type: 'string', maxLength: 20 },
          primaryColor: { type: 'string', maxLength: 20 },
          outlineColor: { type: 'string', maxLength: 20 },
          outlineWidth: { type: 'number', minimum: 0 },
          shadow: { type: 'string', maxLength: 100 },
          alignment: { type: 'integer', minimum: 1, maximum: 9 },
          marginLeft: { type: 'integer', minimum: 0 },
          marginRight: { type: 'integer', minimum: 0 },
          marginVertical: { type: 'integer', minimum: 0 },
          backgroundEnabled: { type: 'boolean' },
          backgroundColor: { type: 'string', maxLength: 20 },
          maxLines: { type: 'integer', minimum: 1, maximum: 10 },
          safeAreaPercent: { type: 'number', minimum: 0, maximum: 100 },
          validationOnly: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'render.subtitle_style.manage');

    const body = request.body as {
      name: string;
      fontFamily: string;
      fontSize: number;
      fontWeight?: string;
      primaryColor?: string;
      outlineColor?: string;
      outlineWidth?: number;
      shadow?: string;
      alignment?: number;
      marginLeft?: number;
      marginRight?: number;
      marginVertical?: number;
      backgroundEnabled?: boolean;
      backgroundColor?: string;
      maxLines?: number;
      safeAreaPercent?: number;
      validationOnly?: boolean;
    };

    const identity = request.identity!;

    const result = await withTransaction(pgPool, async (client) => {
      const insertResult = await client.query(
        `INSERT INTO aidilam_app.subtitle_styles
           (project_id, name, font_family, font_size, font_weight, primary_color,
            outline_color, outline_width, shadow, alignment, margin_left, margin_right,
            margin_vertical, background_enabled, background_color, max_lines,
            safe_area_percent, validation_only)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING id, version, created_at`,
        [
          projectId, body.name, body.fontFamily, body.fontSize,
          body.fontWeight ?? 'normal', body.primaryColor ?? '#FFFFFF',
          body.outlineColor ?? '#000000', body.outlineWidth ?? 2,
          body.shadow ?? null, body.alignment ?? 2,
          body.marginLeft ?? 10, body.marginRight ?? 10,
          body.marginVertical ?? 20, body.backgroundEnabled ?? false,
          body.backgroundColor ?? null, body.maxLines ?? 2,
          body.safeAreaPercent ?? 90, body.validationOnly ?? false,
        ],
      );

      const style = insertResult.rows[0];

      await recordAuditEvent({
        requestId: request.id,
        identity,
        action: 'subtitle_style.create',
        resourceType: 'subtitle_style',
        resourceId: style.id,
        projectId,
        outcome: 'success',
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'],
        newValues: { name: body.name, fontFamily: body.fontFamily },
      }, client);

      return style;
    });

    reply.status(201).send({
      data: {
        id: result.id,
        name: body.name,
        version: result.version,
        createdAt: result.created_at,
      },
      meta: { requestId: request.id },
    });
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/subtitle-styles/:styleId
  // Get a subtitle style
  // =========================================================================
  app.get('/api/v1/projects/:projectId/subtitle-styles/:styleId', {
    schema: {
      tags: ['render'],
      description: 'Get a subtitle style by ID',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, styleId } = request.params as { projectId: string; styleId: string };
    await requireProjectPermission(request, projectId, 'render.subtitle_style.read');

    const result = await pgPool.query(
      `SELECT id, project_id, name, font_family, font_size, font_weight,
              primary_color, outline_color, outline_width, shadow, alignment,
              margin_left, margin_right, margin_vertical, background_enabled,
              background_color, max_lines, safe_area_percent, validation_only,
              is_active, version, created_at, updated_at
       FROM aidilam_app.subtitle_styles
       WHERE id = $1 AND (project_id = $2 OR project_id IS NULL)`,
      [styleId, projectId],
    );

    if (result.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Subtitle style not found');
    }

    return {
      data: result.rows[0],
      meta: { requestId: request.id },
    };
  });

  // =========================================================================
  // PUT /api/v1/projects/:projectId/subtitle-styles/:styleId
  // Update a subtitle style (optimistic versioning)
  // =========================================================================
  app.put('/api/v1/projects/:projectId/subtitle-styles/:styleId', {
    schema: {
      tags: ['render'],
      description: 'Update a subtitle style (optimistic versioning via version field)',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['version'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 200 },
          fontFamily: { type: 'string', minLength: 1, maxLength: 100 },
          fontSize: { type: 'integer', minimum: 8, maximum: 200 },
          fontWeight: { type: 'string', maxLength: 20 },
          primaryColor: { type: 'string', maxLength: 20 },
          outlineColor: { type: 'string', maxLength: 20 },
          outlineWidth: { type: 'number', minimum: 0 },
          shadow: { type: 'string', maxLength: 100 },
          alignment: { type: 'integer', minimum: 1, maximum: 9 },
          marginLeft: { type: 'integer', minimum: 0 },
          marginRight: { type: 'integer', minimum: 0 },
          marginVertical: { type: 'integer', minimum: 0 },
          backgroundEnabled: { type: 'boolean' },
          backgroundColor: { type: 'string', maxLength: 20 },
          maxLines: { type: 'integer', minimum: 1, maximum: 10 },
          safeAreaPercent: { type: 'number', minimum: 0, maximum: 100 },
          validationOnly: { type: 'boolean' },
          isActive: { type: 'boolean' },
          version: { type: 'integer', minimum: 1 },
        },
        additionalProperties: false,
      },
    },
  }, async (request) => {
    const { projectId, styleId } = request.params as { projectId: string; styleId: string };
    await requireProjectPermission(request, projectId, 'render.subtitle_style.manage');

    const body = request.body as {
      name?: string;
      fontFamily?: string;
      fontSize?: number;
      fontWeight?: string;
      primaryColor?: string;
      outlineColor?: string;
      outlineWidth?: number;
      shadow?: string;
      alignment?: number;
      marginLeft?: number;
      marginRight?: number;
      marginVertical?: number;
      backgroundEnabled?: boolean;
      backgroundColor?: string;
      maxLines?: number;
      safeAreaPercent?: number;
      validationOnly?: boolean;
      isActive?: boolean;
      version: number;
    };

    const identity = request.identity!;

    const result = await withTransaction(pgPool, async (client) => {
      // Verify style belongs to this project (cannot update global styles)
      const existing = await client.query(
        `SELECT id, version FROM aidilam_app.subtitle_styles
         WHERE id = $1 AND project_id = $2`,
        [styleId, projectId],
      );

      if (existing.rows.length === 0) {
        throw new AppError('RESOURCE_NOT_FOUND', 'Subtitle style not found in this project');
      }

      if (existing.rows[0].version !== body.version) {
        throw new AppError('CONFLICT', 'Style has been modified by another request. Reload and try again.');
      }

      // Build dynamic UPDATE
      const setClauses: string[] = ['version = version + 1', 'updated_at = now()'];
      const updateParams: unknown[] = [];
      let pIdx = 1;

      if (body.name !== undefined) { setClauses.push(`name = $${pIdx++}`); updateParams.push(body.name); }
      if (body.fontFamily !== undefined) { setClauses.push(`font_family = $${pIdx++}`); updateParams.push(body.fontFamily); }
      if (body.fontSize !== undefined) { setClauses.push(`font_size = $${pIdx++}`); updateParams.push(body.fontSize); }
      if (body.fontWeight !== undefined) { setClauses.push(`font_weight = $${pIdx++}`); updateParams.push(body.fontWeight); }
      if (body.primaryColor !== undefined) { setClauses.push(`primary_color = $${pIdx++}`); updateParams.push(body.primaryColor); }
      if (body.outlineColor !== undefined) { setClauses.push(`outline_color = $${pIdx++}`); updateParams.push(body.outlineColor); }
      if (body.outlineWidth !== undefined) { setClauses.push(`outline_width = $${pIdx++}`); updateParams.push(body.outlineWidth); }
      if (body.shadow !== undefined) { setClauses.push(`shadow = $${pIdx++}`); updateParams.push(body.shadow); }
      if (body.alignment !== undefined) { setClauses.push(`alignment = $${pIdx++}`); updateParams.push(body.alignment); }
      if (body.marginLeft !== undefined) { setClauses.push(`margin_left = $${pIdx++}`); updateParams.push(body.marginLeft); }
      if (body.marginRight !== undefined) { setClauses.push(`margin_right = $${pIdx++}`); updateParams.push(body.marginRight); }
      if (body.marginVertical !== undefined) { setClauses.push(`margin_vertical = $${pIdx++}`); updateParams.push(body.marginVertical); }
      if (body.backgroundEnabled !== undefined) { setClauses.push(`background_enabled = $${pIdx++}`); updateParams.push(body.backgroundEnabled); }
      if (body.backgroundColor !== undefined) { setClauses.push(`background_color = $${pIdx++}`); updateParams.push(body.backgroundColor); }
      if (body.maxLines !== undefined) { setClauses.push(`max_lines = $${pIdx++}`); updateParams.push(body.maxLines); }
      if (body.safeAreaPercent !== undefined) { setClauses.push(`safe_area_percent = $${pIdx++}`); updateParams.push(body.safeAreaPercent); }
      if (body.validationOnly !== undefined) { setClauses.push(`validation_only = $${pIdx++}`); updateParams.push(body.validationOnly); }
      if (body.isActive !== undefined) { setClauses.push(`is_active = $${pIdx++}`); updateParams.push(body.isActive); }

      updateParams.push(styleId);
      updateParams.push(projectId);
      updateParams.push(body.version);

      const updateResult = await client.query(
        `UPDATE aidilam_app.subtitle_styles
         SET ${setClauses.join(', ')}
         WHERE id = $${pIdx++} AND project_id = $${pIdx++} AND version = $${pIdx++}
         RETURNING id, version, updated_at`,
        updateParams,
      );

      if (updateResult.rows.length === 0) {
        throw new AppError('CONFLICT', 'Style update failed due to concurrent modification');
      }

      await recordAuditEvent({
        requestId: request.id,
        identity,
        action: 'subtitle_style.update',
        resourceType: 'subtitle_style',
        resourceId: styleId,
        projectId,
        outcome: 'success',
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'],
        newValues: { ...body },
      }, client);

      return updateResult.rows[0];
    });

    return {
      data: { id: result.id, version: result.version, updatedAt: result.updated_at },
      meta: { requestId: request.id },
    };
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/render-profiles
  // List render profiles for a project
  // =========================================================================
  app.get('/api/v1/projects/:projectId/render-profiles', {
    schema: {
      tags: ['render'],
      description: 'List render profiles for a project',
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
    await requireProjectPermission(request, projectId, 'render.profile.read');

    const query = request.query as { page?: string; pageSize?: string };
    const { page, pageSize } = parsePagination(query);
    const offset = (page - 1) * pageSize;

    const [countRes, dataRes] = await Promise.all([
      pgPool.query(
        `SELECT count(*) FROM aidilam_app.render_profiles WHERE project_id = $1`,
        [projectId],
      ),
      pgPool.query(
        `SELECT rp.id, rp.name, rp.mode, rp.video_codec, rp.audio_codec,
                rp.container_format, rp.width, rp.height, rp.aspect_ratio,
                rp.frame_rate, rp.video_bitrate, rp.audio_bitrate,
                rp.audio_sample_rate, rp.audio_channels, rp.subtitle_style_id,
                rp.original_audio_policy, rp.original_audio_gain, rp.tts_audio_gain,
                rp.normalization_policy, rp.video_transform_config, rp.watermark_config,
                rp.output_naming_policy, rp.validation_only, rp.is_default,
                rp.version, rp.created_by, rp.created_at, rp.updated_at,
                ss.name AS subtitle_style_name
         FROM aidilam_app.render_profiles rp
         LEFT JOIN aidilam_app.subtitle_styles ss ON ss.id = rp.subtitle_style_id
         WHERE rp.project_id = $1
         ORDER BY rp.is_default DESC, rp.name
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
  // POST /api/v1/projects/:projectId/render-profiles
  // Create a render profile
  // =========================================================================
  app.post('/api/v1/projects/:projectId/render-profiles', {
    schema: {
      tags: ['render'],
      description: 'Create a render profile for a project',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name', 'mode', 'videoCodec', 'audioCodec', 'containerFormat'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 200 },
          mode: { type: 'string', enum: ['subtitle_only', 'tts_replace_audio', 'tts_mix_audio', 'video_transform_only', 'subtitle_and_tts'] },
          videoCodec: { type: 'string', maxLength: 50 },
          audioCodec: { type: 'string', maxLength: 50 },
          containerFormat: { type: 'string', maxLength: 20 },
          width: { type: 'integer', minimum: 1 },
          height: { type: 'integer', minimum: 1 },
          aspectRatio: { type: 'string', maxLength: 20 },
          frameRate: { type: 'number', minimum: 1 },
          videoBitrate: { type: 'string', maxLength: 20 },
          audioBitrate: { type: 'string', maxLength: 20 },
          audioSampleRate: { type: 'integer', minimum: 8000, maximum: 96000 },
          audioChannels: { type: 'integer', minimum: 1, maximum: 8 },
          subtitleStyleId: { type: 'string', format: 'uuid' },
          originalAudioPolicy: { type: 'string', maxLength: 50 },
          originalAudioGain: { type: 'number' },
          ttsAudioGain: { type: 'number' },
          normalizationPolicy: { type: 'string', maxLength: 50 },
          videoTransformConfig: { type: 'object' },
          watermarkConfig: { type: 'object' },
          outputNamingPolicy: { type: 'string', maxLength: 200 },
          validationOnly: { type: 'boolean' },
          isDefault: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'render.profile.manage');

    const body = request.body as {
      name: string;
      mode: string;
      videoCodec: string;
      audioCodec: string;
      containerFormat: string;
      width?: number;
      height?: number;
      aspectRatio?: string;
      frameRate?: number;
      videoBitrate?: string;
      audioBitrate?: string;
      audioSampleRate?: number;
      audioChannels?: number;
      subtitleStyleId?: string;
      originalAudioPolicy?: string;
      originalAudioGain?: number;
      ttsAudioGain?: number;
      normalizationPolicy?: string;
      videoTransformConfig?: Record<string, unknown>;
      watermarkConfig?: Record<string, unknown>;
      outputNamingPolicy?: string;
      validationOnly?: boolean;
      isDefault?: boolean;
    };

    const identity = request.identity!;

    // Validate mode
    const allowedModes = ['subtitle_only', 'tts_replace_audio', 'tts_mix_audio', 'video_transform_only', 'subtitle_and_tts'];
    if (!allowedModes.includes(body.mode)) {
      throw new AppError('VALIDATION_ERROR', `Invalid mode. Allowed: ${allowedModes.join(', ')}`);
    }

    // Validate subtitle_style_id belongs to project or is global
    if (body.subtitleStyleId) {
      const styleResult = await pgPool.query(
        `SELECT id FROM aidilam_app.subtitle_styles
         WHERE id = $1 AND (project_id = $2 OR project_id IS NULL) AND is_active = true`,
        [body.subtitleStyleId, projectId],
      );

      if (styleResult.rows.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'Subtitle style not found or does not belong to this project');
      }
    }

    const result = await withTransaction(pgPool, async (client) => {
      // If setting as default, unset other defaults in this project
      if (body.isDefault) {
        await client.query(
          `UPDATE aidilam_app.render_profiles SET is_default = false, updated_at = now()
           WHERE project_id = $1 AND is_default = true`,
          [projectId],
        );
      }

      const insertResult = await client.query(
        `INSERT INTO aidilam_app.render_profiles
           (project_id, name, mode, video_codec, audio_codec, container_format,
            width, height, aspect_ratio, frame_rate, video_bitrate, audio_bitrate,
            audio_sample_rate, audio_channels, subtitle_style_id,
            original_audio_policy, original_audio_gain, tts_audio_gain,
            normalization_policy, video_transform_config, watermark_config,
            output_naming_policy, validation_only, is_default, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
         RETURNING id, version, created_at`,
        [
          projectId, body.name, body.mode, body.videoCodec, body.audioCodec,
          body.containerFormat, body.width ?? null, body.height ?? null,
          body.aspectRatio ?? null, body.frameRate ?? null,
          body.videoBitrate ?? null, body.audioBitrate ?? null,
          body.audioSampleRate ?? 48000, body.audioChannels ?? 2,
          body.subtitleStyleId ?? null, body.originalAudioPolicy ?? 'preserve',
          body.originalAudioGain ?? 1.0, body.ttsAudioGain ?? 1.0,
          body.normalizationPolicy ?? 'loudnorm',
          body.videoTransformConfig ? JSON.stringify(body.videoTransformConfig) : '{}',
          body.watermarkConfig ? JSON.stringify(body.watermarkConfig) : '{}',
          body.outputNamingPolicy ?? 'auto', body.validationOnly ?? false,
          body.isDefault ?? false, identity.actorId,
        ],
      );

      const profile = insertResult.rows[0];

      await recordAuditEvent({
        requestId: request.id,
        identity,
        action: 'render_profile.create',
        resourceType: 'render_profile',
        resourceId: profile.id,
        projectId,
        outcome: 'success',
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'],
        newValues: { name: body.name, mode: body.mode },
      }, client);

      return profile;
    });

    reply.status(201).send({
      data: {
        id: result.id,
        name: body.name,
        mode: body.mode,
        version: result.version,
        createdAt: result.created_at,
      },
      meta: { requestId: request.id },
    });
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/render-profiles/:profileId
  // Get a render profile
  // =========================================================================
  app.get('/api/v1/projects/:projectId/render-profiles/:profileId', {
    schema: {
      tags: ['render'],
      description: 'Get a render profile by ID',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, profileId } = request.params as { projectId: string; profileId: string };
    await requireProjectPermission(request, projectId, 'render.profile.read');

    const result = await pgPool.query(
      `SELECT rp.id, rp.name, rp.mode, rp.video_codec, rp.audio_codec,
              rp.container_format, rp.width, rp.height, rp.aspect_ratio,
              rp.frame_rate, rp.video_bitrate, rp.audio_bitrate,
              rp.audio_sample_rate, rp.audio_channels, rp.subtitle_style_id,
              rp.original_audio_policy, rp.original_audio_gain, rp.tts_audio_gain,
              rp.normalization_policy, rp.video_transform_config, rp.watermark_config,
              rp.output_naming_policy, rp.validation_only, rp.is_default,
              rp.version, rp.created_by, rp.created_at, rp.updated_at,
              ss.name AS subtitle_style_name
       FROM aidilam_app.render_profiles rp
       LEFT JOIN aidilam_app.subtitle_styles ss ON ss.id = rp.subtitle_style_id
       WHERE rp.id = $1 AND rp.project_id = $2`,
      [profileId, projectId],
    );

    if (result.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Render profile not found');
    }

    return {
      data: result.rows[0],
      meta: { requestId: request.id },
    };
  });

  // =========================================================================
  // PUT /api/v1/projects/:projectId/render-profiles/:profileId
  // Update a render profile (optimistic versioning)
  // =========================================================================
  app.put('/api/v1/projects/:projectId/render-profiles/:profileId', {
    schema: {
      tags: ['render'],
      description: 'Update a render profile (optimistic versioning via version field)',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['version'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 200 },
          mode: { type: 'string', enum: ['subtitle_only', 'tts_replace_audio', 'tts_mix_audio', 'video_transform_only', 'subtitle_and_tts'] },
          videoCodec: { type: 'string', maxLength: 50 },
          audioCodec: { type: 'string', maxLength: 50 },
          containerFormat: { type: 'string', maxLength: 20 },
          width: { type: 'integer', minimum: 1 },
          height: { type: 'integer', minimum: 1 },
          aspectRatio: { type: 'string', maxLength: 20 },
          frameRate: { type: 'number', minimum: 1 },
          videoBitrate: { type: 'string', maxLength: 20 },
          audioBitrate: { type: 'string', maxLength: 20 },
          audioSampleRate: { type: 'integer', minimum: 8000, maximum: 96000 },
          audioChannels: { type: 'integer', minimum: 1, maximum: 8 },
          subtitleStyleId: { type: 'string', format: 'uuid' },
          originalAudioPolicy: { type: 'string', maxLength: 50 },
          originalAudioGain: { type: 'number' },
          ttsAudioGain: { type: 'number' },
          normalizationPolicy: { type: 'string', maxLength: 50 },
          videoTransformConfig: { type: 'object' },
          watermarkConfig: { type: 'object' },
          outputNamingPolicy: { type: 'string', maxLength: 200 },
          validationOnly: { type: 'boolean' },
          isDefault: { type: 'boolean' },
          version: { type: 'integer', minimum: 1 },
        },
        additionalProperties: false,
      },
    },
  }, async (request) => {
    const { projectId, profileId } = request.params as { projectId: string; profileId: string };
    await requireProjectPermission(request, projectId, 'render.profile.manage');

    const body = request.body as {
      name?: string;
      mode?: string;
      videoCodec?: string;
      audioCodec?: string;
      containerFormat?: string;
      width?: number;
      height?: number;
      aspectRatio?: string;
      frameRate?: number;
      videoBitrate?: string;
      audioBitrate?: string;
      audioSampleRate?: number;
      audioChannels?: number;
      subtitleStyleId?: string;
      originalAudioPolicy?: string;
      originalAudioGain?: number;
      ttsAudioGain?: number;
      normalizationPolicy?: string;
      videoTransformConfig?: Record<string, unknown>;
      watermarkConfig?: Record<string, unknown>;
      outputNamingPolicy?: string;
      validationOnly?: boolean;
      isDefault?: boolean;
      version: number;
    };

    const identity = request.identity!;

    // Validate mode if provided
    if (body.mode) {
      const allowedModes = ['subtitle_only', 'tts_replace_audio', 'tts_mix_audio', 'video_transform_only', 'subtitle_and_tts'];
      if (!allowedModes.includes(body.mode)) {
        throw new AppError('VALIDATION_ERROR', `Invalid mode. Allowed: ${allowedModes.join(', ')}`);
      }
    }

    // Validate subtitle_style_id if provided
    if (body.subtitleStyleId) {
      const styleResult = await pgPool.query(
        `SELECT id FROM aidilam_app.subtitle_styles
         WHERE id = $1 AND (project_id = $2 OR project_id IS NULL) AND is_active = true`,
        [body.subtitleStyleId, projectId],
      );

      if (styleResult.rows.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'Subtitle style not found or does not belong to this project');
      }
    }

    const result = await withTransaction(pgPool, async (client) => {
      const existing = await client.query(
        `SELECT id, version FROM aidilam_app.render_profiles
         WHERE id = $1 AND project_id = $2`,
        [profileId, projectId],
      );

      if (existing.rows.length === 0) {
        throw new AppError('RESOURCE_NOT_FOUND', 'Render profile not found');
      }

      if (existing.rows[0].version !== body.version) {
        throw new AppError('CONFLICT', 'Profile has been modified by another request. Reload and try again.');
      }

      // If setting as default, unset other defaults
      if (body.isDefault) {
        await client.query(
          `UPDATE aidilam_app.render_profiles SET is_default = false, updated_at = now()
           WHERE project_id = $1 AND is_default = true AND id != $2`,
          [projectId, profileId],
        );
      }

      // Build dynamic UPDATE
      const setClauses: string[] = ['version = version + 1', 'updated_at = now()'];
      const updateParams: unknown[] = [];
      let pIdx = 1;

      if (body.name !== undefined) { setClauses.push(`name = $${pIdx++}`); updateParams.push(body.name); }
      if (body.mode !== undefined) { setClauses.push(`mode = $${pIdx++}`); updateParams.push(body.mode); }
      if (body.videoCodec !== undefined) { setClauses.push(`video_codec = $${pIdx++}`); updateParams.push(body.videoCodec); }
      if (body.audioCodec !== undefined) { setClauses.push(`audio_codec = $${pIdx++}`); updateParams.push(body.audioCodec); }
      if (body.containerFormat !== undefined) { setClauses.push(`container_format = $${pIdx++}`); updateParams.push(body.containerFormat); }
      if (body.width !== undefined) { setClauses.push(`width = $${pIdx++}`); updateParams.push(body.width); }
      if (body.height !== undefined) { setClauses.push(`height = $${pIdx++}`); updateParams.push(body.height); }
      if (body.aspectRatio !== undefined) { setClauses.push(`aspect_ratio = $${pIdx++}`); updateParams.push(body.aspectRatio); }
      if (body.frameRate !== undefined) { setClauses.push(`frame_rate = $${pIdx++}`); updateParams.push(body.frameRate); }
      if (body.videoBitrate !== undefined) { setClauses.push(`video_bitrate = $${pIdx++}`); updateParams.push(body.videoBitrate); }
      if (body.audioBitrate !== undefined) { setClauses.push(`audio_bitrate = $${pIdx++}`); updateParams.push(body.audioBitrate); }
      if (body.audioSampleRate !== undefined) { setClauses.push(`audio_sample_rate = $${pIdx++}`); updateParams.push(body.audioSampleRate); }
      if (body.audioChannels !== undefined) { setClauses.push(`audio_channels = $${pIdx++}`); updateParams.push(body.audioChannels); }
      if (body.subtitleStyleId !== undefined) { setClauses.push(`subtitle_style_id = $${pIdx++}`); updateParams.push(body.subtitleStyleId); }
      if (body.originalAudioPolicy !== undefined) { setClauses.push(`original_audio_policy = $${pIdx++}`); updateParams.push(body.originalAudioPolicy); }
      if (body.originalAudioGain !== undefined) { setClauses.push(`original_audio_gain = $${pIdx++}`); updateParams.push(body.originalAudioGain); }
      if (body.ttsAudioGain !== undefined) { setClauses.push(`tts_audio_gain = $${pIdx++}`); updateParams.push(body.ttsAudioGain); }
      if (body.normalizationPolicy !== undefined) { setClauses.push(`normalization_policy = $${pIdx++}`); updateParams.push(body.normalizationPolicy); }
      if (body.videoTransformConfig !== undefined) { setClauses.push(`video_transform_config = $${pIdx++}`); updateParams.push(JSON.stringify(body.videoTransformConfig)); }
      if (body.watermarkConfig !== undefined) { setClauses.push(`watermark_config = $${pIdx++}`); updateParams.push(JSON.stringify(body.watermarkConfig)); }
      if (body.outputNamingPolicy !== undefined) { setClauses.push(`output_naming_policy = $${pIdx++}`); updateParams.push(body.outputNamingPolicy); }
      if (body.validationOnly !== undefined) { setClauses.push(`validation_only = $${pIdx++}`); updateParams.push(body.validationOnly); }
      if (body.isDefault !== undefined) { setClauses.push(`is_default = $${pIdx++}`); updateParams.push(body.isDefault); }

      updateParams.push(profileId);
      updateParams.push(projectId);
      updateParams.push(body.version);

      const updateResult = await client.query(
        `UPDATE aidilam_app.render_profiles
         SET ${setClauses.join(', ')}
         WHERE id = $${pIdx++} AND project_id = $${pIdx++} AND version = $${pIdx++}
         RETURNING id, version, updated_at`,
        updateParams,
      );

      if (updateResult.rows.length === 0) {
        throw new AppError('CONFLICT', 'Profile update failed due to concurrent modification');
      }

      await recordAuditEvent({
        requestId: request.id,
        identity,
        action: 'render_profile.update',
        resourceType: 'render_profile',
        resourceId: profileId,
        projectId,
        outcome: 'success',
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'],
        newValues: { ...body },
      }, client);

      return updateResult.rows[0];
    });

    return {
      data: { id: result.id, version: result.version, updatedAt: result.updated_at },
      meta: { requestId: request.id },
    };
  });

  // =========================================================================
  // POST /api/v1/projects/:projectId/render-runs
  // Create a render run
  // =========================================================================
  app.post('/api/v1/projects/:projectId/render-runs', {
    schema: {
      tags: ['render'],
      description: 'Create a render run for a project',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['sourceVideoAssetId', 'renderProfileId', 'idempotencyKey'],
        properties: {
          sourceVideoAssetId: { type: 'string', format: 'uuid' },
          subtitleVersionId: { type: 'string', format: 'uuid' },
          ttsRunId: { type: 'string', format: 'uuid' },
          renderProfileId: { type: 'string', format: 'uuid' },
          idempotencyKey: { type: 'string', minLength: 8, maxLength: 128 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'render.run.create');

    const body = request.body as {
      sourceVideoAssetId: string;
      subtitleVersionId?: string;
      ttsRunId?: string;
      renderProfileId: string;
      idempotencyKey: string;
    };

    const identity = request.identity!;

    // Validate source video belongs to project and status='available'
    const videoResult = await pgPool.query(
      `SELECT id FROM aidilam_app.assets
       WHERE id = $1 AND project_id = $2 AND status = 'available'`,
      [body.sourceVideoAssetId, projectId],
    );

    if (videoResult.rows.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Source video asset not found, does not belong to project, or is not available');
    }

    // Validate subtitle version if provided
    if (body.subtitleVersionId) {
      const svResult = await pgPool.query(
        `SELECT sv.id FROM aidilam_app.subtitle_versions sv
         JOIN aidilam_app.subtitle_tracks st ON st.id = sv.subtitle_track_id
         WHERE sv.id = $1 AND st.project_id = $2 AND sv.status IN ('approved', 'ready')`,
        [body.subtitleVersionId, projectId],
      );

      if (svResult.rows.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'Subtitle version not found, does not belong to project, or status is not approved/ready');
      }
    }

    // Validate TTS run if provided
    let ttsNarrationAssetId: string | null = null;
    if (body.ttsRunId) {
      const ttsResult = await pgPool.query(
        `SELECT id, output_asset_id FROM aidilam_app.tts_runs
         WHERE id = $1 AND project_id = $2 AND status = 'succeeded'`,
        [body.ttsRunId, projectId],
      );

      if (ttsResult.rows.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'TTS run not found, does not belong to project, or has not succeeded');
      }

      ttsNarrationAssetId = ttsResult.rows[0].output_asset_id;
    }

    // Validate render profile belongs to project
    const profileResult = await pgPool.query(
      `SELECT id FROM aidilam_app.render_profiles
       WHERE id = $1 AND project_id = $2`,
      [body.renderProfileId, projectId],
    );

    if (profileResult.rows.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Render profile not found or does not belong to project');
    }

    let result: { run: { id: string; status: string }; job: { id: string; status: string; created_at: string }; replayed?: boolean };

    try {
      result = await withTransaction(pgPool, async (client) => {
        // Advisory lock on (projectId + idempotencyKey hash)
        const lockKey = Buffer.from(projectId + body.idempotencyKey).reduce((h, b) => (h * 31 + b) | 0, 0);
        await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

        // Check for existing active run with same idempotency key
        const existingRun = await client.query(
          `SELECT rr.id, rr.status, rr.job_id
           FROM aidilam_app.render_runs rr
           WHERE rr.idempotency_key = $1 AND rr.project_id = $2
             AND rr.status NOT IN ('failed', 'cancelled')
           LIMIT 1`,
          [body.idempotencyKey, projectId],
        );

        if (existingRun.rows.length > 0) {
          const e = existingRun.rows[0];
          return {
            run: { id: e.id, status: e.status },
            job: { id: e.job_id, status: 'existing', created_at: '' },
            replayed: true,
          };
        }

        // Create render_run
        const runResult = await client.query(
          `INSERT INTO aidilam_app.render_runs
             (project_id, source_video_asset_id, subtitle_version_id, tts_run_id,
              tts_narration_asset_id, render_profile_id, idempotency_key, requested_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, status`,
          [
            projectId, body.sourceVideoAssetId, body.subtitleVersionId ?? null,
            body.ttsRunId ?? null, ttsNarrationAssetId, body.renderProfileId,
            body.idempotencyKey, identity.actorId,
          ],
        );

        const run = runResult.rows[0];

        // Create job
        const jobResult = await client.query(
          `INSERT INTO aidilam_app.jobs
             (project_id, job_type, priority, input_payload, queue_name)
           VALUES ($1, 'video_render', 0, $2, 'aidilam-jobs')
           RETURNING id, status, created_at`,
          [projectId, JSON.stringify({
            renderRunId: run.id,
            sourceVideoAssetId: body.sourceVideoAssetId,
            subtitleVersionId: body.subtitleVersionId ?? null,
            ttsRunId: body.ttsRunId ?? null,
            renderProfileId: body.renderProfileId,
          })],
        );

        const job = jobResult.rows[0];

        // Link job to run
        await client.query(
          `UPDATE aidilam_app.render_runs SET job_id = $1, status = 'queued', updated_at = now()
           WHERE id = $2`,
          [job.id, run.id],
        );

        // Record job event
        await client.query(
          `INSERT INTO aidilam_app.job_events (job_id, event_type, payload) VALUES ($1, 'job_created', $2)`,
          [job.id, JSON.stringify({ jobType: 'video_render', renderRunId: run.id })],
        );

        // Ensure render_budget entry exists for project
        await client.query(
          `INSERT INTO aidilam_app.render_budgets (project_id)
           VALUES ($1)
           ON CONFLICT (project_id) DO NOTHING`,
          [projectId],
        );

        await recordAuditEvent({
          requestId: request.id,
          identity,
          action: 'render_run.create',
          resourceType: 'render_run',
          resourceId: run.id,
          projectId,
          outcome: 'success',
          sourceIp: request.ip,
          userAgent: request.headers['user-agent'],
          newValues: {
            sourceVideoAssetId: body.sourceVideoAssetId,
            renderProfileId: body.renderProfileId,
            idempotencyKey: body.idempotencyKey,
            jobId: job.id,
          },
        }, client);

        return { run, job, replayed: false };
      });
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') {
        // Unique constraint race — find existing
        const existing = await pgPool.query(
          `SELECT id, status FROM aidilam_app.render_runs
           WHERE idempotency_key = $1 AND project_id = $2
             AND status NOT IN ('failed', 'cancelled')
           LIMIT 1`,
          [body.idempotencyKey, projectId],
        );
        if (existing.rows.length > 0) {
          return reply.status(200).send({
            data: { renderRunId: existing.rows[0].id, status: existing.rows[0].status },
            meta: { requestId: request.id, idempotencyReplayed: true },
          });
        }
      }
      throw err;
    }

    // If replayed from advisory lock detection
    if (result.replayed) {
      return reply.status(200).send({
        data: { renderRunId: result.run.id, status: result.run.status, jobId: result.job.id },
        meta: { requestId: request.id, idempotencyReplayed: true },
      });
    }

    // Enqueue to Redis (best-effort)
    try {
      await jobQueue.add('video_render', {
        jobId: result.job.id,
        jobType: 'video_render',
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
        renderRunId: result.run.id,
        status: 'queued',
        jobId: result.job.id,
        sourceVideoAssetId: body.sourceVideoAssetId,
        renderProfileId: body.renderProfileId,
      },
      meta: { requestId: request.id },
    });
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/render-runs
  // List render runs for a project (paginated)
  // =========================================================================
  app.get('/api/v1/projects/:projectId/render-runs', {
    schema: {
      tags: ['render'],
      description: 'List render runs for a project',
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
    await requireProjectPermission(request, projectId, 'render.run.read');

    const query = request.query as { page?: string; pageSize?: string };
    const { page, pageSize } = parsePagination(query);
    const offset = (page - 1) * pageSize;

    const [countRes, dataRes] = await Promise.all([
      pgPool.query(
        `SELECT count(*) FROM aidilam_app.render_runs WHERE project_id = $1`,
        [projectId],
      ),
      pgPool.query(
        `SELECT rr.id, rr.status, rr.progress_percent, rr.current_stage,
                rr.source_video_asset_id, rr.subtitle_version_id, rr.tts_run_id,
                rr.render_profile_id, rr.estimated_duration_ms, rr.actual_duration_ms,
                rr.estimated_cost, rr.committed_cost, rr.currency,
                rr.output_asset_id, rr.preview_asset_id,
                rr.error_code, rr.error_message_safe,
                rr.created_at, rr.started_at, rr.completed_at, rr.updated_at,
                rp.name AS profile_name, rp.mode AS profile_mode
         FROM aidilam_app.render_runs rr
         LEFT JOIN aidilam_app.render_profiles rp ON rp.id = rr.render_profile_id
         WHERE rr.project_id = $1
         ORDER BY rr.created_at DESC
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
  // GET /api/v1/projects/:projectId/render-runs/:runId
  // Get render run detail
  // =========================================================================
  app.get('/api/v1/projects/:projectId/render-runs/:runId', {
    schema: {
      tags: ['render'],
      description: 'Get render run detail',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, runId } = request.params as { projectId: string; runId: string };
    await requireProjectPermission(request, projectId, 'render.run.read');

    const result = await pgPool.query(
      `SELECT rr.id, rr.status, rr.progress_percent, rr.current_stage,
              rr.source_video_asset_id, rr.subtitle_version_id, rr.tts_run_id,
              rr.tts_narration_asset_id, rr.render_profile_id, rr.job_id,
              rr.estimated_duration_ms, rr.actual_duration_ms,
              rr.estimated_cost, rr.committed_cost, rr.currency,
              rr.output_asset_id, rr.preview_asset_id,
              rr.error_code, rr.error_message_safe, rr.idempotency_key,
              rr.requested_by, rr.created_at, rr.started_at, rr.completed_at,
              rr.cancel_requested_at, rr.cancelled_at, rr.updated_at,
              rp.name AS profile_name, rp.mode AS profile_mode
       FROM aidilam_app.render_runs rr
       LEFT JOIN aidilam_app.render_profiles rp ON rp.id = rr.render_profile_id
       WHERE rr.id = $1 AND rr.project_id = $2`,
      [runId, projectId],
    );

    if (result.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Render run not found in this project');
    }

    return {
      data: result.rows[0],
      meta: { requestId: request.id },
    };
  });

  // =========================================================================
  // POST /api/v1/projects/:projectId/render-runs/:runId/cancel
  // Cancel a render run
  // =========================================================================
  app.post('/api/v1/projects/:projectId/render-runs/:runId/cancel', {
    schema: {
      tags: ['render'],
      description: 'Cancel a queued or running render run',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, runId } = request.params as { projectId: string; runId: string };
    await requireProjectPermission(request, projectId, 'render.run.cancel');

    const identity = request.identity!;

    const runResult = await pgPool.query(
      `SELECT id, status, job_id FROM aidilam_app.render_runs
       WHERE id = $1 AND project_id = $2`,
      [runId, projectId],
    );

    if (runResult.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Render run not found in this project');
    }

    const run = runResult.rows[0];

    if (run.status !== 'queued' && run.status !== 'running') {
      throw new AppError('CONFLICT', `Cannot cancel a run with status: ${run.status}`);
    }

    // Set status to cancel_requested
    await pgPool.query(
      `UPDATE aidilam_app.render_runs SET status = 'cancel_requested', cancel_requested_at = now(), updated_at = now()
       WHERE id = $1`,
      [runId],
    );

    // Cancel the linked job
    let removedFromQueue = false;
    if (run.job_id) {
      await pgPool.query(
        `UPDATE aidilam_app.jobs SET status = 'cancel_requested', updated_at = now()
         WHERE id = $1 AND status IN ('pending', 'queued', 'running')`,
        [run.job_id],
      );

      // Attempt to remove from BullMQ queue (best-effort)
      try {
        const bullJob = await jobQueue.getJob(run.job_id);
        if (bullJob) {
          const state = await bullJob.getState();
          if (state === 'waiting' || state === 'delayed') {
            await bullJob.remove();
            removedFromQueue = true;
          }
        }
      } catch {
        // Job may already be processing; worker will check cancel flag
      }
    }

    // If run was queued and we removed from BullMQ, transition directly to cancelled
    if (run.status === 'queued' && removedFromQueue) {
      await pgPool.query(
        `UPDATE aidilam_app.render_runs SET status = 'cancelled', cancelled_at = now(), updated_at = now()
         WHERE id = $1`,
        [runId],
      );
      await pgPool.query(
        `UPDATE aidilam_app.jobs SET status = 'cancelled', updated_at = now()
         WHERE id = $1`,
        [run.job_id],
      );
    }

    await recordAuditEvent({
      requestId: request.id,
      identity,
      action: 'render_run.cancel',
      resourceType: 'render_run',
      resourceId: runId,
      projectId,
      outcome: 'success',
      sourceIp: request.ip,
      userAgent: request.headers['user-agent'],
      previousValues: { status: run.status },
      newValues: { status: 'cancel_requested' },
    });

    const finalStatus = (run.status === 'queued' && removedFromQueue) ? 'cancelled' : 'cancel_requested';

    return {
      data: { renderRunId: runId, status: finalStatus },
      meta: { requestId: request.id },
    };
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/render-runs/:runId/plan
  // Get render plan for a render run
  // =========================================================================
  app.get('/api/v1/projects/:projectId/render-runs/:runId/plan', {
    schema: {
      tags: ['render'],
      description: 'Get render plan for a render run',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, runId } = request.params as { projectId: string; runId: string };
    await requireProjectPermission(request, projectId, 'render.plan.read');

    // Verify run belongs to project
    const runResult = await pgPool.query(
      `SELECT id FROM aidilam_app.render_runs WHERE id = $1 AND project_id = $2`,
      [runId, projectId],
    );
    if (runResult.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Render run not found');
    }

    const result = await pgPool.query(
      `SELECT id, render_run_id, project_id, source_video_metadata,
              subtitle_metadata, tts_metadata, output_spec, filter_graph_safe,
              audio_plan, video_plan, estimated_work_units, validation_warnings,
              checksum, created_at
       FROM aidilam_app.render_plans
       WHERE render_run_id = $1 AND project_id = $2`,
      [runId, projectId],
    );

    if (result.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Render plan not found');
    }

    return { data: result.rows[0], meta: { requestId: request.id } };
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/render-usage
  // List render usage records for a project
  // =========================================================================
  app.get('/api/v1/projects/:projectId/render-usage', {
    schema: {
      tags: ['render'],
      description: 'List render usage records for a project',
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
    await requireProjectPermission(request, projectId, 'render.usage.read');

    const query = request.query as { page?: string; pageSize?: string };
    const { page, pageSize } = parsePagination(query);
    const offset = (page - 1) * pageSize;

    const [countRes, dataRes] = await Promise.all([
      pgPool.query(
        `SELECT count(*) FROM aidilam_app.render_usage_records WHERE project_id = $1`,
        [projectId],
      ),
      pgPool.query(
        `SELECT id, render_run_id, operation_type, source_duration_ms,
                output_duration_ms, source_resolution, output_resolution,
                frames_processed, audio_duration_ms, subtitle_cue_count,
                ffmpeg_execution_seconds, output_bytes, retry_count,
                estimated_cost, committed_cost, currency, pricing_version, created_at
         FROM aidilam_app.render_usage_records
         WHERE project_id = $1
         ORDER BY created_at DESC
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
  // GET /api/v1/projects/:projectId/render-cost-summary
  // Get render cost summary for a project
  // =========================================================================
  app.get('/api/v1/projects/:projectId/render-cost-summary', {
    schema: {
      tags: ['render'],
      description: 'Get render cost summary for a project',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'render.usage.read');

    const result = await pgPool.query(
      `SELECT
         COALESCE(SUM(estimated_cost), 0) AS total_estimated,
         COALESCE(SUM(committed_cost), 0) AS total_committed,
         COALESCE(SUM(source_duration_ms), 0) AS total_source_duration_ms,
         COALESCE(SUM(output_duration_ms), 0) AS total_output_duration_ms,
         COALESCE(SUM(frames_processed), 0) AS total_frames_processed,
         COALESCE(SUM(output_bytes), 0) AS total_output_bytes,
         count(*) AS record_count,
         COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE THEN committed_cost ELSE 0 END), 0) AS daily_spend,
         COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', CURRENT_DATE) THEN committed_cost ELSE 0 END), 0) AS monthly_spend
       FROM aidilam_app.render_usage_records
       WHERE project_id = $1`,
      [projectId],
    );

    const budget = await pgPool.query(
      `SELECT daily_limit, monthly_limit, per_run_limit, currency
       FROM aidilam_app.render_budgets WHERE project_id = $1`,
      [projectId],
    );

    return {
      data: {
        ...result.rows[0],
        budget: budget.rows[0] || null,
      },
      meta: { requestId: request.id },
    };
  });
}
