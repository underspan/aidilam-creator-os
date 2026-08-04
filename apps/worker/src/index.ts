import { logger } from './logging/index.js';
import { connectDatabase, disconnectDatabase } from './infrastructure/database.js';
import { connectRedis, disconnectRedis, redis } from './infrastructure/redis.js';
import { pool } from './infrastructure/database.js';
import { startHealthServer, stopHealthServer, setReady } from './health/index.js';
import { startWorker, stopWorker } from './queue/worker.js';
import { startRecoveryScheduler, stopRecoveryScheduler } from './lifecycle/recovery.js';
import { startTimeoutMonitor, stopTimeoutMonitor } from './lifecycle/timeout.js';
import { startPublishingWorker, stopPublishingWorker, startScheduler, stopScheduler } from './jobs/publishing-worker.js';
import { config } from './config/index.js';

const WORKER_ID = `aidilam-worker-${process.pid}-${Date.now()}`;
let shuttingDown = false;

async function main(): Promise<void> {
  logger.info('AIĐiLàm Worker starting', {
    workerId: WORKER_ID,
    nodeEnv: config.nodeEnv,
    concurrency: config.worker.concurrency,
  });

  // Connect to infrastructure
  await connectDatabase();
  await connectRedis();

  // Start health server
  startHealthServer(3001);

  // Start BullMQ worker
  startWorker();

  // Start publishing BullMQ worker + scheduler
  startPublishingWorker();
  startScheduler(10000);

  // Start recovery scheduler (every 30s)
  startRecoveryScheduler(pool, redis, WORKER_ID, 30000);

  // Start timeout monitor (every 15s)
  startTimeoutMonitor(pool, WORKER_ID, 15000);

  // Mark service as ready
  setReady(true);

  logger.info('AIĐiLàm Worker ready', { workerId: WORKER_ID });
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info('Shutdown initiated', { signal, workerId: WORKER_ID });
  setReady(false);

  // Grace period to finish in-progress jobs
  const gracePeriodMs = config.worker.gracePeriodSeconds * 1000;
  logger.info('Waiting for grace period', { gracePeriodMs });

  // Stop accepting new jobs
  await stopWorker();
  await stopPublishingWorker();

  // Stop scheduled tasks
  stopRecoveryScheduler();
  stopTimeoutMonitor();
  stopScheduler();

  // Wait for grace period
  await new Promise((resolve) => setTimeout(resolve, gracePeriodMs));

  // Disconnect infrastructure
  await disconnectRedis();
  await disconnectDatabase();

  // Stop health server
  await stopHealthServer();

  logger.info('Worker shutdown complete', { workerId: WORKER_ID });
  process.exit(0);
}

// Handle termination signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle unhandled errors
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { error: String(reason) });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  shutdown('uncaughtException');
});

main().catch((err) => {
  logger.error('Worker startup failed', { error: (err as Error).message });
  process.exit(1);
});
