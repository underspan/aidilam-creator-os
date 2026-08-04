import type pg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../logging/index.js';

export async function sendHeartbeat(pool: pg.Pool, jobId: string, workerId: string): Promise<boolean> {
  const leaseExpiresAt = new Date(Date.now() + config.worker.leaseSeconds * 1000);

  const result = await pool.query(
    `UPDATE aidilam_app.jobs SET
      heartbeat_at = NOW(),
      lease_expires_at = $1,
      version = version + 1,
      updated_at = NOW()
    WHERE id = $2
      AND worker_id = $3
      AND status IN ('claimed', 'running')`,
    [leaseExpiresAt, jobId, workerId],
  );

  return (result.rowCount ?? 0) > 0;
}

export function startHeartbeat(pool: pg.Pool, jobId: string, workerId: string): NodeJS.Timeout {
  const intervalMs = config.worker.heartbeatSeconds * 1000;

  const interval = setInterval(async () => {
    try {
      const updated = await sendHeartbeat(pool, jobId, workerId);
      if (!updated) {
        logger.warn('Heartbeat update failed - job may have been reassigned', { jobId, workerId });
      }
    } catch (err: unknown) {
      const error = err as Error;
      logger.error('Heartbeat error', { jobId, workerId, error: error.message });
    }
  }, intervalMs);

  return interval;
}
