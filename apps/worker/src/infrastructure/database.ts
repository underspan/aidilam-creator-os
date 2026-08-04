import pg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../logging/index.js';

const { Pool } = pg;

export const pool = new Pool({
  host: config.postgres.host,
  port: config.postgres.port,
  database: config.postgres.database,
  user: config.postgres.user,
  password: config.postgres.password,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000,
});

pool.on('error', (err) => {
  logger.error('Unexpected database pool error', { error: err.message });
});

export async function connectDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    logger.info('Database connected', { host: config.postgres.host, database: config.postgres.database });
  } finally {
    client.release();
  }
}

export async function disconnectDatabase(): Promise<void> {
  await pool.end();
  logger.info('Database pool closed');
}
