import { config } from '../config/index.js';
import { pgPool } from '../infrastructure/database/index.js';
import { redis } from '../infrastructure/redis/index.js';
import { qdrant } from '../infrastructure/qdrant/index.js';
import { minioClient } from '../infrastructure/minio/index.js';
import { logger } from '../core/logging/index.js';
import { randomUUID } from 'node:crypto';

async function validatePostgres(): Promise<boolean> {
  logger.info('Validating PostgreSQL...');
  const client = await pgPool.connect();
  try {
    // Use existing table for validation (no DDL needed)
    await client.query("INSERT INTO aidilam_app.users (display_name, status) VALUES ('dep005_validation_user', 'active')");
    const res = await client.query("SELECT display_name FROM aidilam_app.users WHERE display_name = 'dep005_validation_user' LIMIT 1");
    if (res.rows[0]?.display_name !== 'dep005_validation_user') throw new Error('Read mismatch');
    await client.query("DELETE FROM aidilam_app.users WHERE display_name = 'dep005_validation_user'");
    logger.info('PostgreSQL: PASS');
    return true;
  } catch (err) {
    logger.error('PostgreSQL validation failed', { error: (err as Error).message });
    return false;
  } finally {
    client.release();
  }
}

async function validateRedis(): Promise<boolean> {
  logger.info('Validating Redis...');
  try {
    await redis.connect();
    const key = `dep005:validation:${randomUUID()}`;
    await redis.set(key, 'pass', 'EX', 60);
    const val = await redis.get(key);
    if (val !== 'pass') throw new Error('Read mismatch');
    await redis.del(key);
    logger.info('Redis: PASS');
    return true;
  } catch (err) {
    logger.error('Redis validation failed', { error: (err as Error).message });
    return false;
  }
}

async function validateQdrant(): Promise<boolean> {
  logger.info('Validating Qdrant...');
  const collection = `dep005_validation_${Date.now()}`;
  try {
    await qdrant.createCollection(collection, { vectors: { size: 4, distance: 'Cosine' } });
    await qdrant.upsert(collection, { points: [{ id: 1, vector: [0.1, 0.2, 0.3, 0.4], payload: { test: 'pass' } }] });
    const search = await qdrant.search(collection, { vector: [0.1, 0.2, 0.3, 0.4], limit: 1 });
    if (!search || search.length === 0) throw new Error('Search empty');
    await qdrant.deleteCollection(collection);
    logger.info('Qdrant: PASS');
    return true;
  } catch (err) {
    logger.error('Qdrant validation failed', { error: (err as Error).message });
    try { await qdrant.deleteCollection(collection); } catch {}
    return false;
  }
}

async function validateMinio(): Promise<boolean> {
  logger.info('Validating MinIO...');
  const objectName = `dep005-validation-${randomUUID()}.txt`;
  const content = 'validation-pass';
  try {
    await minioClient.putObject(config.minio.bucket, objectName, content);
    const stream = await minioClient.getObject(config.minio.bucket, objectName);
    let data = '';
    for await (const chunk of stream) { data += chunk.toString(); }
    if (data !== content) throw new Error('Content mismatch');
    await minioClient.removeObject(config.minio.bucket, objectName);
    logger.info('MinIO: PASS');
    return true;
  } catch (err) {
    logger.error('MinIO validation failed', { error: (err as Error).message });
    try { await minioClient.removeObject(config.minio.bucket, objectName); } catch {}
    return false;
  }
}

async function main() {
  logger.info('=== AIĐiLàm Integration Validation (DEP-005) ===');
  const results = {
    postgres: await validatePostgres(),
    redis: await validateRedis(),
    qdrant: await validateQdrant(),
    minio: await validateMinio(),
  };

  const allPass = Object.values(results).every(Boolean);
  logger.info('=== Results ===', results as unknown as Record<string, unknown>);

  await pgPool.end();
  redis.disconnect();

  if (!allPass) {
    logger.error('VALIDATION FAILED', results as unknown as Record<string, unknown>);
    process.exit(1);
  }
  logger.info('ALL INTEGRATIONS VALIDATED SUCCESSFULLY');
  process.exit(0);
}

main().catch((err) => {
  logger.error('Validation crashed', { error: (err as Error).message });
  process.exit(1);
});
