import pg from 'pg';
import { config } from '../../config/index.js';

const { Pool } = pg;

export const pgPool = new Pool({
  host: config.postgres.host,
  port: config.postgres.port,
  database: config.postgres.database,
  user: config.postgres.user,
  password: config.secrets.postgresPassword,
  max: 10,
  min: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function checkPostgres(): Promise<boolean> {
  try {
    const res = await pgPool.query('SELECT 1 as health');
    return res.rows[0]?.health === 1;
  } catch {
    return false;
  }
}

export async function shutdownPostgres(): Promise<void> {
  await pgPool.end();
}
