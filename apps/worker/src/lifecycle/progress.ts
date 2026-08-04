import type pg from 'pg';
import { logger } from '../logging/index.js';

const lastProgressUpdate: Map<string, number> = new Map();

export async function reportProgress(pool: pg.Pool, jobId: string, percent: number): Promise<void> {
  // Rate limit: max 1 update per second per job
  const now = Date.now();
  const lastUpdate = lastProgressUpdate.get(jobId) || 0;

  if (now - lastUpdate < 1000 && percent < 100) {
    return;
  }

  lastProgressUpdate.set(jobId, now);

  try {
    await pool.query(
      `UPDATE aidilam_app.jobs SET
        progress_percent = $1,
        updated_at = NOW()
      WHERE id = $2`,
      [percent, jobId],
    );

    await pool.query(
      `INSERT INTO aidilam_app.job_events (job_id, event_type, payload)
       VALUES ($1, 'job_progress', $2)`,
      [jobId, JSON.stringify({ percent })],
    );

    logger.debug('Progress reported', { jobId, percent });
  } catch (err: unknown) {
    const error = err as Error;
    logger.error('Failed to report progress', { jobId, percent, error: error.message });
  }

  // Cleanup map for completed jobs
  if (percent >= 100) {
    lastProgressUpdate.delete(jobId);
  }
}
