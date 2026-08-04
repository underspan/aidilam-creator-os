import type pg from 'pg';
import { logger } from '../logging/index.js';
import { transitionJob } from './transition.js';

export async function checkTimeouts(pool: pg.Pool, workerId: string): Promise<number> {
  try {
    const result = await pool.query(
      `SELECT id, status FROM aidilam_app.jobs
       WHERE status = 'running'
         AND timeout_seconds IS NOT NULL
         AND started_at IS NOT NULL
         AND started_at + (timeout_seconds * interval '1 second') < NOW()`,
    );

    let timedOutCount = 0;

    for (const row of result.rows) {
      try {
        const transitioned = await transitionJob(
          pool,
          row.id,
          'running',
          'timed_out',
          workerId,
          undefined,
          'Job exceeded timeout_seconds',
        );

        if (transitioned) {
          timedOutCount++;
          logger.warn('Job timed out', { jobId: row.id });
        }
      } catch (err: unknown) {
        const error = err as Error;
        logger.error('Failed to timeout job', { jobId: row.id, error: error.message });
      }
    }

    if (timedOutCount > 0) {
      logger.info('Timeout check complete', { timedOutCount });
    }

    return timedOutCount;
  } catch (err: unknown) {
    const error = err as Error;
    logger.error('Timeout monitor error', { error: error.message });
    return 0;
  }
}

let timeoutInterval: NodeJS.Timeout | null = null;

export function startTimeoutMonitor(pool: pg.Pool, workerId: string, intervalMs: number = 15000): void {
  timeoutInterval = setInterval(() => {
    checkTimeouts(pool, workerId).catch((err) => {
      logger.error('Timeout monitor unhandled error', { error: (err as Error).message });
    });
  }, intervalMs);

  logger.info('Timeout monitor started', { intervalMs });
}

export function stopTimeoutMonitor(): void {
  if (timeoutInterval) {
    clearInterval(timeoutInterval);
    timeoutInterval = null;
    logger.info('Timeout monitor stopped');
  }
}
