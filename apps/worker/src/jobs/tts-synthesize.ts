/**
 * TTS Synthesize Job Handler
 *
 * Synthesizes speech audio from subtitle cues using a configured TTS profile.
 *
 * Includes:
 * - Budget reservation with atomic serialized check
 * - Per-cue synthesis with cancellation support
 * - Synchronization plan generation
 * - Full narration track concatenation
 * - Usage recording and budget commitment
 */

import type { JobContext } from './types.js';
import { pool } from '../infrastructure/database.js';
import { minioClient, BUCKET } from '../infrastructure/minio.js';
import { logger } from '../logging/index.js';
import { getTtsProvider, type TtsConfig } from './tts-provider.js';
import { createHash } from 'crypto';

// ─── Constants ────────────────────────────────────────────────────────────────

const WAV_HEADER_SIZE = 44;
const BITS_PER_SAMPLE = 16;
const NUM_CHANNELS = 1;
const MAX_CUE_DURATION_MS = 30000;
const RESERVATION_TTL_MINUTES = 30;
const MAX_RATE_ADJUSTMENT = 4.0;

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface TtsRun {
  id: string;
  project_id: string;
  subtitle_version_id: string;
  profile_id: string;
  status: string;
}

interface SubtitleCue {
  cue_index: number;
  start_ms: number;
  end_ms: number;
  text_plain: string;
}

interface TtsProfile {
  id: string;
  provider_code: string;
  voice_code: string;
  speaking_rate: number;
  pitch: number;
  sample_rate: number;
  synchronization_policy: string;
  max_rate_adjustment: number;
  cost_per_1k_characters: number;
  minimum_charge: number;
  configuration_json: Record<string, unknown>;
}

interface CueResult {
  cueIndex: number;
  audioBuffer: Buffer;
  durationMs: number;
  textChecksum: string;
  assetId: string;
  originalStartMs: number;
  originalEndMs: number;
  syncAction?: string;
  adjustedStartMs?: number;
  adjustedEndMs?: number;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function handleTtsSynthesize(context: JobContext): Promise<void> {
  const { jobId, inputPayload, reportProgress } = context;
  const ttsRunId = inputPayload.ttsRunId as string;

  if (!ttsRunId) {
    throw createPermanentError('Missing ttsRunId in inputPayload');
  }

  logger.info('TTS synthesize started', { jobId, ttsRunId });
  await reportProgress(2);

  // Step 1: Load TTS run
  const run = await loadTtsRun(ttsRunId);
  if (!run) {
    throw createPermanentError(`TTS run not found: ${ttsRunId}`);
  }

  // Step 2: Verify status
  if (run.status !== 'queued' && run.status !== 'running') {
    logger.info('TTS run not in actionable status, skipping', { ttsRunId, status: run.status });
    return;
  }

  // Step 3: Transition to running
  await pool.query(
    `UPDATE aidilam_app.tts_runs
     SET status = 'running', started_at = now(), updated_at = now()
     WHERE id = $1`,
    [ttsRunId],
  );
  await reportProgress(5);

  // Step 4: Load subtitle cues
  const cues = await loadSubtitleCues(run.subtitle_version_id);
  if (cues.length === 0) {
    await transitionTtsRunToFailed(ttsRunId, 'NO_CUES', 'Subtitle version has no cues');
    throw createPermanentError('Subtitle version has no cues');
  }
  await reportProgress(10);

  // Step 5: Load TTS profile
  const profile = await loadTtsProfile(run.profile_id);
  if (!profile) {
    await transitionTtsRunToFailed(ttsRunId, 'PROFILE_NOT_FOUND', 'TTS profile not found or inactive');
    throw createPermanentError('TTS profile not found or inactive');
  }
  await reportProgress(15);

  // Step 6: Calculate estimate
  const totalCharacters = cues.reduce((sum, c) => sum + c.text_plain.length, 0);
  const estimatedCost = (totalCharacters / 1000) * profile.cost_per_1k_characters;

  // Step 7: Budget reservation
  let reservationId: string | null = null;
  try {
    reservationId = await reserveBudget(run.project_id, ttsRunId, estimatedCost);
  } catch (err) {
    await transitionTtsRunToFailed(
      ttsRunId,
      'BUDGET_EXCEEDED',
      err instanceof Error ? err.message : 'Budget check failed',
    );
    throw err;
  }
  await reportProgress(20);

  // Step 8: Validation scenario check
  if (
    process.env.AIDILAM_VALIDATION_MODE === 'true' &&
    profile.configuration_json?.validationScenario === 'tts_provider_failure'
  ) {
    await transitionTtsRunToFailed(ttsRunId, 'TTS_PROVIDER_FAILURE', 'Simulated provider failure for validation');
    throw createPermanentError('TTS_PROVIDER_FAILURE: simulated failure');
  }

  // Get provider
  let provider;
  try {
    provider = getTtsProvider(profile.provider_code);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'TTS provider not available';
    await transitionTtsRunToFailed(ttsRunId, 'PROVIDER_UNAVAILABLE', message);
    throw createPermanentError(message);
  }

  const ttsConfig: TtsConfig = {
    voiceCode: profile.voice_code,
    speakingRate: profile.speaking_rate,
    pitch: profile.pitch,
    sampleRate: profile.sample_rate,
    validationScenario: (profile.configuration_json?.validationScenario as string) || undefined,
  };

  // Step 9: Per-cue synthesis loop
  const cueResults: CueResult[] = [];
  let totalAudioMs = 0;

  // Load existing cue results (for recovery after restart)
  const existingCues = await pool.query(
    `SELECT cue_index, audio_asset_id, generated_duration_ms, text_checksum, original_start_ms, original_end_ms
     FROM aidilam_app.tts_cue_results WHERE tts_run_id = $1 AND status = 'synthesized' ORDER BY cue_index`,
    [ttsRunId],
  );
  const completedCueIndices = new Set(existingCues.rows.map((r: { cue_index: number }) => r.cue_index));

  // Reconstruct cueResults from existing data (for sync plan and narration)
  for (const existing of existingCues.rows) {
    // Load audio buffer from MinIO for narration assembly
    const objectKey = `tts/${run.project_id}/${ttsRunId}/cue_${existing.cue_index}.wav`;
    let audioBuffer = Buffer.alloc(0);
    try {
      const stream = await minioClient.getObject(BUCKET, objectKey);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) { chunks.push(Buffer.from(chunk)); }
      audioBuffer = Buffer.concat(chunks);
    } catch { /* Audio may not exist if only DB record was created */ }

    cueResults.push({
      cueIndex: existing.cue_index,
      audioBuffer,
      durationMs: Number(existing.generated_duration_ms),
      textChecksum: existing.text_checksum || '',
      assetId: existing.audio_asset_id,
      originalStartMs: existing.original_start_ms,
      originalEndMs: existing.original_end_ms,
    });
    totalAudioMs += Number(existing.generated_duration_ms);
  }

  try {
    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];

      // Skip already-completed cues (idempotency on retry/recovery)
      if (completedCueIndices.has(cue.cue_index)) {
        continue;
      }

      // Check cancellation
      const cancelled = await checkRunCancellation(ttsRunId);
      if (cancelled) {
        await handleCancellation(ttsRunId, reservationId);
        return;
      }

      // Synthesize cue
      let result;
      try {
        result = await provider.synthesizeCue(cue.text_plain, profile.voice_code, ttsConfig, cue.cue_index);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Synthesis failed';
        logger.error('Cue synthesis failed', { ttsRunId, cueIndex: cue.cue_index, error: message });

        // Record failed cue result
        await insertCueResult(ttsRunId, run.project_id, cue, null, 0, '', null, message);

        // If partial_failure scenario, fail the whole run
        if (
          process.env.AIDILAM_VALIDATION_MODE === 'true' &&
          profile.configuration_json?.validationScenario === 'tts_partial_failure'
        ) {
          await transitionTtsRunToFailed(ttsRunId, 'PARTIAL_FAILURE', `Cue ${cue.cue_index} failed: ${message}`);
          throw createPermanentError(`Partial failure at cue ${cue.cue_index}`);
        }

        // For non-validation scenarios, also fail the whole run on cue error
        await transitionTtsRunToFailed(ttsRunId, 'CUE_SYNTHESIS_FAILED', `Cue ${cue.cue_index}: ${message}`);
        throw createPermanentError(`Cue synthesis failed at index ${cue.cue_index}`);
      }

      // Validate result
      if (!validateWavHeader(result.audioBuffer)) {
        await transitionTtsRunToFailed(ttsRunId, 'INVALID_AUDIO', `Invalid WAV header for cue ${cue.cue_index}`);
        throw createPermanentError(`Invalid WAV audio for cue ${cue.cue_index}`);
      }
      if (result.durationMs <= 0 || result.durationMs > MAX_CUE_DURATION_MS) {
        await transitionTtsRunToFailed(
          ttsRunId,
          'INVALID_DURATION',
          `Invalid duration ${result.durationMs}ms for cue ${cue.cue_index}`,
        );
        throw createPermanentError(`Invalid audio duration for cue ${cue.cue_index}`);
      }

      // Calculate text checksum
      const textChecksum = createHash('sha256').update(cue.text_plain, 'utf8').digest('hex');

      // Store asset in MinIO
      const objectKey = `tts/${run.project_id}/${ttsRunId}/cue_${cue.cue_index}.wav`;
      await minioClient.putObject(BUCKET, objectKey, result.audioBuffer, result.audioBuffer.length, {
        'Content-Type': 'audio/wav',
      });

      // Register asset
      const assetId = await registerAsset(run.project_id, objectKey, result.audioBuffer.length, 'audio/wav', 'derived');

      // Insert cue result
      await insertCueResult(ttsRunId, run.project_id, cue, assetId, result.durationMs, textChecksum, null, null);

      cueResults.push({
        cueIndex: cue.cue_index,
        audioBuffer: result.audioBuffer,
        durationMs: result.durationMs,
        textChecksum,
        assetId,
        originalStartMs: cue.start_ms,
        originalEndMs: cue.end_ms,
      });

      totalAudioMs += result.durationMs;

      // Report progress: 20% to 70% over synthesis
      const synthProgress = 20 + Math.round(((i + 1) / cues.length) * 50);
      await reportProgress(Math.min(synthProgress, 70));
    }
  } catch (err) {
    // If error was already handled (transitionTtsRunToFailed called), rethrow
    throw err;
  }

  await reportProgress(72);

  // Step 10: Synchronization plan
  const syncPlan = generateSyncPlan(cueResults, profile);
  await storeSyncPlan(ttsRunId, run.project_id, syncPlan, cueResults);
  await reportProgress(80);

  // Step 11: Full narration track
  const narrationBuffer = buildNarrationTrack(cueResults, syncPlan, profile.sample_rate);
  const narrationKey = `tts/${run.project_id}/${ttsRunId}/narration.wav`;
  await minioClient.putObject(BUCKET, narrationKey, narrationBuffer, narrationBuffer.length, {
    'Content-Type': 'audio/wav',
  });
  const narrationAssetId = await registerAsset(
    run.project_id,
    narrationKey,
    narrationBuffer.length,
    'audio/wav',
    'derived',
  );
  await pool.query(
    `UPDATE aidilam_app.tts_runs SET output_asset_id = $2, updated_at = now() WHERE id = $1`,
    [ttsRunId, narrationAssetId],
  );
  await reportProgress(88);

  // Step 12: Usage record (idempotent)
  const actualCost = (totalCharacters / 1000) * profile.cost_per_1k_characters;
  await pool.query(
    `INSERT INTO aidilam_app.tts_usage_records
       (project_id, tts_run_id, provider_code, voice_code,
        input_characters, audio_duration_ms, estimated_cost, committed_cost, currency)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'USD')
     ON CONFLICT (tts_run_id) DO UPDATE SET
       input_characters = EXCLUDED.input_characters,
       audio_duration_ms = EXCLUDED.audio_duration_ms,
       estimated_cost = EXCLUDED.estimated_cost,
       committed_cost = EXCLUDED.committed_cost`,
    [run.project_id, ttsRunId, profile.provider_code, profile.voice_code,
     totalCharacters, totalAudioMs, estimatedCost, actualCost],
  );
  await reportProgress(92);

  // Step 13: Commit reservation
  if (reservationId) {
    await pool.query(
      `UPDATE aidilam_app.tts_budget_reservations
       SET status = 'committed', committed_amount = $2, updated_at = now()
       WHERE id = $1`,
      [reservationId, actualCost],
    );
  }
  await reportProgress(95);

  // Step 14: Succeed
  await pool.query(
    `UPDATE aidilam_app.tts_runs
     SET status = 'succeeded', actual_audio_ms = $2, completed_at = now(),
         cue_count = $3, input_character_count = $4, updated_at = now()
     WHERE id = $1`,
    [ttsRunId, totalAudioMs, cues.length, totalCharacters],
  );
  await reportProgress(100);

  logger.info('TTS synthesize completed', {
    jobId,
    ttsRunId,
    cueCount: cues.length,
    totalCharacters,
    totalAudioMs,
    provider: profile.provider_code,
    voice: profile.voice_code,
  });
}

// =============================================================================
// Data Loading
// =============================================================================

async function loadTtsRun(ttsRunId: string): Promise<TtsRun | null> {
  const result = await pool.query(
    `SELECT id, project_id, subtitle_version_id, profile_id, status
     FROM aidilam_app.tts_runs
     WHERE id = $1`,
    [ttsRunId],
  );
  return result.rows[0] || null;
}

async function loadSubtitleCues(subtitleVersionId: string): Promise<SubtitleCue[]> {
  const result = await pool.query(
    `SELECT cue_index, start_ms, end_ms, text_plain
     FROM aidilam_app.subtitle_cues
     WHERE subtitle_version_id = $1
     ORDER BY cue_index`,
    [subtitleVersionId],
  );
  return result.rows;
}

async function loadTtsProfile(profileId: string): Promise<TtsProfile | null> {
  const result = await pool.query(
    `SELECT
       tp.id,
       p.code AS provider_code,
       v.voice_code,
       tp.speaking_rate,
       tp.pitch,
       tp.sample_rate,
       tp.synchronization_policy,
       tp.configuration_json,
       mc.cost_per_1k_characters,
       mc.minimum_request_charge AS minimum_charge
     FROM aidilam_app.tts_profiles tp
     JOIN aidilam_app.tts_providers p ON p.id = tp.provider_id
     JOIN aidilam_app.tts_voices v ON v.id = tp.voice_id
     LEFT JOIN aidilam_app.tts_model_configs mc ON mc.id = tp.model_config_id
     WHERE tp.id = $1`,
    [profileId],
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    provider_code: row.provider_code,
    voice_code: row.voice_code,
    speaking_rate: Number(row.speaking_rate) || 1.0,
    pitch: Number(row.pitch) || 0,
    sample_rate: Number(row.sample_rate) || 22050,
    synchronization_policy: row.synchronization_policy || 'strict_timing',
    max_rate_adjustment: MAX_RATE_ADJUSTMENT,
    cost_per_1k_characters: Number(row.cost_per_1k_characters) || 0,
    minimum_charge: Number(row.minimum_charge) || 0,
    configuration_json: (row.configuration_json as Record<string, unknown>) || {},
  };
}

// =============================================================================
// Budget Reservation
// =============================================================================

async function reserveBudget(projectId: string, ttsRunId: string, estimatedCost: number): Promise<string | null> {
  if (estimatedCost <= 0) return null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the project budget row to serialize concurrent requests
    const budgetRes = await client.query(
      `SELECT per_run_limit, daily_limit, monthly_limit
       FROM aidilam_app.tts_budgets
       WHERE project_id = $1 AND is_active = true
       FOR UPDATE`,
      [projectId],
    );

    if (budgetRes.rows.length > 0) {
      const budget = budgetRes.rows[0];

      // Per-run limit check
      if (budget.per_run_limit !== null && estimatedCost > Number(budget.per_run_limit)) {
        await client.query('ROLLBACK');
        throw createPermanentError(
          `TTS_BUDGET_EXCEEDED: estimated cost $${estimatedCost.toFixed(4)} exceeds per-run limit $${budget.per_run_limit}`,
        );
      }

      // Daily limit check (includes active reservations)
      if (budget.daily_limit !== null) {
        const dailyRes = await client.query(
          `SELECT
             COALESCE(SUM(committed_cost), 0) +
             COALESCE((
               SELECT SUM(estimated_amount)
               FROM aidilam_app.tts_budget_reservations
               WHERE project_id = $1 AND status = 'reserved' AND created_at >= CURRENT_DATE
             ), 0) as total
           FROM aidilam_app.tts_usage_records
           WHERE project_id = $1 AND created_at >= CURRENT_DATE`,
          [projectId],
        );
        const dailyTotal = Number(dailyRes.rows[0].total);
        if (dailyTotal + estimatedCost > Number(budget.daily_limit)) {
          await client.query('ROLLBACK');
          throw createPermanentError(
            `TTS_BUDGET_EXCEEDED: daily limit would be exceeded (current: $${dailyTotal.toFixed(4)}, estimated: $${estimatedCost.toFixed(4)}, limit: $${budget.daily_limit})`,
          );
        }
      }

      // Monthly limit check (includes active reservations)
      if (budget.monthly_limit !== null) {
        const monthlyRes = await client.query(
          `SELECT
             COALESCE(SUM(committed_cost), 0) +
             COALESCE((
               SELECT SUM(estimated_amount)
               FROM aidilam_app.tts_budget_reservations
               WHERE project_id = $1 AND status = 'reserved' AND created_at >= date_trunc('month', CURRENT_DATE)
             ), 0) as total
           FROM aidilam_app.tts_usage_records
           WHERE project_id = $1 AND created_at >= date_trunc('month', CURRENT_DATE)`,
          [projectId],
        );
        const monthlyTotal = Number(monthlyRes.rows[0].total);
        if (monthlyTotal + estimatedCost > Number(budget.monthly_limit)) {
          await client.query('ROLLBACK');
          throw createPermanentError(
            `TTS_BUDGET_EXCEEDED: monthly limit would be exceeded (current: $${monthlyTotal.toFixed(4)}, estimated: $${estimatedCost.toFixed(4)}, limit: $${budget.monthly_limit})`,
          );
        }
      }
    }

    // All checks passed — insert reservation atomically
    const resResult = await client.query(
      `INSERT INTO aidilam_app.tts_budget_reservations
         (project_id, tts_run_id, currency, estimated_amount, status, expires_at)
       VALUES ($1, $2, 'USD', $3, 'reserved', now() + interval '${RESERVATION_TTL_MINUTES} minutes')
       ON CONFLICT (tts_run_id) DO UPDATE
         SET estimated_amount = EXCLUDED.estimated_amount, status = 'reserved',
             expires_at = EXCLUDED.expires_at, updated_at = now()
       RETURNING id`,
      [projectId, ttsRunId, estimatedCost],
    );
    const reservationId = resResult.rows[0]?.id || null;

    await client.query('COMMIT');
    return reservationId;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore rollback error */ }
    throw err;
  } finally {
    client.release();
  }
}

// =============================================================================
// Cancellation
// =============================================================================

async function checkRunCancellation(ttsRunId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT status FROM aidilam_app.tts_runs WHERE id = $1`,
    [ttsRunId],
  );
  return result.rows[0]?.status === 'cancel_requested';
}

async function handleCancellation(ttsRunId: string, reservationId: string | null): Promise<void> {
  logger.info('TTS run cancellation detected', { ttsRunId });

  // Release reservation
  if (reservationId) {
    await pool.query(
      `UPDATE aidilam_app.tts_budget_reservations
       SET status = 'released', updated_at = now()
       WHERE id = $1 AND status = 'reserved'`,
      [reservationId],
    );
  }

  // Set cancelled status
  await pool.query(
    `UPDATE aidilam_app.tts_runs
     SET status = 'cancelled', cancelled_at = now(), updated_at = now()
     WHERE id = $1`,
    [ttsRunId],
  );
}

// =============================================================================
// Asset Registration
// =============================================================================

async function registerAsset(
  projectId: string,
  objectKey: string,
  sizeBytes: number,
  mimeType: string,
  assetType: string,
): Promise<string> {
  const result = await pool.query(
    `INSERT INTO aidilam_app.assets
       (project_id, bucket_name, object_key, content_type, size_bytes, status, media_kind, asset_role)
     VALUES ($1, $2, $3, $4, $5, 'available', 'audio', 'source')
     RETURNING id`,
    [projectId, BUCKET, objectKey, mimeType, sizeBytes],
  );
  return result.rows[0].id;
}

// =============================================================================
// Cue Result Recording
// =============================================================================

async function insertCueResult(
  ttsRunId: string,
  projectId: string,
  cue: SubtitleCue,
  assetId: string | null,
  durationMs: number,
  textChecksum: string,
  syncAction: string | null,
  errorMessage: string | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO aidilam_app.tts_cue_results
       (tts_run_id, project_id, cue_index, original_start_ms, original_end_ms, original_duration_ms,
        generated_duration_ms, text_checksum, audio_asset_id, sync_action, status, error_code)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [ttsRunId, projectId, cue.cue_index, cue.start_ms, cue.end_ms, cue.end_ms - cue.start_ms,
     durationMs, textChecksum, assetId, syncAction || 'none', assetId ? 'synthesized' : 'failed', errorMessage],
  );
}

// =============================================================================
// Synchronization Plan
// =============================================================================

interface SyncPlanEntry {
  cueIndex: number;
  originalDurationMs: number;
  generatedDurationMs: number;
  action: string;
  adjustedStartMs: number;
  adjustedEndMs: number;
  rateAdjustment?: number;
}

interface SyncPlanSummary {
  entries: SyncPlanEntry[];
  overflowCount: number;
  rateAdjustedCount: number;
  extendedCount: number;
  shiftedCount: number;
  manualReviewCount: number;
  pauseAdjustedCount: number;
}

function generateSyncPlan(cueResults: CueResult[], profile: TtsProfile): SyncPlanSummary {
  const policy = profile.synchronization_policy;
  const maxRate = profile.max_rate_adjustment || MAX_RATE_ADJUSTMENT;
  const entries: SyncPlanEntry[] = [];
  let cumulativeShift = 0;

  let overflowCount = 0;
  let rateAdjustedCount = 0;
  let extendedCount = 0;
  let shiftedCount = 0;
  let manualReviewCount = 0;
  let pauseAdjustedCount = 0;

  for (const cue of cueResults) {
    const originalDuration = cue.originalEndMs - cue.originalStartMs;
    const generatedDuration = cue.durationMs;
    const isOverflow = generatedDuration > originalDuration;

    let action = 'none';
    let adjustedStartMs = cue.originalStartMs + cumulativeShift;
    let adjustedEndMs = cue.originalEndMs + cumulativeShift;
    let rateAdjustment: number | undefined;

    if (!isOverflow) {
      // Generated fits within original — may need pause fill
      if (generatedDuration < originalDuration) {
        action = 'pause_adjusted';
        pauseAdjustedCount++;
      }
    } else {
      // Generated is longer than available
      switch (policy) {
        case 'strict_timing':
          action = 'overflow';
          overflowCount++;
          break;

        case 'fit_with_rate': {
          const rate = generatedDuration / originalDuration;
          if (rate <= maxRate) {
            action = 'rate_adjusted';
            rateAdjustment = rate;
            rateAdjustedCount++;
          } else {
            action = 'overflow_manual_review';
            overflowCount++;
            manualReviewCount++;
          }
          break;
        }

        case 'extend_cue':
          action = 'extended';
          adjustedEndMs = adjustedStartMs + generatedDuration;
          extendedCount++;
          break;

        case 'shift_following': {
          action = 'shifted';
          adjustedEndMs = adjustedStartMs + generatedDuration;
          const shift = generatedDuration - originalDuration;
          cumulativeShift += shift;
          shiftedCount++;
          break;
        }

        case 'manual_review':
          action = 'manual_review';
          manualReviewCount++;
          break;

        default:
          action = 'overflow';
          overflowCount++;
          break;
      }
    }

    entries.push({
      cueIndex: cue.cueIndex,
      originalDurationMs: originalDuration,
      generatedDurationMs: generatedDuration,
      action,
      adjustedStartMs,
      adjustedEndMs,
      rateAdjustment,
    });

    // Store back onto cueResult for later use
    cue.syncAction = action;
    cue.adjustedStartMs = adjustedStartMs;
    cue.adjustedEndMs = adjustedEndMs;
  }

  return {
    entries,
    overflowCount,
    rateAdjustedCount,
    extendedCount,
    shiftedCount,
    manualReviewCount,
    pauseAdjustedCount,
  };
}

async function storeSyncPlan(
  ttsRunId: string,
  projectId: string,
  plan: SyncPlanSummary,
  cueResults: CueResult[],
): Promise<void> {
  // Compute totals from entries
  const fitCount = plan.entries.filter(e => e.action === 'none' || e.action === 'fit').length;
  const originalTotalMs = plan.entries.reduce((s, e) => s + e.originalDurationMs, 0);
  const generatedTotalMs = plan.entries.reduce((s, e) => s + e.generatedDurationMs, 0);
  const adjustedTotalMs = plan.entries.reduce((s, e) => s + (e.adjustedEndMs - e.adjustedStartMs), 0);

  // Insert sync plan summary (idempotent on retry)
  await pool.query(
    `INSERT INTO aidilam_app.tts_sync_plans
       (tts_run_id, project_id, strategy, original_total_ms, generated_total_ms, adjusted_total_ms,
        fit_count, overflow_count, rate_adjustment_count, pause_adjustment_count,
        overlap_count, manual_review_required, quality_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (tts_run_id) DO UPDATE SET
       original_total_ms = EXCLUDED.original_total_ms,
       generated_total_ms = EXCLUDED.generated_total_ms,
       adjusted_total_ms = EXCLUDED.adjusted_total_ms,
       fit_count = EXCLUDED.fit_count,
       overflow_count = EXCLUDED.overflow_count,
       rate_adjustment_count = EXCLUDED.rate_adjustment_count,
       pause_adjustment_count = EXCLUDED.pause_adjustment_count,
       quality_status = EXCLUDED.quality_status`,
    [ttsRunId, projectId, 'fit_with_rate',
     originalTotalMs, generatedTotalMs, adjustedTotalMs,
     fitCount, plan.overflowCount || 0, plan.rateAdjustedCount || 0,
     plan.pauseAdjustedCount || 0, 0,
     (plan.overflowCount || 0) > 0 || (plan.manualReviewCount || 0) > 0,
     (plan.overflowCount || 0) > 0 ? 'failed' : (plan.rateAdjustedCount || 0) > 0 ? 'warning' : 'passed'],
  );

  // Update cue results with sync adjustments
  for (const entry of plan.entries) {
    await pool.query(
      `UPDATE aidilam_app.tts_cue_results
       SET adjusted_start_ms = $2, adjusted_end_ms = $3, sync_action = $4, updated_at = now()
       WHERE tts_run_id = $1 AND cue_index = $5`,
      [ttsRunId, entry.adjustedStartMs, entry.adjustedEndMs, entry.action, entry.cueIndex],
    );
  }
}

// =============================================================================
// Narration Track Builder
// =============================================================================

function buildNarrationTrack(cueResults: CueResult[], syncPlan: SyncPlanSummary, sampleRate: number): Buffer {
  const bytesPerSample = BITS_PER_SAMPLE / 8;
  const buffers: Buffer[] = [];

  for (let i = 0; i < cueResults.length; i++) {
    const cue = cueResults[i];
    const entry = syncPlan.entries[i];

    // Add the audio data (skip WAV header from each cue)
    const audioData = cue.audioBuffer.subarray(WAV_HEADER_SIZE);
    buffers.push(audioData);

    // If pause_adjusted, insert silence between this cue and next
    if (entry.action === 'pause_adjusted' && i < cueResults.length - 1) {
      const originalDuration = entry.originalDurationMs;
      const generatedDuration = entry.generatedDurationMs;
      const silenceMs = originalDuration - generatedDuration;

      if (silenceMs > 0) {
        const silenceSamples = Math.floor((silenceMs / 1000) * sampleRate);
        const silenceBytes = silenceSamples * NUM_CHANNELS * bytesPerSample;
        const silenceBuffer = Buffer.alloc(silenceBytes, 0);
        buffers.push(silenceBuffer);
      }
    }
  }

  // Concatenate all audio data
  const totalDataSize = buffers.reduce((sum, buf) => sum + buf.length, 0);
  const totalFileSize = WAV_HEADER_SIZE + totalDataSize;

  // Build final WAV with combined header
  const output = Buffer.alloc(totalFileSize);

  // Write WAV header
  output.write('RIFF', 0, 'ascii');
  output.writeUInt32LE(totalFileSize - 8, 4);
  output.write('WAVE', 8, 'ascii');

  // fmt chunk
  output.write('fmt ', 12, 'ascii');
  output.writeUInt32LE(16, 16); // chunk size
  output.writeUInt16LE(1, 20); // PCM format
  output.writeUInt16LE(NUM_CHANNELS, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * NUM_CHANNELS * bytesPerSample, 28); // byte rate
  output.writeUInt16LE(NUM_CHANNELS * bytesPerSample, 32); // block align
  output.writeUInt16LE(BITS_PER_SAMPLE, 34);

  // data chunk
  output.write('data', 36, 'ascii');
  output.writeUInt32LE(totalDataSize, 40);

  // Copy audio data
  let offset = WAV_HEADER_SIZE;
  for (const buf of buffers) {
    buf.copy(output, offset);
    offset += buf.length;
  }

  return output;
}

// =============================================================================
// WAV Validation
// =============================================================================

function validateWavHeader(buffer: Buffer): boolean {
  if (buffer.length < WAV_HEADER_SIZE) return false;
  const riff = buffer.toString('ascii', 0, 4);
  const wave = buffer.toString('ascii', 8, 12);
  return riff === 'RIFF' && wave === 'WAVE';
}

// =============================================================================
// Failure & Error Handling
// =============================================================================

async function transitionTtsRunToFailed(
  ttsRunId: string,
  errorCode: string,
  errorMessage: string,
): Promise<void> {
  logger.error('TTS run failed', { ttsRunId, errorCode, errorMessage });

  // Release any active budget reservation
  await pool.query(
    `UPDATE aidilam_app.tts_budget_reservations
     SET status = 'released', updated_at = now()
     WHERE tts_run_id = $1 AND status = 'reserved'`,
    [ttsRunId],
  ).catch(() => { /* Don't fail on release error */ });

  // Transition run to failed
  await pool.query(
    `UPDATE aidilam_app.tts_runs
     SET status = 'failed', error_code = $2, error_message_safe = $3,
         completed_at = now(), updated_at = now()
     WHERE id = $1`,
    [ttsRunId, errorCode, errorMessage],
  );
}

function createPermanentError(message: string): Error & { retryable: boolean } {
  const err = new Error(message) as Error & { retryable: boolean };
  err.retryable = false;
  return err;
}
