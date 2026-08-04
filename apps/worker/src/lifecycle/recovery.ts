import type pg from 'pg';
import type Redis from 'ioredis';
import { logger } from '../logging/index.js';
import { transitionJob } from './transition.js';
import { jobQueue } from '../queue/queue.js';

const RECOVERY_LOCK_KEY = 'aidilam:lock:recovery';
const RECOVERY_LOCK_TTL_MS = 30000;

async function acquireLock(redis: Redis, lockKey: string, ttlMs: number): Promise<boolean> {
  const result = await redis.set(lockKey, 'locked', 'PX', ttlMs, 'NX');
  return result === 'OK';
}

async function releaseLock(redis: Redis, lockKey: string): Promise<void> {
  await redis.del(lockKey);
}

export async function recoverStalledJobs(
  pool: pg.Pool,
  redis: Redis,
  workerId: string,
): Promise<number> {
  // Acquire distributed lock to prevent concurrent recovery
  const acquired = await acquireLock(redis, RECOVERY_LOCK_KEY, RECOVERY_LOCK_TTL_MS);
  if (!acquired) {
    logger.debug('Recovery lock not acquired, another instance is handling recovery');
    return 0;
  }

  try {
    // Find stalled jobs: lease expired and no recent heartbeat
    const result = await pool.query(
      `SELECT id, status, attempt_count, max_attempts FROM aidilam_app.jobs
       WHERE status IN ('claimed', 'running')
         AND lease_expires_at < NOW()
         AND heartbeat_at < NOW() - interval '60 seconds'
       LIMIT 50`,
    );

    let recoveredCount = 0;

    for (const row of result.rows) {
      try {
        if (row.attempt_count < row.max_attempts) {
          // For claimed jobs: direct requeue. For running jobs: mark timed_out first
          let transitioned = false;
          if (row.status === 'claimed') {
            transitioned = await transitionJob(
              pool, row.id, 'claimed', 'queued', workerId,
              undefined, 'Recovered from stalled claim - requeued for retry',
            );
          } else {
            // running → timed_out (valid transition)
            transitioned = await transitionJob(
              pool, row.id, 'running', 'timed_out', workerId,
              undefined, 'Recovered from stalled running state',
            );
            if (transitioned) {
              // timed_out → retry_wait (will be picked up on next cycle)
              await transitionJob(
                pool, row.id, 'timed_out', 'retry_wait', workerId,
              );
            }
          }

          if (transitioned) {
            // Re-enqueue to BullMQ so a new worker can claim it
            try {
              const jobData = await pool.query(
                `SELECT job_type, input_payload FROM aidilam_app.jobs WHERE id = $1`,
                [row.id]
              );
              if (jobData.rows.length > 0) {
                const jd = jobData.rows[0];
                await jobQueue.add(jd.job_type, {
                  jobId: row.id,
                  jobType: jd.job_type,
                  schemaVersion: 1,
                  traceId: `recovery-${Date.now()}`,
                }, { jobId: row.id });
                logger.info('Recovered job re-enqueued', { jobId: row.id });
              }
            } catch (enqueueErr) {
              // BullMQ may reject if job ID already exists — that's OK
              logger.warn('Re-enqueue after recovery failed (may already exist)', {
                jobId: row.id, error: (enqueueErr as Error).message,
              });
            }

            recoveredCount++;
            logger.warn('Stalled job recovered', {
              jobId: row.id,
              previousStatus: row.status,
              attemptCount: row.attempt_count,
              maxAttempts: row.max_attempts,
            });
          }
        } else {
          // Max attempts exceeded - send to dead letter via valid path
          let transitioned = false;
          if (row.status === 'running') {
            transitioned = await transitionJob(
              pool, row.id, 'running', 'timed_out', workerId,
              undefined, 'Max attempts exceeded after stall recovery',
            );
            if (transitioned) {
              await transitionJob(pool, row.id, 'timed_out', 'dead_letter', workerId);
            }
          } else {
            // claimed can go to queued then fail, or we add claimed → timed_out
            transitioned = await transitionJob(
              pool, row.id, 'claimed', 'timed_out', workerId,
              undefined, 'Max attempts exceeded after stall recovery',
            );
            if (transitioned) {
              await transitionJob(pool, row.id, 'timed_out', 'dead_letter', workerId);
            }
          }

          if (transitioned) {
            recoveredCount++;
            logger.error('Stalled job sent to dead letter', {
              jobId: row.id,
              attemptCount: row.attempt_count,
              maxAttempts: row.max_attempts,
            });
          }
        }
      } catch (err: unknown) {
        const error = err as Error;
        logger.error('Failed to recover stalled job', { jobId: row.id, error: error.message });
      }
    }

    if (recoveredCount > 0) {
      logger.info('Stalled job recovery complete', { recoveredCount, totalFound: result.rows.length });
    }

    return recoveredCount;
  } finally {
    await releaseLock(redis, RECOVERY_LOCK_KEY);
  }
}

let recoveryInterval: NodeJS.Timeout | null = null;

export function startRecoveryScheduler(
  pool: pg.Pool,
  redis: Redis,
  workerId: string,
  intervalMs: number = 30000,
): void {
  recoveryInterval = setInterval(() => {
    recoverStalledJobs(pool, redis, workerId).catch((err) => {
      logger.error('Recovery scheduler unhandled error', { error: (err as Error).message });
    });
  }, intervalMs);

  logger.info('Recovery scheduler started', { intervalMs });
}

export function stopRecoveryScheduler(): void {
  if (recoveryInterval) {
    clearInterval(recoveryInterval);
    recoveryInterval = null;
    logger.info('Recovery scheduler stopped');
  }
}
