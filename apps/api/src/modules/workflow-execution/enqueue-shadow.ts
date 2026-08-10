/**
 * Shadow Workflow Enqueue Service
 * AIDILAM-COM-04E3R
 *
 * Uses canonical BullMQ queue config (same as legacy producer).
 * No hardcoded Redis IP. Uses DNS hostname from config.
 */
import { config } from '../../config/index.js';
import { pgPool } from '../../infrastructure/database/index.js';

const QUEUE_NAME = 'aidilam-jobs';
const QUEUE_PREFIX = 'aidilam:queue';

export interface EnqueueShadowResult {
  success: boolean;
  error?: string;
  bullmqJobId?: string;
  executionId?: string;
}

/**
 * Enqueue a shadow workflow execution to BullMQ.
 * Uses canonical Redis config (DNS hostname, not numeric IP).
 */
export async function enqueueShadowExecution(executionId: string): Promise<EnqueueShadowResult> {
  // Validate execution exists and is in correct state
  const execRes = await pgPool.query(
    `SELECT id, execution_mode, status FROM aidilam_app.wf_executions WHERE id = $1`,
    [executionId]
  );
  if (execRes.rows.length === 0) {
    return { success: false, error: 'EXECUTION_NOT_FOUND' };
  }
  const exec = execRes.rows[0];
  if (exec.execution_mode !== 'shadow') {
    return { success: false, error: 'NOT_SHADOW_MODE' };
  }
  if (exec.status !== 'prepared') {
    return { success: false, error: 'EXECUTION_NOT_PREPARED' };
  }

  // Feature guard
  if (process.env.WORKFLOW_SHADOW_ENABLED === 'false') {
    return { success: false, error: 'SHADOW_DISABLED' };
  }

  // Deterministic job ID (prevents duplicate enqueue)
  const bullmqJobId = `shadow-workflow:${executionId}`;

  // Use canonical Redis config (same as legacy producer in dam-api.ts)
  const { Queue } = await import('bullmq');
  const Redis = (await import('ioredis')).default;
  const redisPass = config.secrets.redisPassword || '';
  const redis = new Redis({
    host: config.redis.host,  // 'aidilam-redis' (DNS, not numeric IP)
    port: config.redis.port,
    password: redisPass || undefined,
    maxRetriesPerRequest: null,
    connectTimeout: 5000,
    lazyConnect: true,
  });

  try {
    await redis.connect();
    const q = new Queue(QUEUE_NAME, { connection: redis, prefix: QUEUE_PREFIX });
    await q.add('shadow_workflow', {
      jobType: 'shadow_workflow',
      executionId,
    }, {
      jobId: bullmqJobId,
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 100,
    });
    await q.close();
    return { success: true, bullmqJobId, executionId };
  } catch (err: any) {
    return { success: false, error: err.message?.substring(0, 200) || 'ENQUEUE_FAILED' };
  } finally {
    redis.disconnect();
  }
}
