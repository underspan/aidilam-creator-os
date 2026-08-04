import { Queue } from 'bullmq';
import { createRedisConnection } from './connection.js';

const QUEUE_NAME = 'aidilam-jobs';

export const jobQueue = new Queue(QUEUE_NAME, {
  connection: createRedisConnection(),
  prefix: 'aidilam:queue',
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});
