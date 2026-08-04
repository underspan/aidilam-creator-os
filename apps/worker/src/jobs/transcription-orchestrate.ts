/**
 * Transcription Orchestrate Job Handler
 *
 * Orchestrates the full STT pipeline:
 * 1. Load transcription run & verify preconditions
 * 2. Prepare audio (mock: use source audio asset directly)
 * 3. Segment audio into 30s chunks with 500ms overlap
 * 4. Transcribe each segment via STT provider
 * 5. Assemble words into utterances
 * 6. Create subtitle track + version + cues from utterances
 * 7. Finalize run as succeeded
 */

import type { JobContext } from './types.js';
import { pool } from '../infrastructure/database.js';
import { logger } from '../logging/index.js';
import { getSttProvider, type SttSegmentInput, type SttWord } from './stt-provider.js';

/** Segment duration in ms */
const SEGMENT_DURATION_MS = 30_000;

/** Overlap between segments in ms */
const SEGMENT_OVERLAP_MS = 500;

/** Max utterance duration in ms for grouping words */
const MAX_UTTERANCE_DURATION_MS = 7_000;

export async function handleTranscriptionOrchestrate(context: JobContext): Promise<Record<string, unknown>> {
  const { jobId, inputPayload, reportProgress, checkCancellation } = context;
  const runId = inputPayload.runId as string;

  if (!runId) {
    throw createPermanentError('Missing runId in inputPayload');
  }

  logger.info('Transcription orchestration started', { jobId, runId });
  await reportProgress(2);

  // =========================================================================
  // Step 1: Load transcription run
  // =========================================================================

  const runResult = await pool.query(
    `SELECT tr.id, tr.project_id, tr.media_asset_id, tr.stt_profile_id,
            tr.status, tr.configuration_hash, tr.source_language,
            sp.provider_code, sp.source_language AS profile_source_language
     FROM aidilam_app.transcription_runs tr
     JOIN aidilam_app.stt_profiles sp ON sp.id = tr.stt_profile_id
     WHERE tr.id = $1`,
    [runId],
  );

  if (runResult.rows.length === 0) {
    throw createPermanentError(`Transcription run not found: ${runId}`);
  }

  const run = runResult.rows[0];

  if (run.status !== 'requested' && run.status !== 'queued') {
    throw createPermanentError(`Transcription run not in expected status (current: ${run.status})`);
  }

  // Verify media asset exists
  const mediaAssetResult = await pool.query(
    `SELECT id, status, metadata_json FROM aidilam_app.assets
     WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
    [run.media_asset_id, run.project_id],
  );

  if (mediaAssetResult.rows.length === 0) {
    await transitionRunToFailed(runId, 'MEDIA_ASSET_NOT_FOUND', 'Media asset not found');
    throw createPermanentError('Media asset not found');
  }

  const mediaAsset = mediaAssetResult.rows[0];

  // Advisory lock: serialize on (project_id + media_asset_id + stt_profile_id)
  const lockKey = Buffer.from(run.project_id + run.media_asset_id + run.stt_profile_id)
    .reduce((h, b) => (h * 31 + b) | 0, 0);
  await pool.query('SELECT pg_advisory_lock($1)', [lockKey]);

  try {
    await reportProgress(5);

    // =========================================================================
    // Step 2: Transition to preparing_audio
    // =========================================================================

    await pool.query(
      `UPDATE aidilam_app.transcription_runs
       SET status = 'preparing_audio', started_at = now(), updated_at = now(),
           provider_code = $2
       WHERE id = $1`,
      [runId, run.provider_code],
    );

    await reportProgress(10);

    // For mock provider: use source audio asset directly (no actual audio preparation)
    const audioAssetId = run.media_asset_id;
    await pool.query(
      `UPDATE aidilam_app.transcription_runs SET audio_asset_id = $2, updated_at = now() WHERE id = $1`,
      [runId, audioAssetId],
    );

    // =========================================================================
    // Step 3: Transition to segmenting — calculate segments
    // =========================================================================

    await pool.query(
      `UPDATE aidilam_app.transcription_runs SET status = 'segmenting', updated_at = now() WHERE id = $1`,
      [runId],
    );

    await reportProgress(15);

    // Determine media duration from asset metadata
    let durationMs = 60_000; // Default 60s if unknown
    if (mediaAsset.metadata_json) {
      const metadata = typeof mediaAsset.metadata_json === 'string'
        ? JSON.parse(mediaAsset.metadata_json)
        : mediaAsset.metadata_json;
      if (metadata.duration_ms) {
        durationMs = metadata.duration_ms;
      } else if (metadata.durationMs) {
        durationMs = metadata.durationMs;
      }
    }

    // Update run duration
    await pool.query(
      `UPDATE aidilam_app.transcription_runs SET duration_ms = $2, updated_at = now() WHERE id = $1`,
      [runId, durationMs],
    );

    // Calculate segments: 30s chunks with 500ms overlap
    const segments: Array<{ index: number; startMs: number; endMs: number; durationMs: number }> = [];
    let segStart = 0;
    let segIndex = 0;
    while (segStart < durationMs) {
      const segEnd = Math.min(segStart + SEGMENT_DURATION_MS, durationMs);
      segments.push({
        index: segIndex,
        startMs: segStart,
        endMs: segEnd,
        durationMs: segEnd - segStart,
      });
      segIndex++;
      segStart = segEnd - SEGMENT_OVERLAP_MS;
      if (segStart >= durationMs) break;
      // Avoid tiny trailing segments
      if (durationMs - segStart < 1000) break;
    }

    await reportProgress(20);

    // INSERT segment records
    if (segments.length > 0) {
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let paramIdx = 1;
      for (const seg of segments) {
        placeholders.push(
          `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4})`
        );
        values.push(runId, seg.index, seg.startMs, seg.endMs, seg.durationMs);
        paramIdx += 5;
      }
      await pool.query(
        `INSERT INTO aidilam_app.transcription_segments
           (transcription_run_id, segment_index, start_ms, end_ms, duration_ms)
         VALUES ${placeholders.join(', ')}`,
        values,
      );
    }

    await reportProgress(25);

    // =========================================================================
    // Step 4: Transition to transcribing
    // =========================================================================

    await pool.query(
      `UPDATE aidilam_app.transcription_runs SET status = 'transcribing', updated_at = now() WHERE id = $1`,
      [runId],
    );

    // Get STT provider
    let provider;
    try {
      provider = getSttProvider(run.provider_code);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'STT provider not available';
      await transitionRunToFailed(runId, 'PROVIDER_UNAVAILABLE', message);
      throw createPermanentError(message);
    }

    // Load inserted segments
    const segmentRows = await pool.query(
      `SELECT id, segment_index, start_ms, end_ms, duration_ms
       FROM aidilam_app.transcription_segments
       WHERE transcription_run_id = $1
       ORDER BY segment_index`,
      [runId],
    );

    const language = run.source_language || run.profile_source_language || undefined;
    let totalWordCount = 0;
    const allWords: Array<{ segmentId: string; words: SttWord[]; segmentIndex: number }> = [];

    // =========================================================================
    // Step 5: Transcribe each segment
    // =========================================================================

    for (let i = 0; i < segmentRows.rows.length; i++) {
      const seg = segmentRows.rows[i];

      // Check cancellation between segments
      if (await checkCancellation()) {
        await pool.query(
          `UPDATE aidilam_app.transcription_runs
           SET status = 'cancelled', completed_at = now(), updated_at = now()
           WHERE id = $1`,
          [runId],
        );
        logger.info('Transcription cancelled', { jobId, runId, atSegment: i });
        return { runId, status: 'cancelled', segmentsCompleted: i };
      }

      // Update segment to running
      await pool.query(
        `UPDATE aidilam_app.transcription_segments
         SET status = 'running', updated_at = now()
         WHERE id = $1`,
        [seg.id],
      );

      const sttInput: SttSegmentInput = {
        segmentId: seg.id,
        audioPath: `asset://${audioAssetId}`,
        startMs: seg.start_ms,
        endMs: seg.end_ms,
        language,
        traceId: jobId,
      };

      let sttResult;
      try {
        sttResult = await provider.transcribeSegment(sttInput);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'STT transcription failed';
        await pool.query(
          `UPDATE aidilam_app.transcription_segments SET status = 'failed', updated_at = now() WHERE id = $1`,
          [seg.id],
        );
        await transitionRunToFailed(runId, 'TRANSCRIPTION_ERROR', `Segment ${seg.segment_index} failed: ${message}`);
        throw createPermanentError(message);
      }

      // Update segment with results
      await pool.query(
        `UPDATE aidilam_app.transcription_segments
         SET status = 'succeeded', text_plain = $2, confidence = $3,
             detected_language = $4, updated_at = now()
         WHERE id = $1`,
        [seg.id, sttResult.text, sttResult.confidence, sttResult.language],
      );

      // INSERT words for this segment
      if (sttResult.words.length > 0) {
        const wordValues: unknown[] = [];
        const wordPlaceholders: string[] = [];
        let wordParamIdx = 1;
        for (const word of sttResult.words) {
          wordPlaceholders.push(
            `($${wordParamIdx}, $${wordParamIdx + 1}, $${wordParamIdx + 2}, $${wordParamIdx + 3}, $${wordParamIdx + 4}, $${wordParamIdx + 5}, $${wordParamIdx + 6})`
          );
          wordValues.push(runId, seg.id, word.wordIndex, word.startMs, word.endMs, word.text, word.confidence);
          wordParamIdx += 7;
        }
        await pool.query(
          `INSERT INTO aidilam_app.transcription_words
             (transcription_run_id, segment_id, word_index, start_ms, end_ms, text_plain, confidence)
           VALUES ${wordPlaceholders.join(', ')}`,
          wordValues,
        );
        totalWordCount += sttResult.words.length;
      }

      allWords.push({ segmentId: seg.id, words: sttResult.words, segmentIndex: seg.segment_index });

      // Report progress: 25% to 70% over transcription
      const transcribeProgress = 25 + Math.round(((i + 1) / segmentRows.rows.length) * 45);
      await reportProgress(Math.min(transcribeProgress, 70));
    }

    // =========================================================================
    // Step 6: Transition to assembling — create utterances
    // =========================================================================

    await pool.query(
      `UPDATE aidilam_app.transcription_runs SET status = 'assembling', updated_at = now() WHERE id = $1`,
      [runId],
    );

    await reportProgress(72);

    // Flatten all words across segments (de-duplicate overlap region)
    const flatWords: Array<{ startMs: number; endMs: number; text: string; confidence: number }> = [];
    const seenTimeRanges = new Set<string>();

    for (const segData of allWords) {
      for (const word of segData.words) {
        const key = `${word.startMs}-${word.endMs}`;
        if (!seenTimeRanges.has(key)) {
          seenTimeRanges.add(key);
          flatWords.push({
            startMs: word.startMs,
            endMs: word.endMs,
            text: word.text,
            confidence: word.confidence,
          });
        }
      }
    }

    // Sort by start time
    flatWords.sort((a, b) => a.startMs - b.startMs);

    // Group words into utterances (~7s max duration)
    const utterances: Array<{
      index: number;
      startMs: number;
      endMs: number;
      text: string;
      confidence: number;
      sourceSegmentStart: number;
      sourceSegmentEnd: number;
    }> = [];

    let currentUtterance: typeof flatWords = [];
    let utteranceIdx = 0;

    for (const word of flatWords) {
      if (currentUtterance.length === 0) {
        currentUtterance.push(word);
      } else {
        const utteranceStart = currentUtterance[0].startMs;
        const wouldEndAt = word.endMs;
        if (wouldEndAt - utteranceStart > MAX_UTTERANCE_DURATION_MS) {
          // Finalize current utterance
          const start = currentUtterance[0].startMs;
          const end = currentUtterance[currentUtterance.length - 1].endMs;
          const text = currentUtterance.map((w) => w.text).join(' ');
          const avgConf = currentUtterance.reduce((sum, w) => sum + w.confidence, 0) / currentUtterance.length;
          utterances.push({
            index: utteranceIdx,
            startMs: start,
            endMs: end,
            text,
            confidence: avgConf,
            sourceSegmentStart: findSegmentIndex(start, segments),
            sourceSegmentEnd: findSegmentIndex(end, segments),
          });
          utteranceIdx++;
          currentUtterance = [word];
        } else {
          currentUtterance.push(word);
        }
      }
    }

    // Flush remaining words into final utterance
    if (currentUtterance.length > 0) {
      const start = currentUtterance[0].startMs;
      const end = currentUtterance[currentUtterance.length - 1].endMs;
      const text = currentUtterance.map((w) => w.text).join(' ');
      const avgConf = currentUtterance.reduce((sum, w) => sum + w.confidence, 0) / currentUtterance.length;
      utterances.push({
        index: utteranceIdx,
        startMs: start,
        endMs: end,
        text,
        confidence: avgConf,
        sourceSegmentStart: findSegmentIndex(start, segments),
        sourceSegmentEnd: findSegmentIndex(end, segments),
      });
    }

    await reportProgress(75);

    // INSERT utterances
    if (utterances.length > 0) {
      const uttValues: unknown[] = [];
      const uttPlaceholders: string[] = [];
      let uttParamIdx = 1;
      for (const utt of utterances) {
        uttPlaceholders.push(
          `($${uttParamIdx}, $${uttParamIdx + 1}, $${uttParamIdx + 2}, $${uttParamIdx + 3}, $${uttParamIdx + 4}, $${uttParamIdx + 5}, $${uttParamIdx + 6}, $${uttParamIdx + 7})`
        );
        uttValues.push(runId, utt.index, utt.startMs, utt.endMs, utt.text, utt.confidence, utt.sourceSegmentStart, utt.sourceSegmentEnd);
        uttParamIdx += 8;
      }
      await pool.query(
        `INSERT INTO aidilam_app.transcription_utterances
           (transcription_run_id, utterance_index, start_ms, end_ms, text_plain, confidence, source_segment_start, source_segment_end)
         VALUES ${uttPlaceholders.join(', ')}`,
        uttValues,
      );
    }

    await reportProgress(80);

    // =========================================================================
    // Step 7: Create subtitle track, version, and cues from utterances
    // =========================================================================

    const detectedLanguage = language || 'zh';

    // Create subtitle_track (kind=generated)
    const trackResult = await pool.query(
      `INSERT INTO aidilam_app.subtitle_tracks
         (project_id, media_asset_id, source_asset_id, language_code,
          track_kind, status, created_by)
       VALUES ($1, $2, $3, $4, 'generated', 'pending', $5)
       RETURNING id`,
      [run.project_id, run.media_asset_id, audioAssetId, detectedLanguage, 'transcription_orchestrate'],
    );

    const trackId = trackResult.rows[0].id;

    // Create subtitle_version (type=normalized)
    const versionResult = await pool.query(
      `INSERT INTO aidilam_app.subtitle_versions
         (subtitle_track_id, version_number, version_type, language_code, status, created_by)
       VALUES ($1, 1, 'normalized', $2, 'processing', 'transcription_orchestrate')
       RETURNING id`,
      [trackId, detectedLanguage],
    );

    const versionId = versionResult.rows[0].id;

    await reportProgress(85);

    // INSERT subtitle_cues from utterances
    if (utterances.length > 0) {
      const cueValues: unknown[] = [];
      const cuePlaceholders: string[] = [];
      let cueParamIdx = 1;
      for (const utt of utterances) {
        const cueDurationMs = utt.endMs - utt.startMs;
        cuePlaceholders.push(
          `($${cueParamIdx}, $${cueParamIdx + 1}, $${cueParamIdx + 2}, $${cueParamIdx + 3}, $${cueParamIdx + 4}, $${cueParamIdx + 5})`
        );
        cueValues.push(versionId, utt.index, utt.startMs, utt.endMs, cueDurationMs, utt.text);
        cueParamIdx += 6;
      }
      await pool.query(
        `INSERT INTO aidilam_app.subtitle_cues
           (subtitle_version_id, cue_index, start_ms, end_ms, duration_ms, text_plain)
         VALUES ${cuePlaceholders.join(', ')}`,
        cueValues,
      );
    }

    await reportProgress(90);

    // Update version status=ready with cue_count
    await pool.query(
      `UPDATE aidilam_app.subtitle_versions SET status = 'ready', cue_count = $2 WHERE id = $1`,
      [versionId, utterances.length],
    );

    // Update track status=ready, cue_count, duration_ms
    await pool.query(
      `UPDATE aidilam_app.subtitle_tracks
       SET status = 'ready', cue_count = $2, duration_ms = $3, updated_at = now()
       WHERE id = $1`,
      [trackId, utterances.length, durationMs],
    );

    await reportProgress(95);

    // =========================================================================
    // Step 8: Finalize run as succeeded
    // =========================================================================

    await pool.query(
      `UPDATE aidilam_app.transcription_runs
       SET status = 'succeeded', segment_count = $2, word_count = $3,
           utterance_count = $4, detected_language = $5,
           completed_at = now(), updated_at = now()
       WHERE id = $1`,
      [runId, segments.length, totalWordCount, utterances.length, detectedLanguage],
    );

    await reportProgress(100);

    logger.info('Transcription orchestration completed', {
      jobId,
      runId,
      segmentCount: segments.length,
      wordCount: totalWordCount,
      utteranceCount: utterances.length,
      trackId,
      versionId,
      language: detectedLanguage,
    });

    return {
      runId,
      status: 'succeeded',
      segmentCount: segments.length,
      wordCount: totalWordCount,
      utteranceCount: utterances.length,
      subtitleTrackId: trackId,
      subtitleVersionId: versionId,
    };
  } finally {
    // Release advisory lock
    await pool.query('SELECT pg_advisory_unlock($1)', [lockKey]).catch(() => {});
  }
}

// =============================================================================
// Helpers
// =============================================================================

function findSegmentIndex(
  timeMs: number,
  segments: Array<{ index: number; startMs: number; endMs: number }>,
): number {
  for (const seg of segments) {
    if (timeMs >= seg.startMs && timeMs <= seg.endMs) {
      return seg.index;
    }
  }
  return segments.length > 0 ? segments[segments.length - 1].index : 0;
}

async function transitionRunToFailed(runId: string, errorCode: string, errorMessage: string): Promise<void> {
  logger.error('Transcription run failed', { runId, errorCode, errorMessage });
  await pool.query(
    `UPDATE aidilam_app.transcription_runs
     SET status = 'failed', error_code = $2, error_message = $3,
         completed_at = now(), updated_at = now()
     WHERE id = $1`,
    [runId, errorCode, errorMessage],
  );
}

function createPermanentError(message: string): Error & { retryable: boolean } {
  const err = new Error(message) as Error & { retryable: boolean };
  err.retryable = false;
  return err;
}
