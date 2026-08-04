/**
 * Publishing Queue Service (API-side)
 * Enqueues publishing jobs to BullMQ after DB commit.
 */
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../../../config/index.js';

const PUBLISHING_QUEUE_NAME = 'aidilam-publishing';
const PUBLISHING_PREFIX = 'aidilam:pub';

let publishingQueue: Queue | null = null;

function getQueue(): Queue {
  if (!publishingQueue) {
    const connection = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.secrets.redisPassword,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    publishingQueue = new Queue(PUBLISHING_QUEUE_NAME, {
      connection,
      prefix: PUBLISHING_PREFIX,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 1000 },
      },
    });
  }
  return publishingQueue;
}

export async function enqueuePublishingJob(
  jobId: string,
  projectId: string,
  reason: string = 'job_created',
): Promise<boolean> {
  try {
    const queue = getQueue();
    const bullmqJobId = `pub-${jobId}`;
    await queue.add('publish', {
      jobId,
      projectId,
      enqueueReason: reason,
      expectedStatus: 'queued',
      queueVersion: 1,
    }, { jobId: bullmqJobId });
    return true;
  } catch (err: any) {
    if (err.message?.includes('already exists')) return true;
    // Enqueue failure is non-fatal — reconciliation will catch it
    return false;
  }
}

export async function closePublishingQueue(): Promise<void> {
  if (publishingQueue) {
    await publishingQueue.close();
    publishingQueue = null;
  }
}
