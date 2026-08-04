/**
 * Rate Limiting Plugin for Fastify
 *
 * Applies rate limits based on route category.
 * Security admin routes: 60/min (fail closed)
 * General API routes: 300/min (fail open if Redis unavailable)
 */

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { checkRateLimit, RATE_LIMITS } from '../modules/security/infrastructure/rate-limit.js';
import { AppError } from '../core/errors/index.js';

const SECURITY_ADMIN_PREFIX = '/api/v1/security/';

const rateLimitPluginFn: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const url = request.url.split('?')[0];

    // Skip rate limiting for health endpoints
    if (url.startsWith('/health/')) return;

    // Determine identity for rate limiting
    const identity = request.identity;
    const rateLimitKey = identity?.actorId || request.ip || 'unknown';

    // Select rate limit config based on route
    const config = url.startsWith(SECURITY_ADMIN_PREFIX)
      ? RATE_LIMITS.securityAdmin
      : RATE_LIMITS.generalApi;

    const result = await checkRateLimit(config, rateLimitKey, request.id);

    // Set rate limit headers
    reply.header('X-RateLimit-Limit', config.maxRequests);
    reply.header('X-RateLimit-Remaining', result.remaining);
    reply.header('X-RateLimit-Reset', result.resetInSeconds);

    if (!result.allowed) {
      throw new AppError('RATE_LIMITED', 'Rate limit exceeded. Please retry later.');
    }
  });
};

export const rateLimitPlugin = fp(rateLimitPluginFn, {
  name: 'aidilam-rate-limit',
});
