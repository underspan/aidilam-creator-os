/**
 * Publishing Worker Processor
 * AIDILAM-DEP-015D1
 *
 * Handles: queue contract, claim, attempt creation, mock adapter execution,
 * success/failure settlement, usage commitment, reservation settlement.
 */
import { Worker, Queue, Job } from 'bullmq';
import { createRedisConnection } from '../queue/connection.js';
import { config } from '../config/index.js';
import { logger } from '../logging/index.js';
import { pool } from '../infrastructure/database.js';
import { getPublishingAdapter, detectCredentialFields } from './publishing-adapter.js';
import type { ServerResolvedPublishInput, PublishResult, PublishingAdapter } from './publishing-adapter.js';

const PUBLISHING_QUEUE_NAME = 'aidilam-publishing';
const PUBLISHING_PREFIX = 'aidilam:pub';
const WORKER_ID = `pub-worker-${process.pid}`;

// ═══════════════════════════════════════════════════════════════════════════════
// Queue + Worker instances
// ═══════════════════════════════════════════════════════════════════════════════

export const publishingQueue = new Queue(PUBLISHING_QUEUE_NAME, {
  connection: createRedisConnection(),
  prefix: PUBLISHING_PREFIX,
  defaultJobOptions: {
    attempts: 1, // D1: no automatic retry
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
});

let publishingWorker: Worker | null = null;

// ═══════════════════════════════════════════════════════════════════════════════
// Enqueue Service
// ═══════════════════════════════════════════════════════════════════════════════

export interface PublishingEnqueuePayload {
  jobId: string;
  projectId: string;
  enqueueReason: string;
  expectedStatus: string;
  queueVersion: number;
}

/**
 * Enqueue a publishing job. Uses deterministic BullMQ job ID to prevent duplicates.
 */
export async function enqueuePublishingJob(
  jobId: string,
  projectId: string,
  reason: string = 'job_created',
): Promise<boolean> {
  const payload: PublishingEnqueuePayload = {
    jobId,
    projectId,
    enqueueReason: reason,
    expectedStatus: 'queued',
    queueVersion: 1,
  };
  // Use timestamp suffix for concurrency-wait requeues to avoid BullMQ ID collision
  const isRequeue = reason.includes('concurrency_wait') || reason === 'reconciliation' || reason === 'stale_retry_recovery';
  const bullmqJobId = isRequeue ? `pub-${jobId}-${Date.now()}` : `pub-${jobId}`;
  try {
    await publishingQueue.add('publish', payload, { jobId: bullmqJobId, ...(isRequeue ? { delay: 2000 } : {}) });
    logger.info('Publishing job enqueued', { jobId, bullmqJobId, reason });
    return true;
  } catch (err: any) {
    if (err.message?.includes('already exists')) {
      logger.info('Publishing job already enqueued (duplicate no-op)', { jobId });
      return true;
    }
    logger.error('Failed to enqueue publishing job', { jobId, error: err.message });
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Scheduler Promotion
// ═══════════════════════════════════════════════════════════════════════════════

const SCHEDULER_BATCH_SIZE = 50;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;

export async function promoteScheduledJobs(): Promise<number> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE aidilam_app.publishing_jobs
       SET status = 'queued', updated_at = now()
       WHERE id IN (
         SELECT id FROM aidilam_app.publishing_jobs
         WHERE status = 'scheduled' AND scheduled_at <= now()
         ORDER BY scheduled_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, project_id`,
      [SCHEDULER_BATCH_SIZE]
    );

    for (const row of result.rows) {
      await client.query(
        `INSERT INTO aidilam_app.publishing_audit_events (project_id, publishing_job_id, event_type, actor_type, actor_id, metadata_safe_json)
         VALUES ($1, $2, 'publishing_scheduled_job_promoted', 'system', $3, '{}')`,
        [row.project_id, row.id, WORKER_ID]
      );
      await enqueuePublishingJob(row.id, row.project_id, 'scheduler_promotion');
    }

    if (result.rows.length > 0) {
      logger.info('Scheduled jobs promoted', { count: result.rows.length });
    }
    return result.rows.length;
  } finally {
    client.release();
  }
}

export function startScheduler(intervalMs: number = 10000): void {
  schedulerInterval = setInterval(async () => {
    try {
      await promoteScheduledJobs();
      await reconcileMissingEnqueues();
      await recoverStaleJobs();
    } catch (err: any) {
      logger.error('Scheduler error', { error: err.message });
    }
  }, intervalMs);
  logger.info('Publishing scheduler started', { intervalMs });
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info('Publishing scheduler stopped');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Reconciliation
// ═══════════════════════════════════════════════════════════════════════════════

export async function reconcileMissingEnqueues(): Promise<number> {
  // Find queued DB jobs that have no active/waiting BullMQ item
  const result = await pool.query(
    `SELECT id, project_id FROM aidilam_app.publishing_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 100`
  );
  let enqueued = 0;
  for (const row of result.rows) {
    const bullmqJobId = `pub-${row.id}`;
    const existing = await publishingQueue.getJob(bullmqJobId);
    if (!existing || (await existing.isCompleted()) || (await existing.isFailed())) {
      await enqueuePublishingJob(row.id, row.project_id, 'reconciliation');
      enqueued++;
    }
  }
  if (enqueued > 0) logger.info('Reconciliation enqueued jobs', { count: enqueued });
  return enqueued;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Stale Recovery
// ═══════════════════════════════════════════════════════════════════════════════

const STALE_THRESHOLD_MS = 120000; // 2 minutes without update = stale

export async function recoverStaleJobs(): Promise<number> {
  const client = await pool.connect();
  try {
    // Find stale publishing jobs (updated_at older than threshold)
    const staleJobs = await client.query(
      `SELECT j.id, j.project_id, j.current_attempt, j.max_attempts, j.status
       FROM aidilam_app.publishing_jobs j
       WHERE j.status IN ('publishing', 'cancel_requested')
         AND j.updated_at < now() - interval '${STALE_THRESHOLD_MS / 1000} seconds'
       ORDER BY j.updated_at ASC
       LIMIT 10
       FOR UPDATE SKIP LOCKED`
    );

    let recovered = 0;
    for (const job of staleJobs.rows) {
      await client.query('BEGIN');
      try {
        // Mark stale attempt as failed
        await client.query(
          `UPDATE aidilam_app.publishing_attempts SET status = 'retryable_failed', error_code = 'PUBLISHING_WORKER_STALE', error_message_safe = 'Worker stale recovery', completed_at = now() WHERE publishing_job_id = $1 AND status = 'running'`,
          [job.id]
        );

        if (job.status === 'cancel_requested') {
          // Stale cancel → settle as cancelled
          await client.query(`UPDATE aidilam_app.publishing_jobs SET status = 'cancelled', current_stage = 'cancelled', completed_at = now(), updated_at = now() WHERE id = $1`, [job.id]);
          await client.query(`UPDATE aidilam_app.publishing_quota_reservations SET status = 'released', settled_at = now(), updated_at = now() WHERE publishing_job_id = $1 AND status = 'reserved'`, [job.id]);
          await client.query(`INSERT INTO aidilam_app.publishing_audit_events (project_id, publishing_job_id, event_type, actor_type, actor_id, metadata_safe_json) VALUES ($1, $2, 'publishing_stale_cancel_recovered', 'system', $3, '{}')`, [job.project_id, job.id, WORKER_ID]);
        } else if (job.current_attempt >= job.max_attempts) {
          // Exhausted → terminal failure
          await client.query(`UPDATE aidilam_app.publishing_jobs SET status = 'failed', error_code = 'PUBLISHING_RETRY_EXHAUSTED', error_message_safe = 'Stale recovery exhausted', completed_at = now(), updated_at = now() WHERE id = $1`, [job.id]);
          await client.query(`UPDATE aidilam_app.publishing_quota_reservations SET status = 'released', settled_at = now(), updated_at = now() WHERE publishing_job_id = $1 AND status = 'reserved'`, [job.id]);
          await client.query(`INSERT INTO aidilam_app.publishing_audit_events (project_id, publishing_job_id, event_type, actor_type, actor_id, metadata_safe_json) VALUES ($1, $2, 'publishing_stale_exhausted', 'system', $3, '{}')`, [job.project_id, job.id, WORKER_ID]);
        } else {
          // Retryable → retry_wait + enqueue delayed retry
          await client.query(`UPDATE aidilam_app.publishing_jobs SET status = 'retry_wait', current_stage = 'retry_wait', error_code = 'PUBLISHING_WORKER_STALE', updated_at = now() WHERE id = $1`, [job.id]);
          await client.query(`INSERT INTO aidilam_app.publishing_audit_events (project_id, publishing_job_id, event_type, actor_type, actor_id, metadata_safe_json) VALUES ($1, $2, 'publishing_stale_recovery', 'system', $3, '{}')`, [job.project_id, job.id, WORKER_ID]);
          // Enqueue delayed retry
          const nextAttempt = job.current_attempt + 1;
          const retryId = `pub-${job.id}-attempt-${nextAttempt}`;
          try {
            await publishingQueue.add('publish', { jobId: job.id, projectId: job.project_id, enqueueReason: 'stale_recovery', expectedStatus: 'retry_wait', queueVersion: 1 }, { jobId: retryId, delay: 5000 });
          } catch { /* duplicate ok */ }
        }

        await client.query('COMMIT');
        recovered++;
        logger.info('Stale job recovered', { jobId: job.id, status: job.status });
      } catch (err: any) {
        await client.query('ROLLBACK');
        logger.error('Stale recovery failed for job', { jobId: job.id, error: err.message });
      }
    }

    // Also recover missing retry-wait items
    const staleRetry = await client.query(
      `SELECT id, project_id FROM aidilam_app.publishing_jobs WHERE status = 'retry_wait' AND updated_at < now() - interval '60 seconds' LIMIT 20`
    );
    for (const row of staleRetry.rows) {
      await enqueuePublishingJob(row.id, row.project_id, 'stale_retry_recovery');
      recovered++;
    }

    if (recovered > 0) logger.info('Stale recovery completed', { count: recovered });
    return recovered;
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Worker Processor
// ═══════════════════════════════════════════════════════════════════════════════

async function processPublishingJob(job: Job<PublishingEnqueuePayload>): Promise<void> {
  const { jobId, projectId } = job.data;
  const logCtx = { jobId, projectId, bullmqId: job.id, worker: WORKER_ID };

  logger.info('Publishing worker received job', logCtx);

  const client = await pool.connect();
  try {
    // ─── CLAIM ───
    await client.query('BEGIN');
    const jobRow = await client.query(
      `SELECT j.id, j.status, j.publishing_profile_id, j.source_asset_id, j.current_attempt, j.max_attempts
       FROM aidilam_app.publishing_jobs j
       WHERE j.id = $1 AND j.project_id = $2
       FOR UPDATE`,
      [jobId, projectId]
    );

    if (jobRow.rows.length === 0) {
      await client.query('ROLLBACK');
      logger.warn('Publishing job not found or wrong project', logCtx);
      return;
    }

    const jb = jobRow.rows[0];

    // Idempotency: if already terminal/non-queued, skip
    if (jb.status !== 'queued' && jb.status !== 'retry_wait') {
      await client.query('ROLLBACK');
      logger.info('Publishing job not in claimable state, skipping', { ...logCtx, status: jb.status });
      return;
    }

    // ─── DB-BACKED CONCURRENCY ADMISSION (advisory-lock serialized) ───
    const globalLimit = parseInt(process.env.PUBLISHING_GLOBAL_CONCURRENCY || '2', 10);
    const projectLimit = parseInt(process.env.PUBLISHING_PROJECT_CONCURRENCY || '3', 10);
    const platformLimit = parseInt(process.env.PUBLISHING_PLATFORM_CONCURRENCY || '10', 10);
    const accountLimit = parseInt(process.env.PUBLISHING_ACCOUNT_CONCURRENCY || '10', 10);

    // Resolve profile IDs for lock keys
    const profRow = await client.query(`SELECT platform_id, publishing_account_id FROM aidilam_app.publishing_profiles WHERE id = $1`, [jb.publishing_profile_id]);
    const platformId = profRow.rows[0]?.platform_id || '';
    const accountId = profRow.rows[0]?.publishing_account_id || '';

    // Acquire advisory locks in stable order: global → project → platform → account
    // This prevents deadlocks across concurrent workers
    const globalKey = Buffer.from('pub:global:capacity').reduce((h, b) => (h * 31 + b) | 0, 0);
    const projectKey = Buffer.from(`pub:project:${projectId}`).reduce((h, b) => (h * 31 + b) | 0, 0);
    const platformKey2 = Buffer.from(`pub:platform:${platformId}`).reduce((h, b) => (h * 31 + b) | 0, 0);
    const accountKey = Buffer.from(`pub:account:${accountId}`).reduce((h, b) => (h * 31 + b) | 0, 0);

    await client.query('SELECT pg_advisory_xact_lock($1)', [globalKey]);
    await client.query('SELECT pg_advisory_xact_lock($1)', [projectKey]);
    await client.query('SELECT pg_advisory_xact_lock($1)', [platformKey2]);
    await client.query('SELECT pg_advisory_xact_lock($1)', [accountKey]);

    // Now count under serialized lock — safe across all worker processes
    const globalActive = await client.query(`SELECT count(*) as cnt FROM aidilam_app.publishing_jobs WHERE status = 'publishing'`);
    if (Number(globalActive.rows[0].cnt) >= globalLimit) {
      await client.query('ROLLBACK');
      logger.info('Global concurrency limit reached, requeuing', { ...logCtx, active: globalActive.rows[0].cnt, limit: globalLimit });
      enqueuePublishingJob(jobId, projectId, 'concurrency_wait').catch(() => {});
      return;
    }

    const projActive = await client.query(`SELECT count(*) as cnt FROM aidilam_app.publishing_jobs WHERE project_id = $1 AND status = 'publishing'`, [projectId]);
    if (Number(projActive.rows[0].cnt) >= projectLimit) {
      await client.query('ROLLBACK');
      logger.info('Project concurrency limit reached, requeuing', { ...logCtx, active: projActive.rows[0].cnt, limit: projectLimit });
      enqueuePublishingJob(jobId, projectId, 'project_concurrency_wait').catch(() => {});
      return;
    }

    const platActive = await client.query(`SELECT count(*) as cnt FROM aidilam_app.publishing_jobs j JOIN aidilam_app.publishing_profiles p ON p.id = j.publishing_profile_id WHERE j.status = 'publishing' AND p.platform_id = $1`, [platformId]);
    if (Number(platActive.rows[0].cnt) >= platformLimit) {
      await client.query('ROLLBACK');
      logger.info('Platform concurrency limit reached, requeuing', { ...logCtx, active: platActive.rows[0].cnt, limit: platformLimit });
      enqueuePublishingJob(jobId, projectId, 'platform_concurrency_wait').catch(() => {});
      return;
    }

    const acctActive = await client.query(`SELECT count(*) as cnt FROM aidilam_app.publishing_jobs j JOIN aidilam_app.publishing_profiles p ON p.id = j.publishing_profile_id WHERE j.status = 'publishing' AND p.publishing_account_id = $1`, [accountId]);
    if (Number(acctActive.rows[0].cnt) >= accountLimit) {
      await client.query('ROLLBACK');
      logger.info('Account concurrency limit reached, requeuing', { ...logCtx, active: acctActive.rows[0].cnt, limit: accountLimit });
      enqueuePublishingJob(jobId, projectId, 'account_concurrency_wait').catch(() => {});
      return;
    }

    // Claim: queued → publishing
    const attemptNumber = (jb.current_attempt || 0) + 1;
    await client.query(
      `UPDATE aidilam_app.publishing_jobs SET status = 'publishing', current_attempt = $2, progress_percent = 0, current_stage = 'executing', started_at = COALESCE(started_at, now()), updated_at = now() WHERE id = $1`,
      [jobId, attemptNumber]
    );

    // Create attempt
    const attemptRes = await client.query(
      `INSERT INTO aidilam_app.publishing_attempts (publishing_job_id, project_id, attempt_number, status, adapter_key, started_at)
       VALUES ($1, $2, $3, 'running', 'pending', now()) RETURNING id`,
      [jobId, projectId, attemptNumber]
    );
    const attemptId = attemptRes.rows[0].id;

    await client.query(
      `INSERT INTO aidilam_app.publishing_audit_events (project_id, publishing_job_id, event_type, actor_type, actor_id, metadata_safe_json)
       VALUES ($1, $2, 'publishing_attempt_started', 'system', $3, $4)`,
      [projectId, jobId, WORKER_ID, JSON.stringify({ attemptNumber, attemptId })]
    );
    await client.query('COMMIT');
    logger.info('Publishing job claimed', { ...logCtx, attemptId, attemptNumber });

    // ─── LOAD PLAN ───
    const planRes = await pool.query(
      `SELECT p.*, pp.platform_key, pp.adapter_key as plan_adapter_key
       FROM aidilam_app.publishing_plans p
       JOIN aidilam_app.publishing_profiles prof ON prof.id = (SELECT publishing_profile_id FROM aidilam_app.publishing_jobs WHERE id = $1)
       JOIN aidilam_app.publishing_platforms pp ON pp.id = prof.platform_id
       WHERE p.publishing_job_id = $1 AND p.project_id = $2`,
      [jobId, projectId]
    );
    if (planRes.rows.length === 0) {
      await settleFailure(jobId, projectId, attemptId, 'PUBLISHING_PLAN_NOT_FOUND', 'Immutable plan not found');
      return;
    }
    const plan = planRes.rows[0];
    const platformKey = plan.platform_key;
    const adapterKey = (plan.adapter_snapshot_json?.adapterKey) || plan.plan_adapter_key || `mock-${platformKey}`;

    // Update attempt with actual adapter key
    await pool.query(`UPDATE aidilam_app.publishing_attempts SET adapter_key = $1 WHERE id = $2`, [adapterKey, attemptId]);

    // ─── VERIFY RESERVATION ───
    const resRes = await pool.query(
      `SELECT id, status FROM aidilam_app.publishing_quota_reservations WHERE publishing_job_id = $1 AND status = 'reserved'`,
      [jobId]
    );
    if (resRes.rows.length === 0) {
      await settleFailure(jobId, projectId, attemptId, 'PUBLISHING_RESERVATION_NOT_FOUND', 'No active reservation');
      return;
    }

    // ─── VERIFY SOURCE ASSET ───
    const sourceSnapshot = plan.source_asset_snapshot_json || {};
    const assetId = sourceSnapshot.assetId || jb.source_asset_id;
    const assetRes = await pool.query(
      `SELECT id, status, bucket_name, object_key, size_bytes, content_type, checksum_sha256 FROM aidilam_app.assets WHERE id = $1 AND project_id = $2`,
      [assetId, projectId]
    );
    if (assetRes.rows.length === 0 || assetRes.rows[0].status !== 'available') {
      await settleFailure(jobId, projectId, attemptId, 'PUBLISHING_SOURCE_NOT_FOUND', 'Source asset not found or unavailable');
      return;
    }

    // Checksum validation (if plan recorded a checksum and asset has one)
    const planChecksum = sourceSnapshot.checksumSha256;
    const assetChecksum = assetRes.rows[0].checksum_sha256;
    if (planChecksum && assetChecksum && planChecksum !== assetChecksum) {
      await settleFailure(jobId, projectId, attemptId, 'PUBLISHING_SOURCE_INVALID', 'Source asset checksum mismatch');
      return;
    }

    // ─── MOCK-ONLY GUARD ───
    if (!adapterKey.startsWith('mock')) {
      await settleFailure(jobId, projectId, attemptId, 'PUBLISHING_ADAPTER_DISABLED', 'Non-mock adapters blocked in current mode');
      return;
    }

    // ─── WORKSPACE CREATION ───
    // Check for workspace-failure validation scenario
    const adapterSnapshot = plan.adapter_snapshot_json || {};
    if (process.env.AIDILAM_VALIDATION_MODE === 'true' && adapterSnapshot.validationScenario === 'publish_workspace_creation_failure') {
      const profCheck = await pool.query(`SELECT is_validation_only FROM aidilam_app.publishing_profiles WHERE id = $1`, [jb.publishing_profile_id]);
      if (profCheck.rows[0]?.is_validation_only) {
        logger.info('Workspace creation failure triggered (validation scenario)', { jobId });
        await settleFailure(jobId, projectId, attemptId, 'PUBLISHING_WORKSPACE_FAILED', 'Workspace creation failed');
        return;
      }
    }

    // ─── RESOLVE ADAPTER ───
    let adapter;
    try {
      adapter = getPublishingAdapter(platformKey);
    } catch {
      await settleFailure(jobId, projectId, attemptId, 'PUBLISHING_ADAPTER_NOT_FOUND', `Adapter not found for platform: ${platformKey}`);
      return;
    }

    // ─── BUILD EXECUTION CONTEXT ───
    const contentSnapshot = plan.content_snapshot_json || {};
    const publishInput: ServerResolvedPublishInput = {
      jobId,
      projectId,
      sourceAssetKey: `${assetRes.rows[0].bucket_name}/${assetRes.rows[0].object_key}`,
      caption: contentSnapshot.captionTemplate || '',
      hashtags: contentSnapshot.hashtagPolicy?.tags || [],
      privacy: contentSnapshot.privacyPolicy?.visibility || 'private',
      platformKey,
      validationScenario: undefined, // set below if validation mode
    };

    // Check for validation scenario from profile
    const profRes = await pool.query(
      `SELECT is_validation_only FROM aidilam_app.publishing_profiles WHERE id = $1`, [jb.publishing_profile_id]
    );
    if (profRes.rows[0]?.is_validation_only && process.env.AIDILAM_VALIDATION_MODE === 'true') {
      // Allow validation scenario from plan metadata
      const adapterSnapshot = plan.adapter_snapshot_json || {};
      if (adapterSnapshot.validationScenario) {
        publishInput.validationScenario = adapterSnapshot.validationScenario;
      }
    }

    // Credential safety scan
    const credFields = detectCredentialFields(publishInput);
    if (credFields.length > 0) {
      await settleFailure(jobId, projectId, attemptId, 'PUBLISHING_ADAPTER_FAILED', 'Credential fields detected in execution context');
      return;
    }

    // ─── PRE-EXECUTION CANCELLATION CHECK ───
    const preCancelCheck = await pool.query(`SELECT status FROM aidilam_app.publishing_jobs WHERE id = $1`, [jobId]);
    if (preCancelCheck.rows[0]?.status === 'cancel_requested') {
      await handleActiveCancellation(jobId, projectId, attemptId, adapter, undefined, platformKey);
      return;
    }

    // ─── EXECUTE ADAPTER ───
    logger.info('Publishing adapter executing', { ...logCtx, platformKey, adapterKey });
    let result: PublishResult;
    try {
      result = await adapter.publish(publishInput);
    } catch (err: any) {
      await settleFailure(jobId, projectId, attemptId, 'PUBLISHING_ADAPTER_FAILED', 'Adapter threw exception');
      return;
    }

    // ─── POST-EXECUTION CANCELLATION CHECK ───
    const postCancelCheck = await pool.query(`SELECT status FROM aidilam_app.publishing_jobs WHERE id = $1`, [jobId]);
    if (postCancelCheck.rows[0]?.status === 'cancel_requested') {
      await handleActiveCancellation(jobId, projectId, attemptId, adapter, result.externalPublishId, platformKey);
      return;
    }

    // ─── VALIDATE RESULT ───
    if (result.success && !result.pending) {
      // Validate URL safety (only mock:// allowed in D1/D2)
      if (result.publishedUrl && !result.publishedUrl.startsWith('mock://')) {
        await settleFailure(jobId, projectId, attemptId, 'PUBLISHING_ADAPTER_RESULT_INVALID', 'Non-mock URL rejected');
        return;
      }
      await settleSuccess(jobId, projectId, attemptId, platformKey, plan, result);
    } else if (result.pending) {
      // ─── POLLING ───
      logger.info('Publishing job pending, starting poll', { ...logCtx, externalId: result.externalPublishId });
      await pool.query(`UPDATE aidilam_app.publishing_jobs SET current_stage = 'polling', updated_at = now() WHERE id = $1`, [jobId]);
      const maxPollCount = 5;
      const pollIntervalMs = 2000;
      let pollCount = 0;
      while (pollCount < maxPollCount) {
        // Check for cancellation
        const cancelCheck = await pool.query(`SELECT status FROM aidilam_app.publishing_jobs WHERE id = $1`, [jobId]);
        if (cancelCheck.rows[0]?.status === 'cancel_requested') {
          await handleActiveCancellation(jobId, projectId, attemptId, adapter, result.externalPublishId, platformKey);
          return;
        }
        await new Promise(r => setTimeout(r, pollIntervalMs));
        pollCount++;
        const pollResult = await adapter.pollStatus({ jobId, externalPublishId: result.externalPublishId || '', platformKey });
        logger.info('Poll result', { ...logCtx, pollCount, status: pollResult.status });

        // Post-poll cancel check (detects cancel_requested persisted during poll)
        const postPollCancel = await pool.query(`SELECT status FROM aidilam_app.publishing_jobs WHERE id = $1`, [jobId]);
        if (postPollCancel.rows[0]?.status === 'cancel_requested') {
          await handleActiveCancellation(jobId, projectId, attemptId, adapter, result.externalPublishId, platformKey);
          return;
        }

        if (pollResult.status === 'succeeded') {
          const publishedUrl = pollResult.publishedUrl || `mock://${platformKey}/polled`;
          if (!publishedUrl.startsWith('mock://')) {
            await settleFailure(jobId, projectId, attemptId, 'PUBLISHING_ADAPTER_RESULT_INVALID', 'Non-mock poll URL');
            return;
          }
          await settleSuccess(jobId, projectId, attemptId, platformKey, plan, { ...result, publishedUrl, externalPublishId: pollResult.externalPublishId || result.externalPublishId });
          return;
        } else if (pollResult.status === 'failed') {
          if (pollResult.retryable === false) {
            await settleFailure(jobId, projectId, attemptId, pollResult.errorCode || 'PUBLISHING_POLL_FAILED', 'Poll returned permanent failure');
          } else {
            await settleRetryableFailure(jobId, projectId, attemptId, plan, jb.max_attempts, attemptNumber, pollResult.errorCode || 'PUBLISHING_POLL_TEMPORARY', 'Poll returned retryable failure');
          }
          return;
        }
        // pending → continue polling
      }
      // Poll timeout
      await settleRetryableFailure(jobId, projectId, attemptId, plan, jb.max_attempts, attemptNumber, 'PUBLISHING_POLL_TIMEOUT', 'Poll timeout after max attempts');
    } else if (!result.success) {
      // ─── FAILURE CLASSIFICATION ───
      const errorCode = result.errorCode || 'PUBLISHING_ADAPTER_FAILED';
      const errorMsg = (result.errorMessage || 'Adapter returned failure').slice(0, 500);
      if (result.retryable) {
        await settleRetryableFailure(jobId, projectId, attemptId, plan, jb.max_attempts, attemptNumber, errorCode, errorMsg);
      } else {
        await settleFailure(jobId, projectId, attemptId, errorCode, errorMsg);
      }
    }
  } catch (err: any) {
    logger.error('Publishing worker unhandled error', { ...logCtx, error: err.message });
    // Attempt to settle failure if possible
    try {
      // Check if job is still in publishing state
      const check = await pool.query(`SELECT status FROM aidilam_app.publishing_jobs WHERE id = $1`, [jobId]);
      if (check.rows[0]?.status === 'publishing') {
        const attemptCheck = await pool.query(`SELECT id FROM aidilam_app.publishing_attempts WHERE publishing_job_id = $1 AND status = 'running' LIMIT 1`, [jobId]);
        if (attemptCheck.rows[0]) {
          await settleFailure(jobId, projectId, attemptCheck.rows[0].id, 'PUBLISHING_WORKSPACE_FAILED', 'Unhandled worker error');
        }
      }
    } catch { /* best effort */ }
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Retryable Failure Settlement
// ═══════════════════════════════════════════════════════════════════════════════

async function settleRetryableFailure(
  jobId: string, projectId: string, attemptId: string,
  plan: any, maxAttempts: number, currentAttempt: number,
  errorCode: string, errorMessage: string,
): Promise<void> {
  const safeMsg = errorMessage.slice(0, 500);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const jb = await client.query(`SELECT status FROM aidilam_app.publishing_jobs WHERE id = $1 FOR UPDATE`, [jobId]);
    if (!['publishing'].includes(jb.rows[0]?.status || '')) { await client.query('ROLLBACK'); return; }

    // Check if retry exhausted
    if (currentAttempt >= maxAttempts) {
      // Terminal failure — exhausted
      await client.query(`UPDATE aidilam_app.publishing_attempts SET status = 'permanent_failed', error_code = $2, error_message_safe = $3, completed_at = now() WHERE id = $1`, [attemptId, 'PUBLISHING_RETRY_EXHAUSTED', safeMsg]);
      await client.query(`UPDATE aidilam_app.publishing_jobs SET status = 'failed', error_code = 'PUBLISHING_RETRY_EXHAUSTED', error_message_safe = $2, completed_at = now(), updated_at = now() WHERE id = $1`, [jobId, safeMsg]);
      await client.query(`UPDATE aidilam_app.publishing_quota_reservations SET status = 'released', settled_at = now(), updated_at = now() WHERE publishing_job_id = $1 AND status = 'reserved'`, [jobId]);
      await client.query(`INSERT INTO aidilam_app.publishing_audit_events (project_id, publishing_job_id, event_type, actor_type, actor_id, metadata_safe_json) VALUES ($1, $2, 'publishing_retry_exhausted', 'system', $3, $4)`, [projectId, jobId, WORKER_ID, JSON.stringify({ attemptId, errorCode, attempts: currentAttempt })]);
      await client.query('COMMIT');
      logger.info('Publishing retry exhausted', { jobId, attemptId, attempts: currentAttempt });
      return;
    }

    // Retryable — enter retry_wait
    const retryPolicy = plan.retry_snapshot_json || { backoffMs: 5000, maxDelayMs: 60000 };
    const baseDelay = Number(retryPolicy.backoffMs || 5000) / 1000;
    const maxDelay = Number(retryPolicy.maxDelayMs || 60000) / 1000;
    const rawDelay = baseDelay * Math.pow(2, currentAttempt - 1);
    const boundedDelay = Math.min(rawDelay, maxDelay);
    const delayMs = Math.round(boundedDelay * 1000);

    await client.query(`UPDATE aidilam_app.publishing_attempts SET status = 'retryable_failed', error_code = $2, error_message_safe = $3, completed_at = now() WHERE id = $1`, [attemptId, errorCode, safeMsg]);
    await client.query(`UPDATE aidilam_app.publishing_jobs SET status = 'retry_wait', current_stage = 'retry_wait', error_code = $2, error_message_safe = $3, updated_at = now() WHERE id = $1`, [jobId, errorCode, safeMsg]);
    await client.query(`INSERT INTO aidilam_app.publishing_audit_events (project_id, publishing_job_id, event_type, actor_type, actor_id, metadata_safe_json) VALUES ($1, $2, 'publishing_retry_scheduled', 'system', $3, $4)`, [projectId, jobId, WORKER_ID, JSON.stringify({ attemptId, errorCode, delayMs, nextAttempt: currentAttempt + 1 })]);
    await client.query('COMMIT');

    // Enqueue delayed retry
    const nextBullmqId = `pub-${jobId}-attempt-${currentAttempt + 1}`;
    try {
      await publishingQueue.add('publish', { jobId, projectId, enqueueReason: 'retry', expectedStatus: 'retry_wait', queueVersion: 1 }, { jobId: nextBullmqId, delay: delayMs });
    } catch (err: any) {
      if (!err.message?.includes('already exists')) {
        logger.error('Failed to enqueue retry', { jobId, error: err.message });
      }
    }
    logger.info('Publishing job scheduled for retry', { jobId, attemptId, delayMs, nextAttempt: currentAttempt + 1 });
  } catch (err: any) {
    await client.query('ROLLBACK');
    logger.error('Retryable failure settlement failed', { jobId, error: err.message });
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Active Cancellation Handler
// ═══════════════════════════════════════════════════════════════════════════════

async function handleActiveCancellation(
  jobId: string, projectId: string, attemptId: string,
  adapter: PublishingAdapter, externalPublishId: string | undefined, platformKey: string,
): Promise<void> {
  logger.info('Active cancellation detected', { jobId, externalPublishId });
  let cancelSuccess = false;
  try {
    const cancelResult = await adapter.cancel({ jobId, externalPublishId, platformKey });
    cancelSuccess = cancelResult.cancelled;
    if (!cancelSuccess) {
      logger.warn('Adapter cancel returned failure', { jobId });
    }
  } catch (err: any) {
    logger.warn('Adapter cancel threw/timed out', { jobId, error: err.message });
    // Cancel timeout/failure — job remains cancel_requested, reservation stays reserved
    // Reconciliation or operator will resolve
    return;
  }

  if (!cancelSuccess) {
    // Adapter explicitly said not cancelled — keep cancel_requested state
    // Reservation remains reserved until resolved
    logger.info('Cancel not confirmed by adapter, keeping cancel_requested', { jobId });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE aidilam_app.publishing_attempts SET status = 'cancelled', completed_at = now() WHERE id = $1 AND status = 'running'`, [attemptId]);
    await client.query(`UPDATE aidilam_app.publishing_jobs SET status = 'cancelled', current_stage = 'cancelled', completed_at = now(), updated_at = now() WHERE id = $1`, [jobId]);
    await client.query(`UPDATE aidilam_app.publishing_quota_reservations SET status = 'released', settled_at = now(), updated_at = now() WHERE publishing_job_id = $1 AND status = 'reserved'`, [jobId]);
    await client.query(`INSERT INTO aidilam_app.publishing_audit_events (project_id, publishing_job_id, event_type, actor_type, actor_id, metadata_safe_json) VALUES ($1, $2, 'publishing_job_cancelled', 'system', $3, $4)`, [projectId, jobId, WORKER_ID, JSON.stringify({ attemptId, reason: 'active_cancel' })]);
    await client.query('COMMIT');
    logger.info('Publishing job actively cancelled', { jobId, attemptId });
  } catch (err: any) {
    await client.query('ROLLBACK');
    logger.error('Active cancellation settlement failed', { jobId, error: err.message });
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Success Settlement
// ═══════════════════════════════════════════════════════════════════════════════

async function settleSuccess(
  jobId: string, projectId: string, attemptId: string,
  platformKey: string, plan: any, result: PublishResult,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock job + verify state
    const jb = await client.query(`SELECT status FROM aidilam_app.publishing_jobs WHERE id = $1 FOR UPDATE`, [jobId]);
    if (jb.rows[0]?.status !== 'publishing') {
      await client.query('ROLLBACK');
      logger.warn('Settlement skipped: job not in publishing state', { jobId });
      return;
    }

    // Lock attempt + verify
    const att = await client.query(`SELECT status FROM aidilam_app.publishing_attempts WHERE id = $1 FOR UPDATE`, [attemptId]);
    if (att.rows[0]?.status !== 'running') {
      await client.query('ROLLBACK');
      logger.warn('Settlement skipped: attempt not running', { jobId, attemptId });
      return;
    }

    // Attempt → succeeded
    await client.query(
      `UPDATE aidilam_app.publishing_attempts SET status = 'succeeded', external_publish_id = $2, published_url_safe = $3, completed_at = now() WHERE id = $1`,
      [attemptId, result.externalPublishId || null, result.publishedUrl || null]
    );

    // Job → succeeded
    await client.query(
      `UPDATE aidilam_app.publishing_jobs SET status = 'succeeded', progress_percent = 100, current_stage = 'completed', external_publish_id = $2, published_url_safe = $3, completed_at = now(), updated_at = now() WHERE id = $1`,
      [jobId, result.externalPublishId || null, result.publishedUrl || null]
    );

    // Reservation → committed
    await client.query(
      `UPDATE aidilam_app.publishing_quota_reservations SET status = 'committed', settled_at = now(), updated_at = now() WHERE publishing_job_id = $1 AND status = 'reserved'`,
      [jobId]
    );

    // Create usage record
    const quotaSnapshot = plan.quota_snapshot_json || {};
    const platformRes = await client.query(`SELECT id FROM aidilam_app.publishing_platforms WHERE platform_key = $1`, [platformKey]);
    const platformId = platformRes.rows[0]?.id;
    await client.query(
      `INSERT INTO aidilam_app.publishing_usage_records (project_id, publishing_job_id, publishing_attempt_id, platform_id, publish_operations, platform_requests, upload_bytes, quota_units, estimated_cost, committed_cost, pricing_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (publishing_job_id) DO NOTHING`,
      [projectId, jobId, attemptId, platformId,
       quotaSnapshot.publishOperations || 1, quotaSnapshot.platformRequests || 2,
       quotaSnapshot.uploadBytes || 0, quotaSnapshot.quotaUnits || 1,
       quotaSnapshot.estimatedCost || 0.01, 0.01, 'mock-v1']
    );

    // Audit events
    await client.query(
      `INSERT INTO aidilam_app.publishing_audit_events (project_id, publishing_job_id, event_type, actor_type, actor_id, metadata_safe_json)
       VALUES ($1, $2, 'publishing_job_succeeded', 'system', $3, $4)`,
      [projectId, jobId, WORKER_ID, JSON.stringify({ attemptId, platformKey })]
    );

    await client.query('COMMIT');
    logger.info('Publishing job succeeded', { jobId, attemptId, platformKey, externalId: result.externalPublishId });
  } catch (err: any) {
    await client.query('ROLLBACK');
    logger.error('Success settlement failed', { jobId, error: err.message });
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Failure Settlement
// ═══════════════════════════════════════════════════════════════════════════════

async function settleFailure(
  jobId: string, projectId: string, attemptId: string,
  errorCode: string, errorMessage: string,
): Promise<void> {
  const safeMsg = errorMessage.slice(0, 500); // bounded
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock job
    const jb = await client.query(`SELECT status FROM aidilam_app.publishing_jobs WHERE id = $1 FOR UPDATE`, [jobId]);
    if (!['publishing', 'queued'].includes(jb.rows[0]?.status || '')) {
      await client.query('ROLLBACK');
      return;
    }

    // Attempt → failed
    await client.query(
      `UPDATE aidilam_app.publishing_attempts SET status = 'permanent_failed', error_code = $2, error_message_safe = $3, completed_at = now() WHERE id = $1 AND status = 'running'`,
      [attemptId, errorCode, safeMsg]
    );

    // Job → failed
    await client.query(
      `UPDATE aidilam_app.publishing_jobs SET status = 'failed', error_code = $2, error_message_safe = $3, completed_at = now(), updated_at = now() WHERE id = $1`,
      [jobId, errorCode, safeMsg]
    );

    // Reservation → released
    await client.query(
      `UPDATE aidilam_app.publishing_quota_reservations SET status = 'released', settled_at = now(), updated_at = now() WHERE publishing_job_id = $1 AND status = 'reserved'`,
      [jobId]
    );

    // Audit
    await client.query(
      `INSERT INTO aidilam_app.publishing_audit_events (project_id, publishing_job_id, event_type, actor_type, actor_id, metadata_safe_json)
       VALUES ($1, $2, 'publishing_job_failed', 'system', $3, $4)`,
      [projectId, jobId, WORKER_ID, JSON.stringify({ attemptId, errorCode })]
    );

    await client.query('COMMIT');
    logger.info('Publishing job failed', { jobId, attemptId, errorCode });
  } catch (err: any) {
    await client.query('ROLLBACK');
    logger.error('Failure settlement failed', { jobId, error: err.message });
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Worker Lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

export function startPublishingWorker(): Worker {
  const concurrency = parseInt(process.env.PUBLISHING_WORKER_CONCURRENCY || '1', 10);
  publishingWorker = new Worker(
    PUBLISHING_QUEUE_NAME,
    processPublishingJob,
    {
      connection: createRedisConnection(),
      name: WORKER_ID,
      concurrency,
      prefix: PUBLISHING_PREFIX,
    },
  );

  publishingWorker.on('completed', (job: Job) => {
    logger.info('Publishing BullMQ job completed', { bullmqId: job.id, jobId: job.data.jobId });
  });
  publishingWorker.on('failed', (job: Job | undefined, err: Error) => {
    logger.error('Publishing BullMQ job failed', { bullmqId: job?.id, jobId: job?.data?.jobId, error: err.message });
  });

  logger.info('Publishing worker started', { queue: PUBLISHING_QUEUE_NAME, concurrency });
  return publishingWorker;
}

export async function stopPublishingWorker(): Promise<void> {
  if (publishingWorker) {
    await publishingWorker.close();
    publishingWorker = null;
    logger.info('Publishing worker stopped');
  }
  await publishingQueue.close();
}
