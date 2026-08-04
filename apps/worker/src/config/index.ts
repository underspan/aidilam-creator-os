import { readFileSync } from 'node:fs';

function readSecret(path: string): string {
  try {
    return readFileSync(path, 'utf-8').trim();
  } catch {
    throw new Error(`Secret unavailable: ${path}`);
  }
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'production',

  postgres: {
    host: process.env.POSTGRES_HOST || 'aidilam-postgres',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'aidilam',
    user: process.env.POSTGRES_USER || 'aidilam_runtime',
    password: readSecret('/run/secrets/postgres_runtime_password'),
  },

  redis: {
    host: process.env.REDIS_HOST || 'aidilam-redis',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: readSecret('/run/secrets/redis_password'),
  },

  worker: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '2', 10),
    leaseSeconds: parseInt(process.env.WORKER_LEASE_SECONDS || '60', 10),
    heartbeatSeconds: parseInt(process.env.WORKER_HEARTBEAT_SECONDS || '15', 10),
    gracePeriodSeconds: parseInt(process.env.WORKER_GRACE_PERIOD_SECONDS || '30', 10),
  },

  serviceToken: {
    pepperPath: process.env.SERVICE_TOKEN_PEPPER_PATH || '/run/secrets/service_token_pepper',
    token: readSecret('/run/secrets/worker_service_token'),
  },
} as const;
