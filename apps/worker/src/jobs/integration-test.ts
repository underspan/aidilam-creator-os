import type { JobContext, JobError } from './types.js';
import { logger } from '../logging/index.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createRetryableError(message: string): JobError {
  const err = new Error(message) as JobError;
  err.retryable = true;
  return err;
}

function createPermanentError(message: string): JobError {
  const err = new Error(message) as JobError;
  err.retryable = false;
  return err;
}

export async function integrationTestHandler(context: JobContext): Promise<Record<string, unknown>> {
  const { jobId, inputPayload, reportProgress, checkCancellation } = context;
  const mode = (inputPayload.mode as string) || 'success';

  logger.info('Integration test job started', { jobId, mode });

  switch (mode) {
    case 'success': {
      // Step 1 - 25%
      await sleep(1000);
      await reportProgress(25);

      if (await checkCancellation()) {
        throw createPermanentError('Job cancelled');
      }

      // Step 2 - 50%
      await sleep(1000);
      await reportProgress(50);

      if (await checkCancellation()) {
        throw createPermanentError('Job cancelled');
      }

      // Step 3 - 75%
      await sleep(1000);
      await reportProgress(75);

      if (await checkCancellation()) {
        throw createPermanentError('Job cancelled');
      }

      // Step 4 - 100%
      await sleep(1000);
      await reportProgress(100);

      return { status: 'completed', mode, processedAt: new Date().toISOString() };
    }

    case 'fail_retryable': {
      await sleep(500);
      await reportProgress(25);
      throw createRetryableError('Simulated retryable failure');
    }

    case 'fail_permanent': {
      await sleep(500);
      await reportProgress(25);
      throw createPermanentError('Simulated permanent failure');
    }

    case 'slow': {
      // Takes 120s to trigger timeout
      const totalMs = 120_000;
      const steps = 10;
      const stepMs = totalMs / steps;

      for (let i = 1; i <= steps; i++) {
        await sleep(stepMs);
        const percent = Math.round((i / steps) * 100);
        await reportProgress(percent);

        if (await checkCancellation()) {
          throw createPermanentError('Job cancelled during slow mode');
        }
      }

      return { status: 'completed', mode, processedAt: new Date().toISOString() };
    }

    case 'cancel_test': {
      // Wait indefinitely for cancellation
      await reportProgress(10);

      while (true) {
        await sleep(1000);
        const cancelled = await checkCancellation();
        if (cancelled) {
          throw createPermanentError('Job cancelled as expected');
        }
      }
    }

    default:
      throw createPermanentError(`Unknown integration test mode: ${mode}`);
  }
}
