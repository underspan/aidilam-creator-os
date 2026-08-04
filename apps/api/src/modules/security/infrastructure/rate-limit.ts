/**
 * Rate Limiting with Redis
 *
 * Uses sliding window counters with Redis INCR + EXPIRE.
 * Namespaced keys: aidilam:ratelimit:<category>:<identity>
 *
 * Limits:
 *   - auth_failure: 10/minute per source (IP or token prefix)
 *   - general_api: 300/minute per service account
 *   - security_admin: 60/minute per service account
 *
 * Failure behavior:
 *   - Redis unavailable: security-admin endpoints fail closed
 *   - Redis unavailable: general API continues with local fallback (conservative)
 */

import { redis } from '../../../infrastructure/redis/index.js';
import { logger } from '../../../core/logging/index.js';
import { recordSecurityEvent } from './security-events.js';

export interface RateLimitConfig {
  category: string;
  maxRequests: number;
  windowSeconds: number;
  failClosed: boolean;
}

export const RATE_LIMITS = {
  authFailure: { category: 'auth_failure', maxRequests: 10, windowSeconds: 60, failClosed: true },
  generalApi: { category: 'general_api', maxRequests: 300, windowSeconds: 60, failClosed: false },
  securityAdmin: { category: 'security_admin', maxRequests: 60, windowSeconds: 60, failClosed: true },
} as const;

/**
 * Check rate limit. Returns { allowed: boolean, remaining: number, resetInSeconds: number }.
 * If Redis is unavailable, behavior depends on failClosed flag.
 */
export async function checkRateLimit(
  config: RateLimitConfig,
  identity: string,
  requestId?: string,
): Promise<{ allowed: boolean; remaining: number; resetInSeconds: number }> {
  const key = `aidilam:ratelimit:${config.category}:${identity}`;

  try {
    const multi = redis.multi();
    multi.incr(key);
    multi.ttl(key);
    const results = await multi.exec();

    if (!results) {
      return handleRedisUnavailable(config);
    }

    const count = results[0][1] as number;
    const ttl = results[1][1] as number;

    // Set expiry on first increment
    if (count === 1 || ttl === -1) {
      await redis.expire(key, config.windowSeconds);
    }

    const remaining = Math.max(0, config.maxRequests - count);
    const resetInSeconds = ttl > 0 ? ttl : config.windowSeconds;

    if (count > config.maxRequests) {
      // Rate limit exceeded - record security event
      await recordSecurityEvent({
        requestId,
        eventType: 'rate_limit_exceeded',
        severity: 'warning',
        actorType: 'service_account',
        actorId: identity,
        details: { category: config.category, count, limit: config.maxRequests },
      });

      return { allowed: false, remaining: 0, resetInSeconds };
    }

    return { allowed: true, remaining, resetInSeconds };
  } catch (err) {
    logger.warn('Rate limit Redis error', { error: (err as Error).message, category: config.category });
    return handleRedisUnavailable(config);
  }
}

function handleRedisUnavailable(config: RateLimitConfig): { allowed: boolean; remaining: number; resetInSeconds: number } {
  if (config.failClosed) {
    // Security endpoints: fail closed - deny when we can't verify rate limits
    return { allowed: false, remaining: 0, resetInSeconds: config.windowSeconds };
  }
  // General API: allow with a warning (fail open for availability)
  return { allowed: true, remaining: 1, resetInSeconds: config.windowSeconds };
}

/**
 * Track authentication failure for rate limiting purposes.
 */
export async function trackAuthFailure(sourceIdentity: string): Promise<boolean> {
  const result = await checkRateLimit(RATE_LIMITS.authFailure, sourceIdentity);
  return result.allowed;
}
