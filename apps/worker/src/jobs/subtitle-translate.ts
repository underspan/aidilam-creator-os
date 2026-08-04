/**
 * Subtitle Translate Job Handler
 *
 * Translates subtitle cues from a source version to a target version
 * using a configured translation profile and provider.
 *
 * Now includes:
 * - Glossary term loading when profile references a glossary
 * - Post-translation quality checks (cue alignment, empty count, source copies, timing)
 * - translation_quality_results record creation
 * - translation_usage_records creation
 * - translation_review_assignments when quality requires manual review
 */

import type { JobContext } from './types.js';
import { pool } from '../infrastructure/database.js';
import { logger } from '../logging/index.js';
import { getProvider, type TranslationCue } from './translation-provider.js';

/** Batch size for translation requests */
const TRANSLATION_BATCH_SIZE = 50;

/** Batch size for cue inserts */
const CUE_INSERT_BATCH_SIZE = 100;

export async function handleSubtitleTranslate(context: JobContext): Promise<Record<string, unknown>> {
  const { jobId, inputPayload, reportProgress } = context;
  const translationRunId = inputPayload.translationRunId as string;

  if (!translationRunId) {
    throw createPermanentError('Missing translationRunId in inputPayload');
  }

  logger.info('Subtitle translate started', { jobId, translationRunId });
  await reportProgress(5);

  // Step 1: Load translation run
  const runResult = await pool.query(
    `SELECT id, project_id, source_subtitle_version_id, target_subtitle_version_id,
            translation_profile_id, status
     FROM aidilam_app.translation_runs
     WHERE id = $1`,
    [translationRunId],
  );

  if (runResult.rows.length === 0) {
    throw createPermanentError(`Translation run not found: ${translationRunId}`);
  }

  const run = runResult.rows[0];

  if (run.status !== 'queued' && run.status !== 'requested') {
    throw createPermanentError(`Translation run is not in queued/requested status (current: ${run.status})`);
  }

  // Transition to running
  await pool.query(
    `UPDATE aidilam_app.translation_runs
     SET status = 'running', started_at = now(), updated_at = now()
     WHERE id = $1`,
    [translationRunId],
  );

  await reportProgress(10);

  // Step 2: Load source version cues
  const cuesResult = await pool.query(
    `SELECT cue_index, start_ms, end_ms, text_plain, source_cue_identifier
     FROM aidilam_app.subtitle_cues
     WHERE subtitle_version_id = $1
     ORDER BY cue_index`,
    [run.source_subtitle_version_id],
  );

  if (cuesResult.rows.length === 0) {
    await transitionRunToFailed(translationRunId, 'NO_SOURCE_CUES', 'Source version has no cues');
    throw createPermanentError('Source version has no cues');
  }

  const sourceCues: TranslationCue[] = cuesResult.rows.map((row) => ({
    index: row.cue_index,
    startMs: row.start_ms,
    endMs: row.end_ms,
    text: row.text_plain,
    identifier: row.source_cue_identifier || undefined,
  }));

  await reportProgress(20);

  // Step 3: Load translation profile
  const profileResult = await pool.query(
    `SELECT id, code, source_language, target_language, provider_code, configuration_json
     FROM aidilam_app.translation_profiles
     WHERE id = $1 AND is_active = true`,
    [run.translation_profile_id],
  );

  if (profileResult.rows.length === 0) {
    await transitionRunToFailed(translationRunId, 'PROFILE_NOT_FOUND', 'Translation profile not found or inactive');
    throw createPermanentError('Translation profile not found or inactive');
  }

  const profile = profileResult.rows[0];
  await reportProgress(25);

  // Step 3b: Load glossary entries if project has an active default glossary
  const glossaryTerms = await loadGlossaryTerms(run.project_id, profile.source_language, profile.target_language);

  // Step 4: Get provider from registry (legacy)
  let provider;
  try {
    provider = getProvider(profile.provider_code);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Provider not available';
    await transitionRunToFailed(translationRunId, 'PROVIDER_UNAVAILABLE', message);
    throw createPermanentError(message);
  }

  // Update run with provider info
  await pool.query(
    `UPDATE aidilam_app.translation_runs
     SET provider_code = $2, model_code = $3, updated_at = now()
     WHERE id = $1`,
    [translationRunId, provider.code, profile.provider_code],
  );

  await reportProgress(30);

  // Step 5: Batch cues and translate
  const totalBatches = Math.ceil(sourceCues.length / TRANSLATION_BATCH_SIZE);
  const translatedCues: TranslationCue[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Budget enforcement: atomic serialized check + reservation in one transaction
  const modelConfigRes = await pool.query(
    `SELECT cost_input_per_million, cost_output_per_million FROM aidilam_app.translation_model_configs WHERE code = $1`,
    [profile.provider_code || 'mock_deterministic']
  );
  const budgetPricing = modelConfigRes.rows[0];
  let budgetEstimatedCost = 0;
  let reservationId: string | null = null;

  if (budgetPricing && (Number(budgetPricing.cost_input_per_million) > 0 || Number(budgetPricing.cost_output_per_million) > 0)) {
    const estInputTokens = sourceCues.reduce((sum: number, c: TranslationCue) => sum + (c.text.length || 0), 0);
    const estOutputTokens = Math.ceil(estInputTokens * 1.5);
    budgetEstimatedCost = (estInputTokens / 1000000) * Number(budgetPricing.cost_input_per_million) + (estOutputTokens / 1000000) * Number(budgetPricing.cost_output_per_million);

    // Serialized budget admission: one transaction with FOR UPDATE lock
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the project budget row to serialize concurrent requests
      const budgetRes = await client.query(
        `SELECT per_run_limit, daily_limit, monthly_limit FROM aidilam_app.translation_budgets WHERE project_id = $1 AND is_active = true FOR UPDATE`,
        [run.project_id]
      );

      if (budgetRes.rows.length > 0) {
        const budget = budgetRes.rows[0];

        // Per-run check
        if (budget.per_run_limit !== null && budgetEstimatedCost > Number(budget.per_run_limit)) {
          await client.query('ROLLBACK');
          throw Object.assign(new Error('TRANSLATION_BUDGET_EXCEEDED: estimated cost exceeds per-run limit'), { retryable: false });
        }

        // Daily check (includes active reservations)
        if (budget.daily_limit !== null) {
          const dailySpend = await client.query(
            `SELECT COALESCE(SUM(estimated_cost), 0) + COALESCE((SELECT SUM(estimated_amount) FROM aidilam_app.translation_budget_reservations WHERE project_id = $1 AND status = 'reserved' AND created_at >= CURRENT_DATE), 0) as total FROM aidilam_app.translation_usage_records WHERE project_id = $1 AND created_at >= CURRENT_DATE`,
            [run.project_id]
          );
          if (Number(dailySpend.rows[0].total) + budgetEstimatedCost > Number(budget.daily_limit)) {
            await client.query('ROLLBACK');
            await transitionRunToFailed(translationRunId, 'BUDGET_EXCEEDED', 'TRANSLATION_BUDGET_EXCEEDED: daily limit would be exceeded');
            throw Object.assign(new Error('TRANSLATION_BUDGET_EXCEEDED: daily limit would be exceeded'), { retryable: false });
          }
        }

        // Monthly check (includes active reservations)
        if (budget.monthly_limit !== null) {
          const monthlySpend = await client.query(
            `SELECT COALESCE(SUM(estimated_cost), 0) + COALESCE((SELECT SUM(estimated_amount) FROM aidilam_app.translation_budget_reservations WHERE project_id = $1 AND status = 'reserved' AND created_at >= date_trunc('month', CURRENT_DATE)), 0) as total FROM aidilam_app.translation_usage_records WHERE project_id = $1 AND created_at >= date_trunc('month', CURRENT_DATE)`,
            [run.project_id]
          );
          if (Number(monthlySpend.rows[0].total) + budgetEstimatedCost > Number(budget.monthly_limit)) {
            await client.query('ROLLBACK');
            await transitionRunToFailed(translationRunId, 'BUDGET_EXCEEDED', 'TRANSLATION_BUDGET_EXCEEDED: monthly limit would be exceeded');
            throw Object.assign(new Error('TRANSLATION_BUDGET_EXCEEDED: monthly limit would be exceeded'), { retryable: false });
          }
        }
      }

      // All checks passed — insert reservation atomically within same lock
      const resResult = await client.query(
        `INSERT INTO aidilam_app.translation_budget_reservations
           (project_id, translation_run_id, currency, estimated_amount, status, expires_at)
         VALUES ($1, $2, 'USD', $3, 'reserved', now() + interval '30 minutes')
         ON CONFLICT (translation_run_id) DO UPDATE SET updated_at = now()
         RETURNING id`,
        [run.project_id, translationRunId, budgetEstimatedCost]
      );
      reservationId = resResult.rows[0]?.id || null;

      await client.query('COMMIT');
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch {}
      throw err;
    } finally {
      client.release();
    }
  }

  // Validation-only: simulate pre-provider failure (after reservation, before provider)
  if (
    process.env.AIDILAM_VALIDATION_MODE === 'true' &&
    (profile.configuration_json as Record<string, unknown>)?.validationScenario === 'pre_provider_failure'
  ) {
    await transitionRunToFailed(translationRunId, 'PRE_PROVIDER_FAILURE', 'Simulated pre-provider failure for validation');
    throw createPermanentError('PRE_PROVIDER_FAILURE: simulated failure after reservation');
  }

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batch = sourceCues.slice(
      batchIdx * TRANSLATION_BATCH_SIZE,
      (batchIdx + 1) * TRANSLATION_BATCH_SIZE,
    );

    // Step 6: Call provider
    let result;
    try {
      result = await provider.translateBatch(
        batch,
        profile.source_language,
        profile.target_language,
        profile.configuration_json || {},
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Translation failed';
      await transitionRunToFailed(translationRunId, 'TRANSLATION_ERROR', message);
      throw createPermanentError(`Translation batch ${batchIdx + 1} failed: ${message}`);
    }

    // Step 7: Validate response alignment
    if (result.cues.length !== batch.length) {
      const message = `Response cue count mismatch: expected ${batch.length}, got ${result.cues.length}`;
      await transitionRunToFailed(translationRunId, 'ALIGNMENT_ERROR', message);
      throw createPermanentError(message);
    }

    // Validate indices match
    for (let i = 0; i < batch.length; i++) {
      if (result.cues[i].index !== batch[i].index) {
        const message = `Cue index mismatch at position ${i}: expected ${batch[i].index}, got ${result.cues[i].index}`;
        await transitionRunToFailed(translationRunId, 'ALIGNMENT_ERROR', message);
        throw createPermanentError(message);
      }
    }

    // Estimate token usage from text lengths
    totalInputTokens += batch.reduce((sum, c) => sum + c.text.length, 0);
    totalOutputTokens += result.cues.reduce((sum, c) => sum + c.text.length, 0);

    translatedCues.push(...result.cues);

    // Report progress: 30% to 80% over translation batches
    const batchProgress = 30 + Math.round((batchIdx + 1) / totalBatches * 50);
    await reportProgress(Math.min(batchProgress, 80));
  }

  // Step 8: Create target cues
  const insertBatches = Math.ceil(translatedCues.length / CUE_INSERT_BATCH_SIZE);
  for (let i = 0; i < insertBatches; i++) {
    const batch = translatedCues.slice(
      i * CUE_INSERT_BATCH_SIZE,
      (i + 1) * CUE_INSERT_BATCH_SIZE,
    );
    await insertCueBatch(run.target_subtitle_version_id, batch);
  }

  await reportProgress(85);

  // Step 9: Run quality checks
  const qualityResult = runQualityChecks(sourceCues, translatedCues);

  // Step 9b: Insert translation_quality_results
  await pool.query(
    `INSERT INTO aidilam_app.translation_quality_results
       (translation_run_id, status, cue_alignment_score, empty_translation_count,
        source_copy_count, glossary_violations, timing_violations, length_ratio_warnings, details_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      translationRunId,
      qualityResult.status,
      qualityResult.cueAlignmentScore,
      qualityResult.emptyTranslationCount,
      qualityResult.sourceCopyCount,
      qualityResult.glossaryViolations,
      qualityResult.timingViolations,
      qualityResult.lengthRatioWarnings,
      JSON.stringify(qualityResult.details),
    ],
  );

  // Step 9c: Insert translation_usage_records
  // Calculate cost from model config pricing
  const modelConfig = await pool.query(
    `SELECT cost_input_per_million, cost_output_per_million FROM aidilam_app.translation_model_configs WHERE code = $1`,
    [profile.provider_code || 'mock_default']
  );
  const pricing = modelConfig.rows[0] || { cost_input_per_million: 0, cost_output_per_million: 0 };
  const inputCost = (totalInputTokens / 1000000) * Number(budgetPricing.cost_input_per_million);
  const outputCost = (totalOutputTokens / 1000000) * Number(budgetPricing.cost_output_per_million);
  const estimatedCost = Math.round((inputCost + outputCost) * 10000) / 10000; // 4 decimal places

  await pool.query(
    `INSERT INTO aidilam_app.translation_usage_records
       (project_id, translation_run_id, provider_code, model_code,
        input_units, output_units, estimated_cost, currency, request_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      run.project_id,
      translationRunId,
      provider.code,
      profile.provider_code,
      totalInputTokens,
      totalOutputTokens,
      estimatedCost,
      'USD',
      totalBatches,
    ],
  );

  // Step 9c.2: Commit budget reservation
  if (reservationId) {
    await pool.query(
      `UPDATE aidilam_app.translation_budget_reservations SET status = 'committed', committed_amount = $1, updated_at = now() WHERE id = $2`,
      [estimatedCost, reservationId]
    );
  }

  // Step 9d: Create review assignment if quality requires manual review
  if (qualityResult.status === 'failed' || qualityResult.status === 'manual_review_required') {
    await pool.query(
      `INSERT INTO aidilam_app.translation_review_assignments
         (project_id, subtitle_version_id, translation_run_id, status, priority)
       VALUES ($1, $2, $3, 'unassigned', $4)`,
      [
        run.project_id,
        run.target_subtitle_version_id,
        translationRunId,
        qualityResult.status === 'failed' ? 10 : 5,
      ],
    );
  }

  await reportProgress(90);

  // Step 10: Update target version status=ready
  await pool.query(
    `UPDATE aidilam_app.subtitle_versions
     SET status = 'ready', cue_count = $2
     WHERE id = $1`,
    [run.target_subtitle_version_id, translatedCues.length],
  );

  // Step 11: Transition run to succeeded
  await pool.query(
    `UPDATE aidilam_app.translation_runs
     SET status = 'succeeded', completed_at = now(), updated_at = now()
     WHERE id = $1`,
    [translationRunId],
  );

  await reportProgress(100);

  logger.info('Subtitle translate completed', {
    jobId,
    translationRunId,
    cueCount: translatedCues.length,
    provider: provider.code,
    sourceLanguage: profile.source_language,
    targetLanguage: profile.target_language,
    qualityStatus: qualityResult.status,
  });

  return {
    translationRunId,
    targetVersionId: run.target_subtitle_version_id,
    cueCount: translatedCues.length,
    provider: provider.code,
    qualityStatus: qualityResult.status,
  };
}

// =============================================================================
// Glossary Loading
// =============================================================================

interface GlossaryTerm {
  sourceTerm: string;
  targetTerm: string;
  caseSensitive: boolean;
  matchMode: string;
}

async function loadGlossaryTerms(
  projectId: string,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<GlossaryTerm[]> {
  // Find the default approved glossary for this language pair
  const glossaryResult = await pool.query(
    `SELECT g.id
     FROM aidilam_app.translation_glossaries g
     WHERE g.project_id = $1
       AND g.source_language = $2
       AND g.target_language = $3
       AND g.status = 'approved'
       AND g.is_default = true
     LIMIT 1`,
    [projectId, sourceLanguage, targetLanguage],
  );

  if (glossaryResult.rows.length === 0) {
    return [];
  }

  const glossaryId = glossaryResult.rows[0].id;

  const entriesResult = await pool.query(
    `SELECT source_term, target_term, case_sensitive, match_mode
     FROM aidilam_app.translation_glossary_entries
     WHERE glossary_id = $1 AND is_active = true
     ORDER BY priority DESC`,
    [glossaryId],
  );

  return entriesResult.rows.map((row) => ({
    sourceTerm: row.source_term,
    targetTerm: row.target_term,
    caseSensitive: row.case_sensitive,
    matchMode: row.match_mode,
  }));
}

// =============================================================================
// Quality Checks
// =============================================================================

interface QualityCheckResult {
  status: 'pending' | 'passed' | 'warning' | 'failed' | 'manual_review_required';
  cueAlignmentScore: number;
  emptyTranslationCount: number;
  sourceCopyCount: number;
  glossaryViolations: number;
  timingViolations: number;
  lengthRatioWarnings: number;
  details: Record<string, unknown>;
}

function runQualityChecks(
  sourceCues: TranslationCue[],
  translatedCues: TranslationCue[],
): QualityCheckResult {
  let emptyTranslationCount = 0;
  let sourceCopyCount = 0;
  let timingViolations = 0;

  // Check cue alignment (count match)
  const cueCountMatch = sourceCues.length === translatedCues.length;
  const cueAlignmentScore = cueCountMatch ? 1.0 : translatedCues.length / sourceCues.length;

  for (let i = 0; i < translatedCues.length; i++) {
    const translated = translatedCues[i];
    const source = sourceCues[i];

    // Empty translation check
    if (!translated.text || translated.text.trim() === '') {
      emptyTranslationCount++;
    }

    // Source copy check (translated text === source text)
    if (source && translated.text === source.text) {
      sourceCopyCount++;
    }

    // Timing preservation check
    if (source) {
      if (translated.startMs !== source.startMs || translated.endMs !== source.endMs) {
        timingViolations++;
      }
    }
  }

  // Number preservation check
  const numberPattern = /\d[\d,.]*/g;
  let numberExpected = 0;
  let numberMatched = 0;
  let numberViolations = 0;
  for (let i = 0; i < Math.min(sourceCues.length, translatedCues.length); i++) {
    const sourceNumbers = (sourceCues[i].text.match(numberPattern) || []);
    const translatedNumbers = (translatedCues[i].text.match(numberPattern) || []);
    numberExpected += sourceNumbers.length;
    for (const num of sourceNumbers) {
      if (translatedCues[i].text.includes(num)) {
        numberMatched++;
      } else {
        numberViolations++;
      }
    }
  }

  // Placeholder preservation check
  const placeholderPattern = /\{[^}]+\}|\$\{[^}]+\}|%[A-Z_]+%|\[\[[^\]]+\]\]/g;
  let placeholderExpected = 0;
  let placeholderMatched = 0;
  let placeholderViolations = 0;
  for (let i = 0; i < Math.min(sourceCues.length, translatedCues.length); i++) {
    const sourcePlaceholders = (sourceCues[i].text.match(placeholderPattern) || []);
    placeholderExpected += sourcePlaceholders.length;
    for (const ph of sourcePlaceholders) {
      if (translatedCues[i].text.includes(ph)) {
        placeholderMatched++;
      } else {
        placeholderViolations++;
      }
    }
  }

  // Determine quality status
  let status: QualityCheckResult['status'] = 'passed';

  if (!cueCountMatch || emptyTranslationCount > 0) {
    status = 'failed';
  } else if (numberViolations > 0 || placeholderViolations > 0) {
    status = 'failed';
  } else if (translatedCues.length > 0 && sourceCopyCount / translatedCues.length > 0.5) {
    status = 'warning';
  }

  return {
    status,
    cueAlignmentScore,
    emptyTranslationCount,
    sourceCopyCount,
    glossaryViolations: 0, // TODO: implement glossary violation detection
    timingViolations,
    lengthRatioWarnings: 0,
    details: {
      totalSourceCues: sourceCues.length,
      totalTranslatedCues: translatedCues.length,
      sourceCopyPercentage: translatedCues.length > 0
        ? Math.round((sourceCopyCount / translatedCues.length) * 100)
        : 0,
      numberPreservation: { expected: numberExpected, matched: numberMatched, violations: numberViolations },
      placeholderPreservation: { expected: placeholderExpected, matched: placeholderMatched, violations: placeholderViolations },
    },
  };
}

// =============================================================================
// Helpers
// =============================================================================

async function insertCueBatch(versionId: string, cues: TranslationCue[]): Promise<void> {
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

async function transitionRunToFailed(runId: string, errorCode: string, errorMessage: string): Promise<void> {
  // Release any active budget reservation for this run
  await pool.query(
    `UPDATE aidilam_app.translation_budget_reservations SET status = 'released', updated_at = now() WHERE translation_run_id = $1 AND status = 'reserved'`,
    [runId]
  ).catch(() => {}); // Don't fail on release error
  logger.error('Translation run failed', { runId, errorCode, errorMessage });
  await pool.query(
    `UPDATE aidilam_app.translation_runs
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
