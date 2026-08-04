import { Worker, Job } from 'bullmq';
import { createRedisConnection } from './connection.js';
import { config } from '../config/index.js';
import { logger } from '../logging/index.js';
import { getJobHandler } from '../jobs/registry.js';
import type { JobContext } from '../jobs/types.js';
import { claimJob } from '../lifecycle/claim.js';
import { startHeartbeat } from '../lifecycle/heartbeat.js';
import { reportProgress } from '../lifecycle/progress.js';
import { checkCancellation } from '../lifecycle/cancellation.js';
import { transitionJob } from '../lifecycle/transition.js';
import { pool } from '../infrastructure/database.js';

const QUEUE_NAME = 'aidilam-jobs';
const WORKER_NAME = 'aidilam-jobs';

let worker: Worker | null = null;

export function startWorker(): Worker {
  worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const jobId = job.data.jobId as string;
      const jobType = job.data.jobType as string;

      logger.info('Processing job', { jobId, jobType, bullmqJobId: job.id });

      // Claim the job in PostgreSQL
      const claimed = await claimJob(pool, jobId, WORKER_NAME);
      if (!claimed) {
        logger.warn('Failed to claim job, skipping', { jobId });
        return;
      }

      // Load full job details from PostgreSQL (source of truth)
      const jobResult = await pool.query(
        `SELECT project_id, input_payload, max_attempts, attempt_count
         FROM aidilam_app.jobs WHERE id = $1`,
        [jobId]
      );
      if (jobResult.rows.length === 0) {
        logger.error('Job not found in DB after claim', { jobId });
        return;
      }
      const jobRow = jobResult.rows[0];
      const projectId = jobRow.project_id;
      const maxAttempts = jobRow.max_attempts || 3;
      const inputPayload = jobRow.input_payload || {};

      // Start heartbeat
      const heartbeatInterval = startHeartbeat(pool, jobId, WORKER_NAME);

      try {
        // Transition to running
        await transitionJob(pool, jobId, 'claimed', 'running', WORKER_NAME);

        const handler = getJobHandler(jobType);

        const context: JobContext = {
          jobId,
          jobType,
          projectId,
          attemptCount: job.attemptsMade + 1,
          maxAttempts,
          inputPayload,
          reportProgress: (percent: number) => reportProgress(pool, jobId, percent),
          checkCancellation: () => checkCancellation(pool, jobId),
        };

        const result = await handler(context);

        // Transition to succeeded
        await transitionJob(pool, jobId, 'running', 'succeeded', WORKER_NAME, result || undefined);

        logger.info('Job completed', { jobId, jobType });
        return result;
      } catch (err: unknown) {
        const error = err as Error & { retryable?: boolean };
        const errorMessage = error.message || 'Unknown error';

        if (error.retryable !== false && job.attemptsMade < maxAttempts - 1) {
          await transitionJob(pool, jobId, 'running', 'retry_wait', WORKER_NAME, undefined, errorMessage);
          logger.warn('Job failed, will retry', { jobId, jobType, error: errorMessage, attempt: job.attemptsMade + 1 });
          throw err;
        } else {
          await transitionJob(pool, jobId, 'running', 'failed', WORKER_NAME, undefined, errorMessage);
          logger.error('Job permanently failed', { jobId, jobType, error: errorMessage });
        }
      } finally {
        clearInterval(heartbeatInterval);
      }
    },
    {
      connection: createRedisConnection(),
      name: WORKER_NAME,
      concurrency: config.worker.concurrency,
      prefix: 'aidilam:queue',
    },
  );

  worker.on('completed', (job: Job) => {
    logger.info('BullMQ job completed', { bullmqJobId: job.id, jobId: job.data.jobId });
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    logger.error('BullMQ job failed', {
      bullmqJobId: job?.id,
      jobId: job?.data?.jobId,
      error: err.message,
    });
  });

  worker.on('stalled', (jobId: string) => {
    logger.warn('BullMQ job stalled', { bullmqJobId: jobId });
  });

  logger.info('BullMQ worker started', { queue: QUEUE_NAME, concurrency: config.worker.concurrency });

  return worker;
}

export async function stopWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('BullMQ worker stopped');
  }
}
