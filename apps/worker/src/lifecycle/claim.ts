import type pg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../logging/index.js';

export async function claimJob(pool: pg.Pool, jobId: string, workerId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the job row
    const lockResult = await client.query(
      `SELECT id, status, version FROM aidilam_app.jobs WHERE id = $1 FOR UPDATE`,
      [jobId],
    );

    if (lockResult.rows.length === 0) {
      await client.query('ROLLBACK');
      logger.warn('Job not found for claim', { jobId });
      return false;
    }

    const job = lockResult.rows[0];

    if (job.status !== 'queued' && job.status !== 'retry_wait') {
      await client.query('ROLLBACK');
      logger.warn('Job not in claimable status', { jobId, currentStatus: job.status });
      return false;
    }

    const leaseExpiresAt = new Date(Date.now() + config.worker.leaseSeconds * 1000);

    // Update job to claimed
    await client.query(
      `UPDATE aidilam_app.jobs SET
        status = 'claimed',
        worker_id = $1,
        lease_expires_at = $2,
        heartbeat_at = NOW(),
        attempt_count = attempt_count + 1,
        started_at = COALESCE(started_at, NOW()),
        version = version + 1,
        updated_at = NOW()
      WHERE id = $3`,
      [workerId, leaseExpiresAt, jobId],
    );

    // Insert job_claimed event (worker_id in payload JSON, not as a column)
    await client.query(
      `INSERT INTO aidilam_app.job_events (job_id, event_type, payload)
       VALUES ($1, 'job_claimed', $2)`,
      [jobId, JSON.stringify({ workerId, attempt: job.version })],
    );

    await client.query('COMMIT');
    logger.info('Job claimed', { jobId, workerId });
    return true;
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    const error = err as Error;
    logger.error('Failed to claim job', { jobId, error: error.message });
    return false;
  } finally {
    client.release();
  }
}
