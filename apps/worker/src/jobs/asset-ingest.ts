import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { JobContext, JobError } from './types.js';
import { pool } from '../infrastructure/database.js';
import { minioClient, BUCKET } from '../infrastructure/minio.js';
import { logger } from '../logging/index.js';

// Dynamic imports for ESM-only packages
async function detectFileType(buffer: Uint8Array) {
  const { fileTypeFromBuffer } = await import('file-type');
  return fileTypeFromBuffer(buffer);
}

// image-size is CJS-compatible
import imageSize from 'image-size';

/** Dangerous MIME types that should be rejected if detected vs declared mismatch */
const DANGEROUS_MIME_TYPES = new Set([
  'application/x-executable',
  'application/x-dosexec',
  'application/x-mach-binary',
  'application/x-elf',
  'application/x-sharedlib',
  'application/javascript',
  'text/html',
  'application/xhtml+xml',
  'application/x-httpd-php',
]);

/** Size tolerance: 1% or 1KB, whichever is larger */
const SIZE_TOLERANCE_PERCENT = 0.01;
const SIZE_TOLERANCE_MIN_BYTES = 1024;

interface AssetRecord {
  id: string;
  project_id: string;
  status: string;
  version: number;
  object_key: string;
  expected_size_bytes: number | null;
  client_content_type: string | null;
}

function createRetryableError(message: string): JobError {
  const err = new Error(message) as JobError;
  err.retryable = true;
  return err;
}

function createPermanentError(message: string): JobError {
  const err = new Error(message) as JobError;
  err.retryable = false;
  return err;
}

function determineMediaKind(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('text/') || mimeType === 'application/x-subrip' || mimeType === 'application/x-ass') {
    return 'subtitle';
  }
  if (mimeType === 'application/pdf') return 'document';
  return 'other';
}

function isSizeMismatch(actual: number, expected: number): boolean {
  const tolerance = Math.max(expected * SIZE_TOLERANCE_PERCENT, SIZE_TOLERANCE_MIN_BYTES);
  return Math.abs(actual - expected) > tolerance;
}

async function transitionToRejected(
  assetId: string,
  version: number,
  errorCode: string,
  errorMessage: string,
): Promise<void> {
  await pool.query(
    `UPDATE aidilam_app.assets
     SET status = 'rejected',
         validation_error_code = $1,
         validation_error_message = $2,
         version = version + 1,
         updated_at = NOW()
     WHERE id = $3 AND version = $4`,
    [errorCode, errorMessage, assetId, version],
  );
}

export async function handleAssetIngest(context: JobContext): Promise<Record<string, unknown>> {
  const { jobId, projectId, inputPayload, reportProgress, checkCancellation } = context;
  const assetId = inputPayload.assetId as string;

  if (!assetId) {
    throw createPermanentError('Missing assetId in inputPayload');
  }

  logger.info('Asset ingest started', { jobId, assetId, projectId });

  // Step 1: Load asset record
  const assetResult = await pool.query<AssetRecord>(
    `SELECT id, project_id, status, version, object_key, expected_size_bytes, client_content_type
     FROM aidilam_app.assets
     WHERE id = $1`,
    [assetId],
  );

  if (assetResult.rows.length === 0) {
    throw createPermanentError(`Asset not found: ${assetId}`);
  }

  const asset = assetResult.rows[0];

  // Step 2: Verify status and project
  if (asset.status !== 'uploaded') {
    throw createPermanentError(`Asset status is '${asset.status}', expected 'uploaded'`);
  }

  if (asset.project_id !== projectId) {
    throw createPermanentError(`Asset project_id mismatch: asset=${asset.project_id}, job=${projectId}`);
  }

  // Step 3: Transition to 'validating'
  const transitionResult = await pool.query(
    `UPDATE aidilam_app.assets
     SET status = 'validating', version = version + 1, updated_at = NOW()
     WHERE id = $1 AND version = $2
     RETURNING version`,
    [assetId, asset.version],
  );

  if (transitionResult.rowCount === 0) {
    throw createRetryableError(`Optimistic lock conflict on asset ${assetId}`);
  }

  let currentVersion = transitionResult.rows[0].version as number;

  await reportProgress(10);

  if (await checkCancellation()) {
    throw createPermanentError('Job cancelled');
  }

  // Step 4: HEAD object in MinIO
  let stat: { size: number; etag: string };
  try {
    const statResult = await minioClient.statObject(BUCKET, asset.object_key);
    stat = { size: statResult.size, etag: statResult.etag };
  } catch (err: unknown) {
    const error = err as Error & { code?: string };
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      throw createRetryableError(`MinIO connection failure: ${error.message}`);
    }
    throw createPermanentError(`MinIO stat failed: ${error.message}`);
  }

  // Step 5: Verify size within tolerance
  if (asset.expected_size_bytes !== null && isSizeMismatch(stat.size, asset.expected_size_bytes)) {
    await transitionToRejected(
      assetId,
      currentVersion,
      'SIZE_MISMATCH',
      `Expected ${asset.expected_size_bytes} bytes, actual ${stat.size} bytes`,
    );
    logger.warn('Asset rejected: size mismatch', { jobId, assetId, expected: asset.expected_size_bytes, actual: stat.size });
    return { status: 'rejected', reason: 'SIZE_MISMATCH' };
  }

  await reportProgress(30);

  if (await checkCancellation()) {
    throw createPermanentError('Job cancelled');
  }

  // Step 6: Stream object and compute SHA-256
  let stream: Readable;
  try {
    stream = await minioClient.getObject(BUCKET, asset.object_key);
  } catch (err: unknown) {
    const error = err as Error & { code?: string };
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      throw createRetryableError(`MinIO connection failure: ${error.message}`);
    }
    throw createPermanentError(`MinIO getObject failed: ${error.message}`);
  }

  const hash = createHash('sha256');
  const headerChunks: Buffer[] = [];
  let headerBytesCollected = 0;
  const HEADER_BYTES_NEEDED = 4100;

  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    hash.update(buf);

    // Collect first 4100 bytes for MIME detection
    if (headerBytesCollected < HEADER_BYTES_NEEDED) {
      const needed = HEADER_BYTES_NEEDED - headerBytesCollected;
      headerChunks.push(buf.subarray(0, needed));
      headerBytesCollected += Math.min(buf.length, needed);
    }
  }

  const checksumSha256 = hash.digest('hex');
  const headerBuffer = Buffer.concat(headerChunks).subarray(0, HEADER_BYTES_NEEDED);

  await reportProgress(60);

  if (await checkCancellation()) {
    throw createPermanentError('Job cancelled');
  }

  // Step 7: Detect MIME type
  const detectedType = await detectFileType(headerBuffer);
  const detectedMime = detectedType?.mime || 'application/octet-stream';

  // Step 8: Compare detected vs declared
  if (asset.client_content_type && detectedMime !== 'application/octet-stream') {
    const declaredBase = asset.client_content_type.split(';')[0].trim().toLowerCase();
    const detectedBase = detectedMime.toLowerCase();

    if (declaredBase !== detectedBase && DANGEROUS_MIME_TYPES.has(detectedBase)) {
      await transitionToRejected(
        assetId,
        currentVersion,
        'DANGEROUS_CONTENT_TYPE_MISMATCH',
        `Declared: ${declaredBase}, Detected: ${detectedBase} (dangerous)`,
      );
      logger.warn('Asset rejected: dangerous content type mismatch', {
        jobId, assetId, declared: declaredBase, detected: detectedBase,
      });
      return { status: 'rejected', reason: 'DANGEROUS_CONTENT_TYPE_MISMATCH' };
    }
  }

  // Step 9: Determine media_kind
  const mediaKind = determineMediaKind(detectedMime);

  await reportProgress(80);

  if (await checkCancellation()) {
    throw createPermanentError('Job cancelled');
  }

  // Step 10: Extract basic metadata
  let width: number | null = null;
  let height: number | null = null;
  const metadataJson: Record<string, unknown> = {
    detected_mime: detectedMime,
    file_extension: detectedType?.ext || null,
    actual_size_bytes: stat.size,
  };

  if (mediaKind === 'image') {
    try {
      const dimensions = imageSize(headerBuffer);
      width = dimensions.width || null;
      height = dimensions.height || null;
      metadataJson.width = width;
      metadataJson.height = height;
      metadataJson.image_type = dimensions.type || null;
    } catch (err: unknown) {
      logger.warn('Failed to extract image dimensions', {
        jobId, assetId, error: (err as Error).message,
      });
    }
  } else if (mediaKind === 'video' || mediaKind === 'audio') {
    // Use FFprobe for audio/video metadata extraction
    const { probeMedia } = await import('./ffprobe.js');
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const os = await import('node:os');

    // Download file to temp directory for FFprobe
    const tmpDir = `/tmp/aidilam-assets/${context.jobId}`;
    await fs.mkdir(tmpDir, { recursive: true, mode: 0o700 });
    const tmpFile = path.join(tmpDir, 'source.' + (detectedType?.ext || 'bin'));

    try {
      // Stream from MinIO to temp file
      const { pipeline } = await import('node:stream/promises');
      const { createWriteStream } = await import('node:fs');
      const objStream = await minioClient.getObject(BUCKET, asset.object_key);
      await pipeline(objStream, createWriteStream(tmpFile));

      // Run FFprobe
      const probeResult = await probeMedia(tmpFile);
      
      if (probeResult.duration_ms) metadataJson.duration_ms = probeResult.duration_ms;
      if (probeResult.width) { width = probeResult.width; metadataJson.width = width; }
      if (probeResult.height) { height = probeResult.height; metadataJson.height = height; }
      if (probeResult.frame_rate) metadataJson.frame_rate = probeResult.frame_rate;
      if (probeResult.video_codec) metadataJson.video_codec = probeResult.video_codec;
      if (probeResult.audio_codec) metadataJson.audio_codec = probeResult.audio_codec;
      if (probeResult.audio_channels) metadataJson.audio_channels = probeResult.audio_channels;
      if (probeResult.sample_rate) metadataJson.sample_rate = probeResult.sample_rate;
      if (probeResult.format_name) metadataJson.format_name = probeResult.format_name;
    } catch (err: unknown) {
      logger.warn('FFprobe extraction failed', {
        jobId, assetId, error: (err as Error).message,
      });
      metadataJson.probe_error = (err as Error).message;
    } finally {
      // Cleanup temp files
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  } else if (mediaKind === 'subtitle') {
    // Validate it's text content (already readable if we got here)
    metadataJson.subtitle_format = detectedType?.ext || 'unknown';
  }

  // Step 11: Update asset with all computed fields and transition to 'available'
  const now = new Date().toISOString();
  const durationMs = (metadataJson.duration_ms as number) || null;
  const frameRate = (metadataJson.frame_rate as number) || null;
  const videoCodec = (metadataJson.video_codec as string) || null;
  const audioCodec = (metadataJson.audio_codec as string) || null;
  const audioChannels = (metadataJson.audio_channels as number) || null;
  const sampleRate = (metadataJson.sample_rate as number) || null;

  const updateResult = await pool.query(
    `UPDATE aidilam_app.assets
     SET actual_size_bytes = $1,
         checksum_sha256 = $2,
         detected_content_type = $3,
         media_kind = $4,
         etag = $5,
         width = $6,
         height = $7,
         duration_ms = $8,
         frame_rate = $9,
         video_codec = $10,
         audio_codec = $11,
         audio_channels = $12,
         sample_rate = $13,
         validated_at = $14,
         available_at = $15,
         metadata_json = $16,
         status = 'available',
         version = version + 1,
         updated_at = NOW()
     WHERE id = $17 AND version = $18
     RETURNING version`,
    [
      stat.size,
      checksumSha256,
      detectedMime,
      mediaKind,
      stat.etag,
      width,
      height,
      durationMs,
      frameRate,
      videoCodec,
      audioCodec,
      audioChannels,
      sampleRate,
      now,
      now,
      JSON.stringify(metadataJson),
      assetId,
      currentVersion,
    ],
  );

  if (updateResult.rowCount === 0) {
    throw createRetryableError(`Optimistic lock conflict on asset ${assetId} during finalization`);
  }

  await reportProgress(100);

  logger.info('Asset ingest completed', {
    jobId,
    assetId,
    mediaKind,
    detectedMime,
    size: stat.size,
    checksumSha256,
  });

  return {
    status: 'available',
    assetId,
    mediaKind,
    detectedContentType: detectedMime,
    actualSize: stat.size,
    checksumSha256,
    width,
    height,
  };
}
