/**
 * Asset Routes — Asset Ingestion API
 *
 * Provides endpoints for initiating uploads, completing uploads,
 * listing assets, fetching details, generating download URLs, and deleting.
 */

import { FastifyInstance } from 'fastify';
import { pgPool } from '../../../infrastructure/database/index.js';
import { AppError } from '../../../core/errors/index.js';
import { withTransaction } from '../../../core/transactions/index.js';
import { parsePagination } from '../../../core/types/index.js';
import { requireProjectPermission } from '../../security/domain/authorization.js';
import { recordAuditEvent } from '../../security/infrastructure/audit-events.js';
import { minioClient } from '../../../infrastructure/minio/index.js';
import { config } from '../../../config/index.js';
import { isAllowedType, validateFileSize, getMediaKind } from '../domain/file-policy.js';
import { sanitizeFilename, generateObjectKey } from '../domain/filename.js';
import { computeJobFingerprint } from '../../jobs/domain/fingerprint.js';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

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

/** Upload URL expiry in seconds (15 minutes) */
const UPLOAD_EXPIRY_SECONDS = 15 * 60;

/** Download URL expiry in seconds (15 minutes) */
const DOWNLOAD_EXPIRY_SECONDS = 15 * 60;

export async function assetRoutes(app: FastifyInstance) {
  // =========================================================================
  // POST /api/v1/projects/:projectId/assets/initiate
  // =========================================================================
  app.post('/api/v1/projects/:projectId/assets/initiate', {
    schema: {
      tags: ['assets'],
      description: 'Initiate an asset upload - returns a presigned PUT URL',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['filename', 'contentType', 'sizeBytes'],
        properties: {
          filename: { type: 'string', minLength: 1, maxLength: 500 },
          contentType: { type: 'string', minLength: 1, maxLength: 255 },
          sizeBytes: { type: 'integer', minimum: 0 },
          idempotencyKey: { type: 'string', minLength: 1, maxLength: 128 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'assets.create');

    const { filename, contentType, sizeBytes, idempotencyKey } = request.body as {
      filename: string; contentType: string; sizeBytes: number; idempotencyKey?: string;
    };

    // Validate content type
    if (!isAllowedType(contentType)) {
      throw new AppError('VALIDATION_ERROR', `Content type '${contentType}' is not allowed`);
    }

    // Validate file size
    const sizeCheck = validateFileSize(contentType, sizeBytes);
    if (!sizeCheck.valid) {
      throw new AppError('VALIDATION_ERROR',
        `File size ${sizeBytes} exceeds maximum ${sizeCheck.maxBytes} bytes for type '${contentType}'`);
    }

    const identity = request.identity!;
    const mediaKind = getMediaKind(contentType);
    const safeName = sanitizeFilename(filename);

    // Idempotency check
    if (idempotencyKey) {
      const fingerprint = computeJobFingerprint({
        actorId: identity.actorId,
        projectId,
        jobType: 'asset_initiate',
        priority: 0,
        timeoutSeconds: 0,
        inputPayload: { filename: safeName, contentType, sizeBytes },
      });

      const existing = await pgPool.query(
        `SELECT resource_id, request_fingerprint FROM aidilam_app.idempotency_records
         WHERE actor_id = $1 AND project_id = $2 AND operation = 'asset.initiate' AND idempotency_key = $3
         AND expires_at > now()`,
        [identity.actorId, projectId, idempotencyKey]
      );

      if (existing.rows.length > 0) {
        const record = existing.rows[0];
        if (record.request_fingerprint === fingerprint) {
          // Idempotent replay — return existing asset upload info
          const existingAsset = await pgPool.query(
            `SELECT a.id, a.object_key, aus.expires_at
             FROM aidilam_app.assets a
             JOIN aidilam_app.asset_upload_sessions aus ON aus.asset_id = a.id
             WHERE a.id = $1 AND aus.status = 'active'
             ORDER BY aus.created_at DESC LIMIT 1`,
            [record.resource_id]
          );
          if (existingAsset.rows.length > 0) {
            const row = existingAsset.rows[0];
            const uploadUrl = await minioClient.presignedPutObject(
              config.minio.bucket, row.object_key, UPLOAD_EXPIRY_SECONDS,
            );
            return reply.status(200).send({
              data: {
                assetId: row.id,
                uploadUrl,
                expiresAt: row.expires_at,
                requiredHeaders: { 'content-type': contentType },
              },
              meta: { requestId: request.id, idempotencyReplayed: true },
            });
          }
        } else {
          throw new AppError('CONFLICT', 'Idempotency key already used with a materially different request');
        }
      }

      // Store fingerprint reference for later
      (request as any)._idempotencyFingerprint = fingerprint;
    }

    // Create asset and upload session in transaction
    const result = await withTransaction(pgPool, async (client) => {
      // Generate a new asset ID first
      // Generate asset ID and object key upfront
      const assetIdRes = await client.query('SELECT gen_random_uuid() AS id');
      const assetId = assetIdRes.rows[0].id;
      const objectKey = generateObjectKey(projectId, assetId, safeName);

      await client.query(
        `INSERT INTO aidilam_app.assets
          (id, project_id, bucket_name, object_key, original_filename, content_type,
           client_content_type, expected_size_bytes, media_kind, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending_upload')`,
        [assetId, projectId, config.minio.bucket, objectKey, filename, contentType, contentType, sizeBytes, mediaKind]
      );

      // Create upload session
      const expiresAt = new Date(Date.now() + UPLOAD_EXPIRY_SECONDS * 1000);
      await client.query(
        `INSERT INTO aidilam_app.asset_upload_sessions
          (asset_id, actor_id, status, expected_size_bytes, expected_content_type, object_key, expires_at)
         VALUES ($1, $2, 'active', $3, $4, $5, $6)`,
        [assetId, identity.actorId, sizeBytes, contentType, objectKey, expiresAt]
      );

      // Update asset upload_expires_at
      await client.query(
        `UPDATE aidilam_app.assets SET upload_expires_at = $1 WHERE id = $2`,
        [expiresAt, assetId]
      );

      // Store idempotency record if key provided
      const fingerprint = (request as any)._idempotencyFingerprint;
      if (idempotencyKey && fingerprint) {
        await client.query(
          `INSERT INTO aidilam_app.idempotency_records
            (actor_id, project_id, operation, idempotency_key, request_fingerprint, resource_type, resource_id)
           VALUES ($1, $2, 'asset.initiate', $3, $4, 'asset', $5)
           ON CONFLICT (actor_id, project_id, operation, idempotency_key) DO NOTHING`,
          [identity.actorId, projectId, idempotencyKey, fingerprint, assetId]
        );
      }

      await recordAuditEvent({
        requestId: request.id,
        identity,
        action: 'asset.initiate',
        resourceType: 'asset',
        resourceId: assetId,
        projectId,
        outcome: 'success',
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'],
        newValues: { filename: safeName, contentType, sizeBytes, mediaKind },
      }, client);

      return { assetId, objectKey, expiresAt };
    });

    // Generate presigned PUT URL
    const uploadUrl = await minioClient.presignedPutObject(
      config.minio.bucket, result.objectKey, UPLOAD_EXPIRY_SECONDS,
    );

    reply.status(201).send({
      data: {
        assetId: result.assetId,
        uploadUrl,
        expiresAt: result.expiresAt.toISOString(),
        requiredHeaders: { 'content-type': contentType },
      },
      meta: { requestId: request.id },
    });
  });

  // =========================================================================
  // POST /api/v1/projects/:projectId/assets/:assetId/complete
  // =========================================================================
  app.post('/api/v1/projects/:projectId/assets/:assetId/complete', {
    schema: {
      tags: ['assets'],
      description: 'Complete an asset upload - verifies object and enqueues ingestion',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { projectId, assetId } = request.params as { projectId: string; assetId: string };
    await requireProjectPermission(request, projectId, 'assets.create');

    const identity = request.identity!;

    // Verify upload session is active and not expired
    const sessionRes = await pgPool.query(
      `SELECT id, object_key, expected_size_bytes, expires_at
       FROM aidilam_app.asset_upload_sessions
       WHERE asset_id = $1 AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [assetId]
    );

    if (sessionRes.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'No active upload session found for this asset');
    }

    const session = sessionRes.rows[0];

    if (new Date(session.expires_at) < new Date()) {
      // Mark session as expired
      await pgPool.query(
        `UPDATE aidilam_app.asset_upload_sessions SET status = 'expired' WHERE id = $1`,
        [session.id]
      );
      throw new AppError('CONFLICT', 'Upload session has expired');
    }

    // HEAD object in MinIO to verify it exists
    let objectStat: { size: number; etag: string };
    try {
      objectStat = await minioClient.statObject(config.minio.bucket, session.object_key);
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Object not found in storage — upload may not have completed');
    }

    // Compare actual size with expected (if expected was provided)
    if (session.expected_size_bytes !== null && objectStat.size !== Number(session.expected_size_bytes)) {
      throw new AppError('VALIDATION_ERROR',
        `Uploaded file size (${objectStat.size}) does not match expected size (${session.expected_size_bytes})`);
    }

    // Transition asset to 'uploaded' and create ingestion job
    const result = await withTransaction(pgPool, async (client) => {
      // Update asset status
      await client.query(
        `UPDATE aidilam_app.assets
         SET status = 'uploaded', actual_size_bytes = $1, size_bytes = $1, etag = $2, version = version + 1
         WHERE id = $3 AND project_id = $4`,
        [objectStat.size, objectStat.etag, assetId, projectId]
      );

      // Complete upload session
      await client.query(
        `UPDATE aidilam_app.asset_upload_sessions
         SET status = 'completed', completed_at = now()
         WHERE id = $1`,
        [session.id]
      );

      // Create ingestion job
      const jobRes = await client.query(
        `INSERT INTO aidilam_app.jobs
          (project_id, job_type, priority, input_payload, queue_name)
         VALUES ($1, 'asset_ingest', 0, $2, 'aidilam-jobs')
         RETURNING id, status, created_at`,
        [projectId, JSON.stringify({ assetId, objectKey: session.object_key })]
      );
      const job = jobRes.rows[0];

      // Record job event
      await client.query(
        `INSERT INTO aidilam_app.job_events (job_id, event_type, payload) VALUES ($1, 'job_created', $2)`,
        [job.id, JSON.stringify({ jobType: 'asset_ingest', assetId })]
      );

      await recordAuditEvent({
        requestId: request.id,
        identity,
        action: 'asset.complete',
        resourceType: 'asset',
        resourceId: assetId,
        projectId,
        outcome: 'success',
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'],
        newValues: { status: 'uploaded', actualSize: objectStat.size, jobId: job.id },
      }, client);

      return { job };
    });

    // Enqueue to Redis (best-effort)
    try {
      await jobQueue.add('asset_ingest', {
        jobId: result.job.id,
        jobType: 'asset_ingest',
        schemaVersion: 1,
        traceId: request.id,
      }, {
        jobId: result.job.id,
        priority: 0,
      });
    } catch {
      // Reconciliation will recover
    }

    // Fetch updated asset for response
    const assetRes = await pgPool.query(
      `SELECT id, project_id, object_key, original_filename, content_type, media_kind,
              status, size_bytes, actual_size_bytes, etag, created_at, updated_at
       FROM aidilam_app.assets WHERE id = $1`,
      [assetId]
    );

    reply.status(202).send({
      data: {
        asset: assetRes.rows[0],
        job: { id: result.job.id, status: result.job.status, createdAt: result.job.created_at },
      },
      meta: { requestId: request.id },
    });
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/assets
  // =========================================================================
  app.get('/api/v1/projects/:projectId/assets', {
    schema: {
      tags: ['assets'],
      description: 'List project assets with optional filters',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          pageSize: { type: 'string' },
          status: { type: 'string' },
          mediaKind: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'assets.read');

    const query = request.query as { page?: string; pageSize?: string; status?: string; mediaKind?: string };
    const { page, pageSize } = parsePagination(query);
    const offset = (page - 1) * pageSize;

    // Build dynamic WHERE clause
    const conditions: string[] = ['project_id = $1', 'deleted_at IS NULL'];
    const params: unknown[] = [projectId];
    let paramIdx = 2;

    if (query.status) {
      conditions.push(`status = $${paramIdx}`);
      params.push(query.status);
      paramIdx++;
    }

    if (query.mediaKind) {
      conditions.push(`media_kind = $${paramIdx}`);
      params.push(query.mediaKind);
      paramIdx++;
    }

    const where = conditions.join(' AND ');

    const [countRes, dataRes] = await Promise.all([
      pgPool.query(`SELECT count(*) FROM aidilam_app.assets WHERE ${where}`, params),
      pgPool.query(
        `SELECT id, original_filename, content_type, media_kind, status, size_bytes,
                actual_size_bytes, created_at, updated_at
         FROM aidilam_app.assets
         WHERE ${where}
         ORDER BY created_at DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, pageSize, offset]
      ),
    ]);

    const total = parseInt(countRes.rows[0].count, 10);
    return {
      data: dataRes.rows,
      meta: { requestId: request.id, page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/assets/:assetId
  // =========================================================================
  app.get('/api/v1/projects/:projectId/assets/:assetId', {
    schema: {
      tags: ['assets'],
      description: 'Get single asset details',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, assetId } = request.params as { projectId: string; assetId: string };
    await requireProjectPermission(request, projectId, 'assets.read');

    const result = await pgPool.query(
      `SELECT id, project_id, bucket_name, object_key, original_filename, content_type,
              client_content_type, detected_content_type, media_kind, status,
              size_bytes, actual_size_bytes, expected_size_bytes, checksum_sha256, etag,
              width, height, duration_ms, frame_rate, video_codec, audio_codec,
              audio_channels, sample_rate, metadata_json,
              validation_error_code, validation_error_message, validated_at,
              available_at, version, created_by, created_at, updated_at
       FROM aidilam_app.assets
       WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
      [assetId, projectId]
    );

    if (result.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Asset not found');
    }

    return { data: result.rows[0], meta: { requestId: request.id } };
  });

  // =========================================================================
  // POST /api/v1/projects/:projectId/assets/:assetId/download-url
  // =========================================================================
  app.post('/api/v1/projects/:projectId/assets/:assetId/download-url', {
    schema: {
      tags: ['assets'],
      description: 'Generate a presigned download URL for an available asset',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, assetId } = request.params as { projectId: string; assetId: string };
    await requireProjectPermission(request, projectId, 'assets.read');

    const result = await pgPool.query(
      `SELECT id, object_key, status FROM aidilam_app.assets
       WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
      [assetId, projectId]
    );

    if (result.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Asset not found');
    }

    const asset = result.rows[0];
    if (asset.status !== 'available') {
      throw new AppError('CONFLICT', `Asset is not available for download (status: ${asset.status})`);
    }

    const downloadUrl = await minioClient.presignedGetObject(
      config.minio.bucket, asset.object_key, DOWNLOAD_EXPIRY_SECONDS,
    );
    const expiresAt = new Date(Date.now() + DOWNLOAD_EXPIRY_SECONDS * 1000).toISOString();

    return {
      data: { downloadUrl, expiresAt },
      meta: { requestId: request.id },
    };
  });

  // =========================================================================
  // DELETE /api/v1/projects/:projectId/assets/:assetId
  // =========================================================================
  app.delete('/api/v1/projects/:projectId/assets/:assetId', {
    schema: {
      tags: ['assets'],
      description: 'Delete an asset - removes object from storage',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, assetId } = request.params as { projectId: string; assetId: string };
    await requireProjectPermission(request, projectId, 'assets.delete');

    const identity = request.identity!;

    const result = await pgPool.query(
      `SELECT id, object_key, status FROM aidilam_app.assets
       WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
      [assetId, projectId]
    );

    if (result.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Asset not found');
    }

    const asset = result.rows[0];
    const previousStatus = asset.status;

    // Transition to deleting
    await pgPool.query(
      `UPDATE aidilam_app.assets SET status = 'deleting', version = version + 1 WHERE id = $1`,
      [assetId]
    );

    // Delete object from MinIO
    try {
      await minioClient.removeObject(config.minio.bucket, asset.object_key);
    } catch {
      // Object may already be gone — proceed with deletion
    }

    // Transition to deleted (soft delete)
    await pgPool.query(
      `UPDATE aidilam_app.assets
       SET status = 'deleted', deleted_at = now(), version = version + 1
       WHERE id = $1`,
      [assetId]
    );

    // Record audit
    await recordAuditEvent({
      requestId: request.id,
      identity,
      action: 'asset.delete',
      resourceType: 'asset',
      resourceId: assetId,
      projectId,
      outcome: 'success',
      sourceIp: request.ip,
      userAgent: request.headers['user-agent'],
      previousValues: { status: previousStatus },
      newValues: { status: 'deleted' },
    });

    return { data: { id: assetId, status: 'deleted' }, meta: { requestId: request.id } };
  });
}
