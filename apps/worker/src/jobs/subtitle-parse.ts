/**
 * Subtitle Parse Job Handler
 *
 * Parses subtitle files (SRT/VTT) from MinIO, normalizes the timeline,
 * and stores structured cues in the database.
 */

import type { JobContext } from './types.js';
import { pool } from '../infrastructure/database.js';
import { minioClient, BUCKET } from '../infrastructure/minio.js';
import { logger } from '../logging/index.js';
import { parseSrt, parseVtt, detectSubtitleFormat } from './subtitle-parsers.js';
import { createHash } from 'node:crypto';

/** Maximum subtitle file size: 10MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Batch size for cue inserts */
const CUE_BATCH_SIZE = 100;

export async function handleSubtitleParse(context: JobContext): Promise<Record<string, unknown>> {
  const { jobId, inputPayload, reportProgress } = context;
  const trackId = inputPayload.trackId as string;

  if (!trackId) {
    throw createPermanentError('Missing trackId in inputPayload');
  }

  logger.info('Subtitle parse started', { jobId, trackId });
  await reportProgress(5);

  // Step 1: Load subtitle track and verify status
  const trackResult = await pool.query(
    `SELECT id, project_id, source_asset_id, language_code, status
     FROM aidilam_app.subtitle_tracks
     WHERE id = $1`,
    [trackId],
  );

  if (trackResult.rows.length === 0) {
    throw createPermanentError(`Subtitle track not found: ${trackId}`);
  }

  const track = trackResult.rows[0];

  if (track.status !== 'pending') {
    throw createPermanentError(`Subtitle track is not in pending status (current: ${track.status})`);
  }

  // Transition to parsing
  await pool.query(
    `UPDATE aidilam_app.subtitle_tracks
     SET status = 'parsing', updated_at = now(), version = version + 1
     WHERE id = $1`,
    [trackId],
  );

  await reportProgress(10);

  // Step 2: Load source asset
  const assetResult = await pool.query(
    `SELECT id, object_key, status, size_bytes
     FROM aidilam_app.assets
     WHERE id = $1 AND deleted_at IS NULL`,
    [track.source_asset_id],
  );

  if (assetResult.rows.length === 0) {
    await transitionToInvalid(trackId, 'Source asset not found');
    throw createPermanentError(`Source asset not found: ${track.source_asset_id}`);
  }

  const asset = assetResult.rows[0];

  if (asset.status !== 'available') {
    await transitionToInvalid(trackId, `Source asset not available (status: ${asset.status})`);
    throw createPermanentError(`Source asset not available: ${asset.status}`);
  }

  await reportProgress(15);

  // Step 3: Download subtitle file from MinIO (bounded)
  let fileContent: string;
  try {
    fileContent = await downloadBounded(asset.object_key, MAX_FILE_SIZE);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Download failed';
    await transitionToInvalid(trackId, message);
    throw createPermanentError(`Failed to download subtitle file: ${message}`);
  }

  await reportProgress(30);

  // Step 4: Detect format
  const format = detectSubtitleFormat(fileContent);
  if (format === 'unknown') {
    await transitionToInvalid(trackId, 'Unrecognized subtitle format');
    throw createPermanentError('Unrecognized subtitle format');
  }

  await reportProgress(35);

  // Step 5: Parse cues
  let parsedCues;
  try {
    parsedCues = format === 'srt' ? parseSrt(fileContent) : parseVtt(fileContent);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Parse failed';
    await transitionToInvalid(trackId, message);
    throw createPermanentError(`Subtitle parse failed: ${message}`);
  }

  if (parsedCues.length === 0) {
    await transitionToInvalid(trackId, 'No valid cues found in subtitle file');
    throw createPermanentError('No valid cues found');
  }

  await reportProgress(50);

  // Step 6: Normalize timeline (sort by start_ms)
  parsedCues.sort((a, b) => a.startMs - b.startMs);
  // Re-index after sorting
  parsedCues.forEach((cue, idx) => { cue.index = idx + 1; });

  // Compute content checksum
  const checksumInput = parsedCues.map(c => `${c.startMs}|${c.endMs}|${c.text}`).join('\n');
  const contentChecksum = createHash('sha256').update(checksumInput).digest('hex');

  // Step 7: Create subtitle_version (type=normalized, version_number=1)
  const durationMs = parsedCues.length > 0
    ? parsedCues[parsedCues.length - 1].endMs
    : 0;

  const versionResult = await pool.query(
    `INSERT INTO aidilam_app.subtitle_versions
       (subtitle_track_id, version_number, version_type, language_code, status, content_checksum, cue_count, created_by)
     VALUES ($1, 1, 'normalized', $2, 'processing', $3, $4, 'worker')
     RETURNING id`,
    [trackId, track.language_code, contentChecksum, parsedCues.length],
  );

  const versionId = versionResult.rows[0].id;
  await reportProgress(55);

  // Step 8: Batch INSERT cues
  const totalBatches = Math.ceil(parsedCues.length / CUE_BATCH_SIZE);
  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batch = parsedCues.slice(
      batchIdx * CUE_BATCH_SIZE,
      (batchIdx + 1) * CUE_BATCH_SIZE,
    );

    await insertCueBatch(versionId, batch);

    // Report progress: 55% to 90% over batches
    const batchProgress = 55 + Math.round((batchIdx + 1) / totalBatches * 35);
    await reportProgress(Math.min(batchProgress, 90));
  }

  // Step 9: Update version status to ready
  await pool.query(
    `UPDATE aidilam_app.subtitle_versions
     SET status = 'ready'
     WHERE id = $1`,
    [versionId],
  );

  // Step 10: Update track: status=ready, cue_count, duration_ms, source_format
  await pool.query(
    `UPDATE aidilam_app.subtitle_tracks
     SET status = 'ready',
         cue_count = $2,
         duration_ms = $3,
         source_format = $4,
         updated_at = now(),
         version = version + 1
     WHERE id = $1`,
    [trackId, parsedCues.length, durationMs, format],
  );

  await reportProgress(100);

  logger.info('Subtitle parse completed', {
    jobId,
    trackId,
    versionId,
    format,
    cueCount: parsedCues.length,
    durationMs,
  });

  return {
    trackId,
    versionId,
    format,
    cueCount: parsedCues.length,
    durationMs,
    contentChecksum,
  };
}

// =============================================================================
// Helpers
// =============================================================================

async function downloadBounded(objectKey: string, maxSize: number): Promise<string> {
  const stat = await minioClient.statObject(BUCKET, objectKey);
  if (stat.size > maxSize) {
    throw new Error(`File size ${stat.size} exceeds maximum ${maxSize} bytes`);
  }

  const stream = await minioClient.getObject(BUCKET, objectKey);
  const chunks: Buffer[] = [];
  let totalSize = 0;

  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalSize += buf.length;
    if (totalSize > maxSize) {
      stream.destroy();
      throw new Error(`Stream exceeded maximum size of ${maxSize} bytes`);
    }
    chunks.push(buf);
  }

  return Buffer.concat(chunks).toString('utf-8');
}

async function insertCueBatch(versionId: string, cues: Array<{ index: number; startMs: number; endMs: number; text: string; identifier?: string }>): Promise<void> {
  if (cues.length === 0) return;

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let paramIdx = 1;

  for (const cue of cues) {
    const durationMs = cue.endMs - cue.startMs;
    placeholders.push(
      `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6})`
    );
    values.push(versionId, cue.index, cue.startMs, cue.endMs, durationMs, cue.text, cue.identifier || null);
    paramIdx += 7;
  }

  await pool.query(
    `INSERT INTO aidilam_app.subtitle_cues
       (subtitle_version_id, cue_index, start_ms, end_ms, duration_ms, text_plain, source_cue_identifier)
     VALUES ${placeholders.join(', ')}`,
    values,
  );
}

async function transitionToInvalid(trackId: string, reason: string): Promise<void> {
  logger.warn('Subtitle track marked invalid', { trackId, reason });
  await pool.query(
    `UPDATE aidilam_app.subtitle_tracks
     SET status = 'invalid', updated_at = now(), version = version + 1
     WHERE id = $1`,
    [trackId],
  );
}

function createPermanentError(message: string): Error & { retryable: boolean } {
  const err = new Error(message) as Error & { retryable: boolean };
  err.retryable = false;
  return err;
}
