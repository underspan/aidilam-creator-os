/**
 * CSRF Protection Plugin
 * AIDILAM-VIDEOMVP-004R5
 *
 * Validates CSRF token for all cookie-authenticated mutations.
 * Token is read from X-CSRF-Token header and validated against session.
 */
import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { createHash } from 'node:crypto';
import { pgPool } from '../infrastructure/database/index.js';

const SESSION_COOKIE = 'aidilam_session';
const CSRF_HEADER = 'x-csrf-token';

// Routes exempt from CSRF (login itself sets the token)
const CSRF_EXEMPT = new Set(['/login', '/health/live', '/health/ready']);

// Only mutating methods need CSRF
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function hashSessionId(id: string): string {
  return createHash('sha256').update(id).digest('hex');
}

function hashCsrfToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const csrfPluginFn: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const url = request.url.split('?')[0];

    // Skip non-mutating methods
    if (!MUTATING_METHODS.has(request.method)) return;

    // Skip exempt routes
    if (CSRF_EXEMPT.has(url)) return;

    // Only enforce for cookie-authenticated requests (not Bearer)
    const sessionCookie = (request as any).cookies?.[SESSION_COOKIE];
    if (!sessionCookie) return; // No cookie = no CSRF needed

    // If request also has Authorization header, it's a Bearer/API request — skip CSRF
    if (request.headers.authorization) return;

    // Has a session cookie without Bearer → CSRF required
    const csrfToken = request.headers[CSRF_HEADER] as string | undefined;
    if (!csrfToken) {
      reply.code(403).send({
        error: { code: 'CSRF_REQUIRED', message: 'CSRF token required for this mutation' },
      });
      return;
    }

    // Validate CSRF against session
    const sessionHash = hashSessionId(sessionCookie);
    const result = await pgPool.query(
      `SELECT csrf_token_hash FROM aidilam_app.browser_sessions
       WHERE session_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [sessionHash]
    );

    if (result.rows.length === 0) {
      reply.code(401).send({
        error: { code: 'SESSION_INVALID', message: 'Session expired or revoked' },
      });
      return;
    }

    const expectedHash = result.rows[0].csrf_token_hash;
    const actualHash = hashCsrfToken(csrfToken);

    if (actualHash !== expectedHash) {
      reply.code(403).send({
        error: { code: 'CSRF_INVALID', message: 'Invalid CSRF token' },
      });
      return;
    }

    // CSRF valid — continue
  });
};

export const csrfPlugin = fp(csrfPluginFn, { name: 'csrf-protection' });
