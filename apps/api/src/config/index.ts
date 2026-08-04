import { env } from './env.js';
import { readSecret } from './secrets.js';

export const config = {
  ...env,
  secrets: {
    postgresPassword: readSecret('/run/secrets/postgres_runtime_password'),
    redisPassword: readSecret('/run/secrets/redis_password'),
    qdrantApiKey: readSecret('/run/secrets/qdrant_api_key'),
    minioAccessKey: readSecret('/run/secrets/minio_runtime_access_key'),
    minioSecretKey: readSecret('/run/secrets/minio_runtime_secret_key'),
  },
} as const;

export type Config = typeof config;
