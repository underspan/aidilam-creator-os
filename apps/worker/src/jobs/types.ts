export interface JobContext {
  jobId: string;
  jobType: string;
  projectId: string;
  attemptCount: number;
  maxAttempts: number;
  inputPayload: Record<string, unknown>;
  reportProgress: (percent: number) => Promise<void>;
  checkCancellation: () => Promise<boolean>;
}

export type JobHandler = (context: JobContext) => Promise<Record<string, unknown> | void>;

export interface JobError extends Error {
  retryable?: boolean;
}
