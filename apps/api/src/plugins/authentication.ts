/**
 * Authentication Plugin for Fastify
 *
 * Registers an onRequest hook that:
 * 1. Skips authentication for health/live and health/ready
 * 2. In disabled_internal mode, attaches a system identity
 * 3. In service_token mode, validates Bearer token
 * 4. Attaches resolved identity to request
 */

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { config } from '../config/index.js';
import { logger } from '../core/logging/index.js';
import { AppError } from '../core/errors/index.js';
import { parseTokenFormat, verifyTokenHash, loadPepper } from '../modules/security/domain/token-utils.js';
import { RequestIdentity, ANONYMOUS_IDENTITY } from '../modules/security/domain/identity.js';
import { pgPool } from '../infrastructure/database/index.js';
import { recordSecurityEvent } from '../modules/security/infrastructure/security-events.js';

declare module 'fastify' {
  interface FastifyRequest {
    identity: RequestIdentity | null;
  }
}

// Routes that never require authentication
const UNAUTHENTICATED_ROUTES = new Set([
  '/health/live',
  '/health/ready',
  '/login',
  '/logout',
]);

// UI routes that handle their own session auth (redirect to /login if unauthenticated)
const UI_SELF_AUTH_PREFIXES = ['/', '/projects'];

// Routes that require authentication but not specific permission checks
// (the route handler itself will do permission checks)
const DOCUMENTATION_ROUTES_PREFIX = '/documentation';

const authenticationPluginFn: FastifyPluginAsync = async (app) => {
  // Safety check: disabled_internal must not be used with PUBLIC_EXPOSURE=true
  if (config.auth.mode === 'disabled_internal' && config.auth.publicExposure) {
    logger.error('FATAL: AUTH_MODE=disabled_internal is not allowed when PUBLIC_EXPOSURE=true');
    process.exit(1);
  }

  // Load pepper if in service_token mode
  let pepper: Buffer | undefined;
  if (config.auth.mode === 'service_token') {
    try {
      pepper = loadPepper(config.auth.pepperPath);
    } catch (err) {
      logger.error('FATAL: Cannot load service token pepper', { error: (err as Error).message });
      process.exit(1);
    }
  }

  // Decorate request with identity (Fastify 5 requires null for reference types)
  app.decorateRequest('identity', null);

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const url = request.url.split('?')[0]; // strip query params

    // Allow unauthenticated access to health endpoints and login
    if (UNAUTHENTICATED_ROUTES.has(url)) {
      request.identity = ANONYMOUS_IDENTITY;
      return;
    }

    // UI routes (non-API) handle their own session auth internally
    // They redirect to /login if unauthenticated — don't block with 401
    if (!url.startsWith('/api/') && !url.startsWith('/health')) {
      request.identity = ANONYMOUS_IDENTITY;
      return;
    }

    // In disabled_internal mode, attach system identity (internal dev only)
    if (config.auth.mode === 'disabled_internal') {
      request.identity = {
        actorType: 'system',
        actorId: 'system-internal',
        displayName: 'Internal System (auth disabled)',
        globalRoles: ['system_admin'],
        globalPermissions: ['*'],
        projectRoles: {},
      };
      return;
    }

    // service_token mode: require valid Bearer token OR valid session cookie
    if (config.auth.mode === 'service_token') {
      // Try session cookie first (browser dashboard)
      const sessionCookie = (request as any).cookies?.['aidilam_session'];
      if (sessionCookie) {
        const sessionIdentity = await authenticateSessionCookie(sessionCookie);
        if (sessionIdentity) {
          request.identity = sessionIdentity;
          return;
        }
        // Invalid/expired session — fall through to bearer check
      }

      // Try Bearer token (API/machine access)
      const identity = await authenticateServiceToken(request, pepper!);
      if (!identity) {
        throw new AppError('AUTHENTICATION_REQUIRED', 'Valid authentication credentials are required');
      }
      request.identity = identity;

      // Documentation routes require system.read permission
      if (url.startsWith(DOCUMENTATION_ROUTES_PREFIX)) {
        if (!identity.globalPermissions.includes('*') && !identity.globalPermissions.includes('system.read')) {
          throw new AppError('ACCESS_DENIED', 'Insufficient permissions for documentation access');
        }
      }

      return;
    }

    // future_oidc: placeholder - always deny
    if (config.auth.mode === 'future_oidc') {
      throw new AppError('AUTHENTICATION_REQUIRED', 'OIDC authentication not yet implemented');
    }

    // Unknown mode - deny
    throw new AppError('INTERNAL_ERROR', 'Invalid authentication configuration');
  });
};

async function authenticateSessionCookie(sessionId: string): Promise<RequestIdentity | null> {
  try {
    const { createHash } = await import('node:crypto');
    const sessionHash = createHash('sha256').update(sessionId).digest('hex');

    const sessionRes = await pgPool.query(
      `SELECT bs.user_id, u.display_name, u.status
       FROM aidilam_app.browser_sessions bs
       JOIN aidilam_app.users u ON u.id = bs.user_id
       WHERE bs.session_hash = $1 AND bs.revoked_at IS NULL AND bs.expires_at > now()`,
      [sessionHash]
    );

    if (sessionRes.rows.length === 0) return null;
    const row = sessionRes.rows[0];
    if (row.status !== 'active') return null;

    // Load user roles (reuse existing RBAC)
    const rolesRes = await pgPool.query(
      `SELECT r.code FROM aidilam_app.roles r
       JOIN aidilam_app.project_role_assignments pra ON pra.role_id = r.id
       WHERE pra.user_id = $1`,
      [row.user_id]
    ).catch(() => ({ rows: [] }));

    const globalRoles = rolesRes.rows.map((r: any) => r.code);

    // Load permissions
    const permsRes = await pgPool.query(
      `SELECT DISTINCT p.code FROM aidilam_app.permissions p
       JOIN aidilam_app.role_permissions rp ON rp.permission_id = p.id
       JOIN aidilam_app.roles r ON r.id = rp.role_id
       JOIN aidilam_app.project_role_assignments pra ON pra.role_id = r.id
       WHERE pra.user_id = $1`,
      [row.user_id]
    ).catch(() => ({ rows: [] }));

    const permissions = permsRes.rows.map((p: any) => p.code);

    // For owner/admin, grant all permissions
    const isAdmin = globalRoles.includes('system_admin') || globalRoles.includes('owner');

    return {
      actorType: 'user',
      actorId: row.user_id,
      displayName: row.display_name || 'User',
      globalRoles,
      globalPermissions: isAdmin ? ['*'] : permissions,
      projectRoles: {},
    };
  } catch {
    return null;
  }
}

async function authenticateServiceToken(
  request: FastifyRequest,
  pepper: Buffer,
): Promise<RequestIdentity | null> {
  const authHeader = request.headers.authorization;
  const sourceIp = request.ip;
  const userAgent = request.headers['user-agent'] || '';
  const requestId = request.id;

  // No authorization header
  if (!authHeader) {
    await recordSecurityEvent({
      requestId,
      eventType: 'authentication_failure',
      severity: 'warning',
      actorType: 'anonymous',
      sourceIp,
      userAgent,
      resource: request.url,
      details: { reason: 'missing_authorization_header' },
    });
    return null;
  }

  // Must be Bearer scheme
  if (!authHeader.startsWith('Bearer ')) {
    await recordSecurityEvent({
      requestId,
      eventType: 'invalid_request',
      severity: 'warning',
      actorType: 'anonymous',
      sourceIp,
      userAgent,
      resource: request.url,
      details: { reason: 'invalid_scheme' },
    });
    return null;
  }

  const token = authHeader.slice(7); // Remove 'Bearer '

  // Parse token format
  const parsed = parseTokenFormat(token);
  if (!parsed) {
    await recordSecurityEvent({
      requestId,
      eventType: 'invalid_request',
      severity: 'warning',
      actorType: 'anonymous',
      sourceIp,
      userAgent,
      resource: request.url,
      details: { reason: 'malformed_token_format' },
    });
    return null;
  }

  // Lookup token record by prefix
  const tokenResult = await pgPool.query(
    `SELECT st.id, st.token_hash, st.status, st.expires_at, st.service_account_id,
            sa.id AS account_id, sa.code AS account_code, sa.name AS account_name, sa.status AS account_status
     FROM aidilam_app.service_tokens st
     JOIN aidilam_app.service_accounts sa ON sa.id = st.service_account_id
     WHERE st.token_prefix = $1
     LIMIT 1`,
    [parsed.prefix]
  );

  if (tokenResult.rows.length === 0) {
    await recordSecurityEvent({
      requestId,
      eventType: 'authentication_failure',
      severity: 'warning',
      actorType: 'anonymous',
      sourceIp,
      userAgent,
      resource: request.url,
      details: { reason: 'token_not_found' },
    });
    return null;
  }

  const row = tokenResult.rows[0];

  // Check token status
  if (row.status !== 'active') {
    const eventType = row.status === 'revoked' ? 'token_revoked' : 'token_expired';
    await recordSecurityEvent({
      requestId,
      eventType,
      severity: 'warning',
      actorType: 'service_account',
      actorId: row.account_id,
      sourceIp,
      userAgent,
      resource: request.url,
      details: { reason: `token_${row.status}` },
    });
    return null;
  }

  // Check expiration
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    // Mark token as expired in DB (fire and forget)
    pgPool.query(
      `UPDATE aidilam_app.service_tokens SET status = 'expired' WHERE id = $1`,
      [row.id]
    ).catch(() => {});

    await recordSecurityEvent({
      requestId,
      eventType: 'token_expired',
      severity: 'warning',
      actorType: 'service_account',
      actorId: row.account_id,
      sourceIp,
      userAgent,
      resource: request.url,
      details: { reason: 'token_expired' },
    });
    return null;
  }

  // Check service account status
  if (row.account_status !== 'active') {
    await recordSecurityEvent({
      requestId,
      eventType: 'authentication_failure',
      severity: 'high',
      actorType: 'service_account',
      actorId: row.account_id,
      sourceIp,
      userAgent,
      resource: request.url,
      details: { reason: 'account_disabled' },
    });
    return null;
  }

  // Verify token hash (constant-time)
  if (!verifyTokenHash(parsed.secret, row.token_hash, pepper)) {
    await recordSecurityEvent({
      requestId,
      eventType: 'authentication_failure',
      severity: 'high',
      actorType: 'anonymous',
      sourceIp,
      userAgent,
      resource: request.url,
      details: { reason: 'hash_mismatch' },
    });
    return null;
  }

  // Authentication succeeded - resolve permissions
  const identity = await resolveServiceAccountIdentity(row.account_id, row.account_code, row.account_name);

  // Update last_used_at asynchronously (fire and forget)
  const now = new Date().toISOString();
  pgPool.query(
    `UPDATE aidilam_app.service_tokens SET last_used_at = $1 WHERE id = $2`,
    [now, row.id]
  ).catch(() => {});
  pgPool.query(
    `UPDATE aidilam_app.service_accounts SET last_used_at = $1 WHERE id = $2`,
    [now, row.account_id]
  ).catch(() => {});

  // Record success
  await recordSecurityEvent({
    requestId,
    eventType: 'authentication_success',
    severity: 'info',
    actorType: 'service_account',
    actorId: row.account_id,
    sourceIp,
    userAgent,
    resource: request.url,
    details: { accountCode: row.account_code },
  });

  return identity;
}

async function resolveServiceAccountIdentity(
  accountId: string,
  accountCode: string,
  accountName: string,
): Promise<RequestIdentity> {
  // For service accounts, we resolve roles based on a mapping table
  // For now, system_admin service accounts (like bootstrap) get all permissions
  // In production, this should use a service_account_roles table

  // Resolve global roles - for service accounts we use a convention:
  // The bootstrap admin (aidilam-internal-admin) gets system_admin role
  // Other service accounts get service_worker role by default
  // This can be extended with a service_account_roles table later

  let globalRoles: string[] = [];
  let globalPermissions: string[] = [];

  if (accountCode === 'aidilam-internal-admin') {
    globalRoles = ['system_admin'];
    // system_admin gets all permissions
    const permResult = await pgPool.query(
      `SELECT DISTINCT p.code
       FROM aidilam_app.role_permissions rp
       JOIN aidilam_app.permissions p ON p.id = rp.permission_id
       JOIN aidilam_app.roles r ON r.id = rp.role_id
       WHERE r.code = 'system_admin'`
    );
    globalPermissions = permResult.rows.map((r: { code: string }) => r.code);
  } else if (accountCode === 'aidilam-worker') {
    // Worker service account gets service_worker global role
    globalRoles = ['service_worker'];
    const permResult = await pgPool.query(
      `SELECT DISTINCT p.code
       FROM aidilam_app.role_permissions rp
       JOIN aidilam_app.permissions p ON p.id = rp.permission_id
       JOIN aidilam_app.roles r ON r.id = rp.role_id
       WHERE r.code = 'service_worker'`
    );
    globalPermissions = permResult.rows.map((r: { code: string }) => r.code);
  } else {
    // Other service accounts: check if they have project-scoped role assignments
    // If so, they are restricted — no global permissions (rely on project roles only)
    // If not, grant service_worker as fallback for backward compatibility
    const projectRoleCheck = await pgPool.query(
      `SELECT count(*) as cnt FROM aidilam_app.project_role_assignments WHERE user_id = $1`,
      [accountId]
    );
    const hasProjectRoles = parseInt(projectRoleCheck.rows[0].cnt, 10) > 0;

    if (!hasProjectRoles) {
      // No explicit project assignments — grant service_worker global permissions as default
      globalRoles = ['service_worker'];
      const permResult = await pgPool.query(
        `SELECT DISTINCT p.code
         FROM aidilam_app.role_permissions rp
         JOIN aidilam_app.permissions p ON p.id = rp.permission_id
         JOIN aidilam_app.roles r ON r.id = rp.role_id
         WHERE r.code = 'service_worker'`
      );
      globalPermissions = permResult.rows.map((r: { code: string }) => r.code);
    }
    // Accounts with project role assignments get no global permissions
    // Their access is resolved per-project via requireProjectPermission
  }

  // Project roles for service accounts: loaded on-demand during authorization
  // (not pre-loaded to avoid N+1 on every request)

  return {
    actorType: 'service_account',
    actorId: accountId,
    serviceAccountCode: accountCode,
    displayName: accountName,
    globalRoles,
    globalPermissions,
    projectRoles: {},
  };
}

export const authenticationPlugin = fp(authenticationPluginFn, {
  name: 'aidilam-authentication',
});
