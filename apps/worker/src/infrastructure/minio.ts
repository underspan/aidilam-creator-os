import * as Minio from 'minio';
import { readFileSync } from 'node:fs';
import { logger } from '../logging/index.js';

const accessKey = readFileSync('/run/secrets/minio_runtime_access_key', 'utf-8').trim();
const secretKey = readFileSync('/run/secrets/minio_runtime_secret_key', 'utf-8').trim();

export const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'aidilam-minio',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  accessKey,
  secretKey,
  useSSL: false,
});

export const BUCKET = process.env.MINIO_BUCKET || 'aidilam-private';

export async function checkMinio(): Promise<boolean> {
  try {
    return await minioClient.bucketExists(BUCKET);
  } catch {
    return false;
  }
}

export async function connectMinio(): Promise<void> {
  const exists = await minioClient.bucketExists(BUCKET);
  if (!exists) {
    throw new Error(`MinIO bucket '${BUCKET}' does not exist`);
  }
  logger.info('MinIO connected', { bucket: BUCKET });
}
