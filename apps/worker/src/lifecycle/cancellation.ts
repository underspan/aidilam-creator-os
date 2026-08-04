import type pg from 'pg';
import { logger } from '../logging/index.js';

export async function checkCancellation(pool: pg.Pool, jobId: string): Promise<boolean> {
  try {
    const result = await pool.query(
      `SELECT cancel_requested_at FROM aidilam_app.jobs WHERE id = $1`,
      [jobId],
    );

    if (result.rows.length === 0) {
      return false;
    }

    const cancelRequestedAt = result.rows[0].cancel_requested_at;
    if (cancelRequestedAt) {
      logger.info('Cancellation detected', { jobId, cancelRequestedAt });
      return true;
    }

    return false;
  } catch (err: unknown) {
    const error = err as Error;
    logger.error('Failed to check cancellation', { jobId, error: error.message });
    return false;
  }
}
