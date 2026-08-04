export type AuthMode = 'disabled_internal' | 'service_token' | 'future_oidc';

export const env = {
  nodeEnv: process.env.NODE_ENV || 'production',
  port: parseInt(process.env.APP_PORT || '3000', 10),
  auth: {
    mode: (process.env.AUTH_MODE || 'service_token') as AuthMode,
    publicExposure: process.env.PUBLIC_EXPOSURE === 'true',
    pepperPath: process.env.SERVICE_TOKEN_PEPPER_PATH || '/run/secrets/service_token_pepper',
  },
  postgres: {
    host: process.env.POSTGRES_HOST || 'aidilam-postgres',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'aidilam',
    user: process.env.POSTGRES_USER || 'aidilam_runtime',
  },
  redis: {
    host: process.env.REDIS_HOST || 'aidilam-redis',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  qdrant: {
    host: process.env.QDRANT_HOST || 'aidilam-qdrant',
    port: parseInt(process.env.QDRANT_PORT || '6333', 10),
  },
  minio: {
    endPoint: process.env.MINIO_ENDPOINT || 'aidilam-minio',
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    bucket: process.env.MINIO_BUCKET || 'aidilam-private',
    useSSL: false,
  },
} as const;
