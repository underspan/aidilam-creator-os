/**
 * TTS Routes — Text-to-Speech API
 *
 * Provides endpoints for managing TTS providers, voices, profiles,
 * preview synthesis, and full TTS runs against subtitle versions.
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

export async function ttsRoutes(app: FastifyInstance) {
  // =========================================================================
  // GET /api/v1/tts/providers
  // List active TTS providers
  // =========================================================================
  app.get('/api/v1/tts/providers', {
    schema: {
      tags: ['tts'],
      description: 'List active TTS providers',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    await requirePermission(request, 'tts.provider.read');

    const result = await pgPool.query(
      `SELECT code, display_name, provider_type, supported_languages,
              supported_audio_formats, supports_ssml, supports_streaming,
              supports_timestamps, supports_speaking_rate, supports_pitch,
              supports_style, supports_voice_cloning, supports_per_character_pricing,
              supports_per_audio_duration_pricing, is_active
       FROM aidilam_app.tts_providers
       WHERE is_active = true
       ORDER BY display_name`,
    );

    return {
      data: result.rows,
      meta: { requestId: request.id, total: result.rows.length },
    };
  });

  // =========================================================================
  // GET /api/v1/tts/voices
  // List TTS voices with optional filters
  // =========================================================================
  app.get('/api/v1/tts/voices', {
    schema: {
      tags: ['tts'],
      description: 'List TTS voices with optional filters',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          provider: { type: 'string' },
          language: { type: 'string' },
          locale: { type: 'string' },
          gender: { type: 'string', enum: ['male', 'female', 'neutral'] },
          style: { type: 'string' },
          active: { type: 'string', enum: ['true', 'false'] },
          page: { type: 'string' },
          pageSize: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    await requirePermission(request, 'tts.voice.read');

    const query = request.query as {
      provider?: string;
      language?: string;
      locale?: string;
      gender?: string;
      style?: string;
      active?: string;
      page?: string;
      pageSize?: string;
    };

    const { page, pageSize } = parsePagination(query);
    const offset = (page - 1) * pageSize;

    // Check if caller has validation permission to see validation_only voices
    const identity = request.identity!;
    const hasValidationPerm = identity.globalPermissions.includes('*') ||
      identity.globalPermissions.includes('tts.validation.execute');

    const conditions: string[] = ['p.is_active = true'];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (!hasValidationPerm) {
      conditions.push('v.validation_only = false');
    }

    if (query.provider) {
      conditions.push(`p.code = $${paramIndex++}`);
      params.push(query.provider);
    }

    if (query.language) {
      conditions.push(`v.language = $${paramIndex++}`);
      params.push(query.language);
    }

    if (query.locale) {
      conditions.push(`v.locale = $${paramIndex++}`);
      params.push(query.locale);
    }

    if (query.gender) {
      conditions.push(`v.gender = $${paramIndex++}`);
      params.push(query.gender);
    }

    if (query.style) {
      conditions.push(`v.style = $${paramIndex++}`);
      params.push(query.style);
    }

    if (query.active !== undefined) {
      conditions.push(`v.is_active = $${paramIndex++}`);
      params.push(query.active === 'true');
    } else {
      conditions.push('v.is_active = true');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countParams = [...params];
    const dataParams = [...params, pageSize, offset];

    const [countRes, dataRes] = await Promise.all([
      pgPool.query(
        `SELECT count(*) FROM aidilam_app.tts_voices v
         JOIN aidilam_app.tts_providers p ON p.id = v.provider_id
         ${whereClause}`,
        countParams,
      ),
      pgPool.query(
        `SELECT v.id, v.voice_code, v.display_name, v.gender, v.locale,
                v.language, v.style, v.is_active, v.validation_only,
                v.sample_rate, v.supported_formats,
                p.code AS provider_code, p.display_name AS provider_name
         FROM aidilam_app.tts_voices v
         JOIN aidilam_app.tts_providers p ON p.id = v.provider_id
         ${whereClause}
         ORDER BY p.display_name, v.display_name
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        dataParams,
      ),
    ]);

    const total = parseInt(countRes.rows[0].count, 10);
    return {
      data: dataRes.rows,
      meta: { requestId: request.id, page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/tts-profiles
  // List TTS profiles for a project
  // =========================================================================
  app.get('/api/v1/projects/:projectId/tts-profiles', {
    schema: {
      tags: ['tts'],
      description: 'List TTS profiles for a project',
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
    await requireProjectPermission(request, projectId, 'tts.profile.read');

    const query = request.query as { page?: string; pageSize?: string };
    const { page, pageSize } = parsePagination(query);
    const offset = (page - 1) * pageSize;

    const [countRes, dataRes] = await Promise.all([
      pgPool.query(
        `SELECT count(*) FROM aidilam_app.tts_profiles
         WHERE project_id = $1`,
        [projectId],
      ),
      pgPool.query(
        `SELECT tp.id, tp.name, tp.language, tp.audio_format, tp.sample_rate,
                tp.speaking_rate, tp.pitch, tp.volume_gain, tp.pause_policy,
                tp.synchronization_policy, tp.is_default, tp.version,
                tp.created_at, tp.updated_at,
                v.id AS voice_id, v.voice_code, v.display_name AS voice_name, v.gender AS voice_gender,
                p.code AS provider_code, p.display_name AS provider_name
         FROM aidilam_app.tts_profiles tp
         JOIN aidilam_app.tts_voices v ON v.id = tp.voice_id
         JOIN aidilam_app.tts_providers p ON p.id = tp.provider_id
         WHERE tp.project_id = $1
         ORDER BY tp.is_default DESC, tp.name
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
  // POST /api/v1/projects/:projectId/tts-profiles
  // Create a TTS profile
  // =========================================================================
  app.post('/api/v1/projects/:projectId/tts-profiles', {
    schema: {
      tags: ['tts'],
      description: 'Create a TTS profile for a project',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name', 'voiceId', 'language', 'audioFormat'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 200 },
          voiceId: { type: 'string', format: 'uuid' },
          language: { type: 'string', minLength: 2, maxLength: 10 },
          audioFormat: { type: 'string', enum: ['mp3', 'wav', 'ogg', 'opus', 'flac', 'pcm'] },
          sampleRate: { type: 'integer', minimum: 8000, maximum: 48000 },
          speakingRate: { type: 'number', minimum: 0.25, maximum: 4.0 },
          pitch: { type: 'number', minimum: -20, maximum: 20 },
          volumeGain: { type: 'number', minimum: -20, maximum: 20 },
          pausePolicy: { type: 'string', maxLength: 50 },
          synchronizationPolicy: { type: 'string', maxLength: 50 },
          isDefault: { type: 'boolean' },
          configurationJson: { type: 'object' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'tts.profile.manage');

    const body = request.body as {
      name: string;
      voiceId: string;
      language: string;
      audioFormat: string;
      sampleRate?: number;
      speakingRate?: number;
      pitch?: number;
      volumeGain?: number;
      pausePolicy?: string;
      synchronizationPolicy?: string;
      isDefault?: boolean;
      configurationJson?: Record<string, unknown>;
    };

    const identity = request.identity!;

    // Validate voice exists and belongs to active provider
    const voiceResult = await pgPool.query(
      `SELECT v.id, v.provider_id, v.language, v.validation_only,
              p.is_active AS provider_active,
              (SELECT mc.id FROM aidilam_app.tts_model_configs mc WHERE mc.provider_id = v.provider_id AND mc.is_active = true LIMIT 1) AS model_config_id
       FROM aidilam_app.tts_voices v
       JOIN aidilam_app.tts_providers p ON p.id = v.provider_id
       WHERE v.id = $1 AND v.is_active = true`,
      [body.voiceId],
    );

    if (voiceResult.rows.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Voice not found or inactive');
    }

    const voice = voiceResult.rows[0];

    if (!voice.provider_active) {
      throw new AppError('VALIDATION_ERROR', 'Voice belongs to an inactive provider');
    }

    // Validate voice supports the requested language
    if (voice.language && voice.language !== body.language) {
      throw new AppError('VALIDATION_ERROR', `Voice does not support language: ${body.language}`);
    }

    // If validation_only voice, require tts.validation.execute permission
    if (voice.validation_only) {
      await requireProjectPermission(request, projectId, 'tts.validation.execute');
    }

    // Validate speakingRate range
    if (body.speakingRate !== undefined && (body.speakingRate < 0.25 || body.speakingRate > 4.0)) {
      throw new AppError('VALIDATION_ERROR', 'speakingRate must be between 0.25 and 4.0');
    }

    // Validate pitch range
    if (body.pitch !== undefined && (body.pitch < -20 || body.pitch > 20)) {
      throw new AppError('VALIDATION_ERROR', 'pitch must be between -20 and 20');
    }

    const result = await withTransaction(pgPool, async (client) => {
      // If setting as default, unset other defaults in this project
      if (body.isDefault) {
        await client.query(
          `UPDATE aidilam_app.tts_profiles SET is_default = false, updated_at = now()
           WHERE project_id = $1 AND is_default = true`,
          [projectId],
        );
      }

      const profileResult = await client.query(
        `INSERT INTO aidilam_app.tts_profiles
           (project_id, name, voice_id, provider_id, model_config_id, language,
            audio_format, sample_rate, speaking_rate, pitch, volume_gain,
            pause_policy, synchronization_policy, is_default, configuration_json, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING id, version, created_at`,
        [
          projectId, body.name, body.voiceId, voice.provider_id,
          voice.model_config_id || null, body.language, body.audioFormat,
          body.sampleRate ?? 22050, body.speakingRate ?? 1.0,
          body.pitch ?? 0, body.volumeGain ?? 0,
          body.pausePolicy || 'natural', body.synchronizationPolicy || 'fit_with_rate',
          body.isDefault || false,
          body.configurationJson ? JSON.stringify(body.configurationJson) : '{}',
          identity.actorId,
        ],
      );

      const profile = profileResult.rows[0];

      await recordAuditEvent({
        requestId: request.id,
        identity,
        action: 'tts_profile.create',
        resourceType: 'tts_profile',
        resourceId: profile.id,
        projectId,
        outcome: 'success',
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'],
        newValues: { name: body.name, voiceId: body.voiceId, language: body.language },
      }, client);

      return profile;
    });

    reply.status(201).send({
      data: {
        id: result.id,
        name: body.name,
        voiceId: body.voiceId,
        providerId: voice.provider_id,
        language: body.language,
        audioFormat: body.audioFormat,
        version: result.version,
        createdAt: result.created_at,
      },
      meta: { requestId: request.id },
    });
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/tts-profiles/:profileId
  // Get a TTS profile
  // =========================================================================
  app.get('/api/v1/projects/:projectId/tts-profiles/:profileId', {
    schema: {
      tags: ['tts'],
      description: 'Get a TTS profile by ID',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, profileId } = request.params as { projectId: string; profileId: string };
    await requireProjectPermission(request, projectId, 'tts.profile.read');

    const result = await pgPool.query(
      `SELECT tp.id, tp.name, tp.language, tp.audio_format, tp.sample_rate,
              tp.speaking_rate, tp.pitch, tp.volume_gain, tp.pause_policy,
              tp.synchronization_policy, tp.is_default, tp.configuration_json,
              tp.version, tp.created_at, tp.updated_at, tp.created_by,
              v.id AS voice_id, v.voice_code, v.display_name AS voice_name,
              v.gender AS voice_gender, v.locale AS voice_locale,
              p.code AS provider_code, p.display_name AS provider_name
       FROM aidilam_app.tts_profiles tp
       JOIN aidilam_app.tts_voices v ON v.id = tp.voice_id
       JOIN aidilam_app.tts_providers p ON p.id = tp.provider_id
       WHERE tp.id = $1 AND tp.project_id = $2`,
      [profileId, projectId],
    );

    if (result.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'TTS profile not found');
    }

    return {
      data: result.rows[0],
      meta: { requestId: request.id },
    };
  });

  // =========================================================================
  // PUT /api/v1/projects/:projectId/tts-profiles/:profileId
  // Update a TTS profile (with optimistic versioning)
  // =========================================================================
  app.put('/api/v1/projects/:projectId/tts-profiles/:profileId', {
    schema: {
      tags: ['tts'],
      description: 'Update a TTS profile (optimistic versioning via version field)',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['version'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 200 },
          voiceId: { type: 'string', format: 'uuid' },
          language: { type: 'string', minLength: 2, maxLength: 10 },
          audioFormat: { type: 'string', enum: ['mp3', 'wav', 'ogg', 'opus', 'flac', 'pcm'] },
          sampleRate: { type: 'integer', minimum: 8000, maximum: 48000 },
          speakingRate: { type: 'number', minimum: 0.25, maximum: 4.0 },
          pitch: { type: 'number', minimum: -20, maximum: 20 },
          volumeGain: { type: 'number', minimum: -20, maximum: 20 },
          pausePolicy: { type: 'string', maxLength: 50 },
          synchronizationPolicy: { type: 'string', maxLength: 50 },
          isDefault: { type: 'boolean' },
          configurationJson: { type: 'object' },
          version: { type: 'integer', minimum: 1 },
        },
        additionalProperties: false,
      },
    },
  }, async (request) => {
    const { projectId, profileId } = request.params as { projectId: string; profileId: string };
    await requireProjectPermission(request, projectId, 'tts.profile.manage');

    const body = request.body as {
      name?: string;
      voiceId?: string;
      language?: string;
      audioFormat?: string;
      sampleRate?: number;
      speakingRate?: number;
      pitch?: number;
      volumeGain?: number;
      pausePolicy?: string;
      synchronizationPolicy?: string;
      isDefault?: boolean;
      configurationJson?: Record<string, unknown>;
      version: number;
    };

    const identity = request.identity!;

    // If voiceId is being changed, validate it
    let resolvedProviderId: string | undefined;
    let resolvedModelConfigId: string | null | undefined;

    if (body.voiceId) {
      const voiceResult = await pgPool.query(
        `SELECT v.id, v.provider_id, v.language, v.validation_only,
                p.is_active AS provider_active,
                (SELECT mc.id FROM aidilam_app.tts_model_configs mc WHERE mc.provider_id = v.provider_id AND mc.is_active = true LIMIT 1) AS model_config_id
         FROM aidilam_app.tts_voices v
         JOIN aidilam_app.tts_providers p ON p.id = v.provider_id
         WHERE v.id = $1 AND v.is_active = true`,
        [body.voiceId],
      );

      if (voiceResult.rows.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'Voice not found or inactive');
      }

      const voice = voiceResult.rows[0];

      if (!voice.provider_active) {
        throw new AppError('VALIDATION_ERROR', 'Voice belongs to an inactive provider');
      }

      const languageToCheck = body.language || undefined;
      if (languageToCheck && voice.language && voice.language !== languageToCheck) {
        throw new AppError('VALIDATION_ERROR', `Voice does not support language: ${languageToCheck}`);
      }

      if (voice.validation_only) {
        await requireProjectPermission(request, projectId, 'tts.validation.execute');
      }

      resolvedProviderId = voice.provider_id;
      resolvedModelConfigId = voice.model_config_id || null;
    }

    // Validate speakingRate range
    if (body.speakingRate !== undefined && (body.speakingRate < 0.25 || body.speakingRate > 4.0)) {
      throw new AppError('VALIDATION_ERROR', 'speakingRate must be between 0.25 and 4.0');
    }

    // Validate pitch range
    if (body.pitch !== undefined && (body.pitch < -20 || body.pitch > 20)) {
      throw new AppError('VALIDATION_ERROR', 'pitch must be between -20 and 20');
    }

    const result = await withTransaction(pgPool, async (client) => {
      // Optimistic version check
      const existing = await client.query(
        `SELECT id, version FROM aidilam_app.tts_profiles
         WHERE id = $1 AND project_id = $2`,
        [profileId, projectId],
      );

      if (existing.rows.length === 0) {
        throw new AppError('RESOURCE_NOT_FOUND', 'TTS profile not found');
      }

      if (existing.rows[0].version !== body.version) {
        throw new AppError('CONFLICT', 'Profile has been modified by another request. Reload and try again.');
      }

      // If setting as default, unset other defaults
      if (body.isDefault) {
        await client.query(
          `UPDATE aidilam_app.tts_profiles SET is_default = false, updated_at = now()
           WHERE project_id = $1 AND is_default = true AND id != $2`,
          [projectId, profileId],
        );
      }

      // Build dynamic UPDATE
      const setClauses: string[] = ['version = version + 1', 'updated_at = now()'];
      const updateParams: unknown[] = [];
      let pIdx = 1;

      if (body.name !== undefined) { setClauses.push(`name = $${pIdx++}`); updateParams.push(body.name); }
      if (body.voiceId !== undefined) { setClauses.push(`voice_id = $${pIdx++}`); updateParams.push(body.voiceId); }
      if (resolvedProviderId !== undefined) { setClauses.push(`provider_id = $${pIdx++}`); updateParams.push(resolvedProviderId); }
      if (resolvedModelConfigId !== undefined) { setClauses.push(`model_config_id = $${pIdx++}`); updateParams.push(resolvedModelConfigId); }
      if (body.language !== undefined) { setClauses.push(`language = $${pIdx++}`); updateParams.push(body.language); }
      if (body.audioFormat !== undefined) { setClauses.push(`audio_format = $${pIdx++}`); updateParams.push(body.audioFormat); }
      if (body.sampleRate !== undefined) { setClauses.push(`sample_rate = $${pIdx++}`); updateParams.push(body.sampleRate); }
      if (body.speakingRate !== undefined) { setClauses.push(`speaking_rate = $${pIdx++}`); updateParams.push(body.speakingRate); }
      if (body.pitch !== undefined) { setClauses.push(`pitch = $${pIdx++}`); updateParams.push(body.pitch); }
      if (body.volumeGain !== undefined) { setClauses.push(`volume_gain = $${pIdx++}`); updateParams.push(body.volumeGain); }
      if (body.pausePolicy !== undefined) { setClauses.push(`pause_policy = $${pIdx++}`); updateParams.push(body.pausePolicy); }
      if (body.synchronizationPolicy !== undefined) { setClauses.push(`synchronization_policy = $${pIdx++}`); updateParams.push(body.synchronizationPolicy); }
      if (body.isDefault !== undefined) { setClauses.push(`is_default = $${pIdx++}`); updateParams.push(body.isDefault); }
      if (body.configurationJson !== undefined) { setClauses.push(`configuration_json = $${pIdx++}`); updateParams.push(JSON.stringify(body.configurationJson)); }

      updateParams.push(profileId);
      updateParams.push(projectId);
      updateParams.push(body.version);

      const updateResult = await client.query(
        `UPDATE aidilam_app.tts_profiles
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
        action: 'tts_profile.update',
        resourceType: 'tts_profile',
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
  // POST /api/v1/projects/:projectId/tts/previews
  // Preview TTS synthesis (rate limited)
  // =========================================================================
  app.post('/api/v1/projects/:projectId/tts/previews', {
    schema: {
      tags: ['tts'],
      description: 'Preview TTS synthesis for a single cue or text snippet. Rate limited to prevent abuse.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['profileId'],
        properties: {
          profileId: { type: 'string', format: 'uuid' },
          subtitleCueId: { type: 'string', format: 'uuid' },
          previewText: { type: 'string', minLength: 1, maxLength: 200 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'tts.preview.create');

    const body = request.body as {
      profileId: string;
      subtitleCueId?: string;
      previewText?: string;
    };

    const identity = request.identity!;

    if (!body.subtitleCueId && !body.previewText) {
      throw new AppError('VALIDATION_ERROR', 'Either subtitleCueId or previewText is required');
    }

    // Verify profile belongs to project
    const profileResult = await pgPool.query(
      `SELECT id, voice_id, provider_id FROM aidilam_app.tts_profiles
       WHERE id = $1 AND project_id = $2`,
      [body.profileId, projectId],
    );

    if (profileResult.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'TTS profile not found in this project');
    }

    let textToSynthesize: string;

    if (body.subtitleCueId) {
      // Load cue and verify project ownership via version → track → project
      const cueResult = await pgPool.query(
        `SELECT sc.text_plain
         FROM aidilam_app.subtitle_cues sc
         JOIN aidilam_app.subtitle_versions sv ON sv.id = sc.subtitle_version_id
         JOIN aidilam_app.subtitle_tracks st ON st.id = sv.subtitle_track_id
         WHERE sc.id = $1 AND st.project_id = $2 AND st.status != 'deleted'`,
        [body.subtitleCueId, projectId],
      );

      if (cueResult.rows.length === 0) {
        throw new AppError('RESOURCE_NOT_FOUND', 'Subtitle cue not found in this project');
      }

      textToSynthesize = cueResult.rows[0].text_plain;
    } else {
      // previewText — require explicit permission for arbitrary text
      await requireProjectPermission(request, projectId, 'tts.preview.arbitrary_text');

      if (body.previewText!.length > 200) {
        throw new AppError('VALIDATION_ERROR', 'previewText must be at most 200 characters');
      }

      textToSynthesize = body.previewText!;
    }

    // Create a short-lived preview job
    const result = await withTransaction(pgPool, async (client) => {
      const jobResult = await client.query(
        `INSERT INTO aidilam_app.jobs
           (project_id, job_type, priority, input_payload, queue_name)
         VALUES ($1, 'tts_preview', 5, $2, 'aidilam-jobs')
         RETURNING id, status, created_at`,
        [projectId, JSON.stringify({
          profileId: body.profileId,
          text: textToSynthesize,
          subtitleCueId: body.subtitleCueId || null,
        })],
      );

      const job = jobResult.rows[0];

      await client.query(
        `INSERT INTO aidilam_app.job_events (job_id, event_type, payload) VALUES ($1, 'job_created', $2)`,
        [job.id, JSON.stringify({ jobType: 'tts_preview', profileId: body.profileId })],
      );

      await recordAuditEvent({
        requestId: request.id,
        identity,
        action: 'tts_preview.create',
        resourceType: 'tts_preview',
        resourceId: job.id,
        projectId,
        outcome: 'success',
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'],
        newValues: { profileId: body.profileId, hasSubtitleCue: !!body.subtitleCueId },
      }, client);

      return job;
    });

    // Enqueue (best-effort)
    try {
      await jobQueue.add('tts_preview', {
        jobId: result.id,
        jobType: 'tts_preview',
        schemaVersion: 1,
        traceId: request.id,
      }, {
        jobId: result.id,
        priority: 5,
      });
    } catch {
      // Reconciliation will recover
    }

    reply.status(202).send({
      data: {
        previewJobId: result.id,
        status: result.status,
      },
      meta: { requestId: request.id },
    });
  });

  // =========================================================================
  // POST /api/v1/projects/:projectId/subtitle-versions/:versionId/tts-runs
  // Create a TTS run for a subtitle version
  // =========================================================================
  app.post('/api/v1/projects/:projectId/subtitle-versions/:versionId/tts-runs', {
    schema: {
      tags: ['tts'],
      description: 'Create a TTS run to synthesize audio for all cues in a subtitle version',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['profileId', 'idempotencyKey'],
        properties: {
          profileId: { type: 'string', format: 'uuid' },
          idempotencyKey: { type: 'string', minLength: 8, maxLength: 128 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { projectId, versionId } = request.params as { projectId: string; versionId: string };
    await requireProjectPermission(request, projectId, 'tts.run.create');

    const body = request.body as { profileId: string; idempotencyKey: string };
    const identity = request.identity!;

    // Verify subtitle version belongs to project and has correct status
    const versionResult = await pgPool.query(
      `SELECT sv.id, sv.status, sv.cue_count, sv.subtitle_track_id
       FROM aidilam_app.subtitle_versions sv
       JOIN aidilam_app.subtitle_tracks st ON st.id = sv.subtitle_track_id
       WHERE sv.id = $1 AND st.project_id = $2 AND st.status != 'deleted'`,
      [versionId, projectId],
    );

    if (versionResult.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Subtitle version not found in this project');
    }

    const version = versionResult.rows[0];
    if (version.status !== 'ready' && version.status !== 'approved') {
      throw new AppError('CONFLICT', `Subtitle version is not ready for TTS (status: ${version.status})`);
    }

    // Verify profile belongs to project
    const profileResult = await pgPool.query(
      `SELECT id, voice_id, provider_id, model_config_id, language
       FROM aidilam_app.tts_profiles
       WHERE id = $1 AND project_id = $2`,
      [body.profileId, projectId],
    );

    if (profileResult.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'TTS profile not found in this project');
    }

    const profile = profileResult.rows[0];

    let result: { run: { id: string; status: string }; job: { id: string; status: string; created_at: string }; replayed?: boolean };

    try {
      result = await withTransaction(pgPool, async (client) => {
        // Advisory lock to serialize concurrent admission for same (project + version + profile)
        const lockKey = Buffer.from(projectId + versionId + body.profileId).reduce((h, b) => (h * 31 + b) | 0, 0);
        await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

        // Check for existing active run with same idempotency key
        const existingRun = await client.query(
          `SELECT tr.id, tr.status, j.id AS job_id
           FROM aidilam_app.tts_runs tr
           LEFT JOIN aidilam_app.jobs j ON j.id = tr.job_id
           WHERE tr.idempotency_key = $1 AND tr.project_id = $2
             AND tr.subtitle_version_id = $3 AND tr.profile_id = $4
             AND tr.status NOT IN ('failed', 'cancelled')
           LIMIT 1`,
          [body.idempotencyKey, projectId, versionId, body.profileId],
        );

        if (existingRun.rows.length > 0) {
          const e = existingRun.rows[0];
          return {
            run: { id: e.id, status: e.status },
            job: { id: e.job_id, status: 'existing', created_at: '' },
            replayed: true,
          };
        }

        // Ensure tts_budget entry exists for project (create with defaults if missing)
        await client.query(
          `INSERT INTO aidilam_app.tts_budgets (project_id)
           VALUES ($1)
           ON CONFLICT (project_id) DO NOTHING`,
          [projectId],
        );

        // Create tts_run
        const runResult = await client.query(
          `INSERT INTO aidilam_app.tts_runs
             (project_id, subtitle_version_id, profile_id, voice_id, provider_id,
              idempotency_key, cue_count, requested_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, status`,
          [
            projectId, versionId, body.profileId, profile.voice_id,
            profile.provider_id, body.idempotencyKey,
            version.cue_count || 0, identity.actorId,
          ],
        );

        const run = runResult.rows[0];

        // Create job
        const jobResult = await client.query(
          `INSERT INTO aidilam_app.jobs
             (project_id, job_type, priority, input_payload, queue_name)
           VALUES ($1, 'tts_synthesize', 0, $2, 'aidilam-jobs')
           RETURNING id, status, created_at`,
          [projectId, JSON.stringify({
            ttsRunId: run.id,
            subtitleVersionId: versionId,
            profileId: body.profileId,
          })],
        );

        const job = jobResult.rows[0];

        // Link job to run
        await client.query(
          `UPDATE aidilam_app.tts_runs SET job_id = $1, status = 'queued', updated_at = now()
           WHERE id = $2`,
          [job.id, run.id],
        );

        // Record job event
        await client.query(
          `INSERT INTO aidilam_app.job_events (job_id, event_type, payload) VALUES ($1, 'job_created', $2)`,
          [job.id, JSON.stringify({ jobType: 'tts_synthesize', ttsRunId: run.id })],
        );

        await recordAuditEvent({
          requestId: request.id,
          identity,
          action: 'tts_run.create',
          resourceType: 'tts_synthesize',
          resourceId: run.id,
          projectId,
          outcome: 'success',
          sourceIp: request.ip,
          userAgent: request.headers['user-agent'],
          newValues: {
            subtitleVersionId: versionId,
            profileId: body.profileId,
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
          `SELECT id, status FROM aidilam_app.tts_runs
           WHERE idempotency_key = $1 AND project_id = $2
             AND subtitle_version_id = $3 AND profile_id = $4
             AND status NOT IN ('failed', 'cancelled')
           LIMIT 1`,
          [body.idempotencyKey, projectId, versionId, body.profileId],
        );
        if (existing.rows.length > 0) {
          return reply.status(200).send({
            data: { ttsRunId: existing.rows[0].id, status: existing.rows[0].status },
            meta: { requestId: request.id, idempotencyReplayed: true },
          });
        }
      }
      throw err;
    }

    // If replayed from advisory lock detection
    if (result.replayed) {
      return reply.status(200).send({
        data: { ttsRunId: result.run.id, status: result.run.status, jobId: result.job.id },
        meta: { requestId: request.id, idempotencyReplayed: true },
      });
    }

    // Enqueue to Redis (best-effort)
    try {
      await jobQueue.add('tts_synthesize', {
        jobId: result.job.id,
        jobType: 'tts_synthesize',
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
        ttsRunId: result.run.id,
        status: 'queued',
        jobId: result.job.id,
        subtitleVersionId: versionId,
        profileId: body.profileId,
      },
      meta: { requestId: request.id },
    });
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/tts-runs
  // List TTS runs for a project (paginated)
  // =========================================================================
  app.get('/api/v1/projects/:projectId/tts-runs', {
    schema: {
      tags: ['tts'],
      description: 'List TTS runs for a project',
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
    await requireProjectPermission(request, projectId, 'tts.run.read');

    const query = request.query as { page?: string; pageSize?: string };
    const { page, pageSize } = parsePagination(query);
    const offset = (page - 1) * pageSize;

    const [countRes, dataRes] = await Promise.all([
      pgPool.query(
        `SELECT count(*) FROM aidilam_app.tts_runs WHERE project_id = $1`,
        [projectId],
      ),
      pgPool.query(
        `SELECT tr.id, tr.status, tr.cue_count, tr.input_character_count,
                tr.estimated_audio_duration_ms, tr.actual_audio_duration_ms,
                tr.estimated_cost, tr.actual_cost, tr.cost_currency,
                tr.created_at, tr.updated_at, tr.completed_at,
                v.voice_code, v.display_name AS voice_name,
                p.code AS provider_code
         FROM aidilam_app.tts_runs tr
         LEFT JOIN aidilam_app.tts_voices v ON v.id = tr.voice_id
         LEFT JOIN aidilam_app.tts_providers p ON p.id = tr.provider_id
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
  // GET /api/v1/projects/:projectId/tts-runs/:runId
  // Get TTS run detail
  // =========================================================================
  app.get('/api/v1/projects/:projectId/tts-runs/:runId', {
    schema: {
      tags: ['tts'],
      description: 'Get TTS run detail including sync plan summary',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, runId } = request.params as { projectId: string; runId: string };
    await requireProjectPermission(request, projectId, 'tts.run.read');

    const result = await pgPool.query(
      `SELECT tr.id, tr.status, tr.subtitle_version_id, tr.profile_id,
              tr.cue_count, tr.input_character_count,
              tr.estimated_audio_duration_ms, tr.actual_audio_duration_ms,
              tr.estimated_cost, tr.actual_cost, tr.cost_currency,
              tr.output_asset_id, tr.sync_plan_summary,
              tr.error_code, tr.error_message,
              tr.created_at, tr.updated_at, tr.completed_at, tr.created_by,
              v.voice_code, v.display_name AS voice_name, v.gender AS voice_gender,
              p.code AS provider_code, p.display_name AS provider_name,
              tp.name AS profile_name
       FROM aidilam_app.tts_runs tr
       LEFT JOIN aidilam_app.tts_voices v ON v.id = tr.voice_id
       LEFT JOIN aidilam_app.tts_providers p ON p.id = tr.provider_id
       LEFT JOIN aidilam_app.tts_profiles tp ON tp.id = tr.profile_id
       WHERE tr.id = $1 AND tr.project_id = $2`,
      [runId, projectId],
    );

    if (result.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'TTS run not found in this project');
    }

    return {
      data: result.rows[0],
      meta: { requestId: request.id },
    };
  });

  // =========================================================================
  // POST /api/v1/projects/:projectId/tts-runs/:runId/cancel
  // Cancel a TTS run
  // =========================================================================
  app.post('/api/v1/projects/:projectId/tts-runs/:runId/cancel', {
    schema: {
      tags: ['tts'],
      description: 'Cancel a queued or running TTS run',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, runId } = request.params as { projectId: string; runId: string };
    await requireProjectPermission(request, projectId, 'tts.run.cancel');

    const identity = request.identity!;

    const runResult = await pgPool.query(
      `SELECT id, status, job_id FROM aidilam_app.tts_runs
       WHERE id = $1 AND project_id = $2`,
      [runId, projectId],
    );

    if (runResult.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'TTS run not found in this project');
    }

    const run = runResult.rows[0];

    if (run.status !== 'queued' && run.status !== 'running') {
      throw new AppError('CONFLICT', `Cannot cancel a run with status: ${run.status}`);
    }

    // Set status to cancel_requested
    await pgPool.query(
      `UPDATE aidilam_app.tts_runs SET status = 'cancel_requested', updated_at = now()
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
        `UPDATE aidilam_app.tts_runs SET status = 'cancelled', cancelled_at = now(), updated_at = now()
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
      action: 'tts_run.cancel',
      resourceType: 'tts_synthesize',
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
      data: { ttsRunId: runId, status: finalStatus },
      meta: { requestId: request.id },
    };
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/tts-usage
  // List TTS usage records for a project
  // =========================================================================
  app.get('/api/v1/projects/:projectId/tts-usage', {
    schema: {
      tags: ['tts'],
      description: 'List TTS usage records for a project',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'tts.usage.read');

    const result = await pgPool.query(
      `SELECT id, tts_run_id, provider_code, voice_code, operation_type,
              input_characters, audio_duration_ms, estimated_cost, committed_cost,
              currency, created_at
       FROM aidilam_app.tts_usage_records
       WHERE project_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [projectId],
    );

    return { data: result.rows, meta: { requestId: request.id, total: result.rows.length } };
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/tts-usage/:usageId
  // Get TTS usage record detail
  // =========================================================================
  app.get('/api/v1/projects/:projectId/tts-usage/:usageId', {
    schema: {
      tags: ['tts'],
      description: 'Get TTS usage record detail',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, usageId } = request.params as { projectId: string; usageId: string };
    await requireProjectPermission(request, projectId, 'tts.usage.read');

    const result = await pgPool.query(
      `SELECT id, tts_run_id, provider_code, voice_code, operation_type,
              input_characters, audio_duration_ms, estimated_cost, committed_cost,
              currency, pricing_version, request_count, retry_count, created_at
       FROM aidilam_app.tts_usage_records
       WHERE id = $1 AND project_id = $2`,
      [usageId, projectId],
    );

    if (result.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'TTS usage record not found');
    }

    return { data: result.rows[0], meta: { requestId: request.id } };
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/tts-cost-summary
  // Get TTS cost summary for a project
  // =========================================================================
  app.get('/api/v1/projects/:projectId/tts-cost-summary', {
    schema: {
      tags: ['tts'],
      description: 'Get TTS cost summary',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'tts.usage.read');

    const result = await pgPool.query(
      `SELECT
         COALESCE(SUM(estimated_cost), 0) as total_estimated,
         COALESCE(SUM(committed_cost), 0) as total_committed,
         COALESCE(SUM(input_characters), 0) as total_characters,
         COALESCE(SUM(audio_duration_ms), 0) as total_audio_ms,
         count(*) as record_count,
         COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE THEN committed_cost ELSE 0 END), 0) as daily_spend,
         COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', CURRENT_DATE) THEN committed_cost ELSE 0 END), 0) as monthly_spend
       FROM aidilam_app.tts_usage_records
       WHERE project_id = $1`,
      [projectId],
    );

    const budget = await pgPool.query(
      `SELECT daily_limit, monthly_limit, per_run_limit, currency
       FROM aidilam_app.tts_budgets WHERE project_id = $1`,
      [projectId],
    );

    return {
      data: {
        ...result.rows[0],
        budget: budget.rows[0] || null,
        currency: 'USD',
      },
      meta: { requestId: request.id },
    };
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/tts-runs/:runId/sync-plan
  // Get synchronization plan for a TTS run
  // =========================================================================
  app.get('/api/v1/projects/:projectId/tts-runs/:runId/sync-plan', {
    schema: {
      tags: ['tts'],
      description: 'Get synchronization plan for a TTS run',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, runId } = request.params as { projectId: string; runId: string };
    await requireProjectPermission(request, projectId, 'tts.run.read');

    // Verify run belongs to project
    const runResult = await pgPool.query(
      `SELECT id FROM aidilam_app.tts_runs WHERE id = $1 AND project_id = $2`,
      [runId, projectId],
    );
    if (runResult.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'TTS run not found');
    }

    const result = await pgPool.query(
      `SELECT id, strategy, original_total_ms, generated_total_ms, adjusted_total_ms,
              fit_count, overflow_count, rate_adjustment_count, pause_adjustment_count,
              overlap_count, manual_review_required, max_rate_used, quality_status, created_at
       FROM aidilam_app.tts_sync_plans
       WHERE tts_run_id = $1 AND project_id = $2`,
      [runId, projectId],
    );

    if (result.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Sync plan not found');
    }

    return { data: result.rows[0], meta: { requestId: request.id } };
  });
}
