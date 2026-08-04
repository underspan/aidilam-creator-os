import type pg from 'pg';
import { logger } from '../logging/index.js';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  queued: ['claimed', 'cancel_requested', 'cancelled'],
  claimed: ['running', 'queued', 'cancel_requested', 'timed_out'],
  running: ['succeeded', 'failed', 'retry_wait', 'cancel_requested', 'timed_out'],
  retry_wait: ['queued', 'claimed', 'cancel_requested'],
  cancel_requested: ['cancelled'],
  succeeded: [],
  failed: ['queued', 'dead_letter'],
  cancelled: [],
  timed_out: ['retry_wait', 'dead_letter'],
  dead_letter: [],
};

export async function transitionJob(
  pool: pg.Pool,
  jobId: string,
  fromStatus: string,
  toStatus: string,
  workerId: string,
  resultPayload?: Record<string, unknown>,
  errorMessage?: string,
): Promise<boolean> {
  const allowed = ALLOWED_TRANSITIONS[fromStatus];
  if (!allowed || !allowed.includes(toStatus)) {
    logger.error('Invalid job transition', { jobId, fromStatus, toStatus });
    throw new Error(`Invalid transition: ${fromStatus} -> ${toStatus}`);
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE aidilam_app.jobs SET
        status = $1,
        result_payload = CASE WHEN $2::jsonb IS NOT NULL THEN $2::jsonb ELSE result_payload END,
        error_message = CASE WHEN $3::text IS NOT NULL THEN $3::text ELSE error_message END,
        completed_at = CASE WHEN $1 IN ('succeeded', 'failed', 'cancelled', 'timed_out', 'dead_letter') THEN NOW() ELSE completed_at END,
        version = version + 1,
        updated_at = NOW()
      WHERE id = $4
        AND status = $5`,
      [
        toStatus,
        resultPayload ? JSON.stringify(resultPayload) : null,
        errorMessage || null,
        jobId,
        fromStatus,
      ],
    );

    if ((result.rowCount ?? 0) === 0) {
      logger.warn('Transition failed - version conflict or status mismatch', { jobId, fromStatus, toStatus });
      return false;
    }

    // Insert transition event
    await client.query(
      `INSERT INTO aidilam_app.job_events (job_id, event_type, payload)
       VALUES ($1, $2, $3)`,
      [
        jobId,
        `job_${toStatus}`,
        JSON.stringify({ from: fromStatus, to: toStatus, workerId, error: errorMessage || undefined }),
      ],
    );

    logger.info('Job transitioned', { jobId, fromStatus, toStatus });
    return true;
  } catch (err: unknown) {
    const error = err as Error;
    logger.error('Transition error', { jobId, fromStatus, toStatus, error: error.message });
    throw err;
  } finally {
    client.release();
  }
}
