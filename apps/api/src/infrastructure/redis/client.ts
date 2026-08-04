import Redis from 'ioredis';
import { config } from '../../config/index.js';

export const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.secrets.redisPassword,
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    return Math.min(times * 200, 5000);
  },
  lazyConnect: true,
});

export async function checkRedis(): Promise<boolean> {
  try {
    return (await redis.ping()) === 'PONG';
  } catch {
    return false;
  }
}

export async function shutdownRedis(): Promise<void> {
  redis.disconnect();
}
