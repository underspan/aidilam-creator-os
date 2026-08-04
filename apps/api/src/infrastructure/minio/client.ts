import * as Minio from 'minio';
import { config } from '../../config/index.js';

export const minioClient = new Minio.Client({
  endPoint: config.minio.endPoint,
  port: config.minio.port,
  accessKey: config.secrets.minioAccessKey,
  secretKey: config.secrets.minioSecretKey,
  useSSL: config.minio.useSSL,
});

export async function checkMinio(): Promise<boolean> {
  try {
    return await minioClient.bucketExists(config.minio.bucket);
  } catch {
    return false;
  }
}
