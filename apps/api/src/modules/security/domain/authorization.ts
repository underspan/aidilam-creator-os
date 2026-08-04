/**
 * Authorization Foundation
 *
 * Provides reusable authorization helpers for route handlers.
 * Implements deny-by-default: any request without explicit permission is denied.
 *
 * Deny precedence:
 *   explicit deny > global allow > project allow > default deny
 */

import { FastifyRequest } from 'fastify';
import { AppError } from '../../../core/errors/index.js';
import { RequestIdentity } from '../domain/identity.js';
import { pgPool } from '../../../infrastructure/database/index.js';
import { recordSecurityEvent } from '../infrastructure/security-events.js';

/**
 * Require that the request has a non-anonymous identity.
 */
export function requireAuthenticated(request: FastifyRequest): RequestIdentity {
  const identity = request.identity;
  if (!identity || identity.actorType === 'anonymous') {
    throw new AppError('AUTHENTICATION_REQUIRED', 'Authentication is required');
  }
  return identity;
}

/**
 * Require a specific global permission.
 * Denies with 403 if not authorized.
 */
export async function requirePermission(request: FastifyRequest, permission: string): Promise<void> {
  const identity = requireAuthenticated(request);

  // system identity (disabled_internal mode) has wildcard
  if (identity.globalPermissions.includes('*')) return;

  // Check global permissions
  if (identity.globalPermissions.includes(permission)) return;

  // Denied
  await recordAuthorizationDenied(request, identity, permission);
  throw new AppError('ACCESS_DENIED', 'Insufficient permissions');
}

/**
 * Require a permission scoped to a specific project.
 * Checks: global permission OR project-scoped permission via role assignment.
 */
export async function requireProjectPermission(
  request: FastifyRequest,
  projectId: string,
  permission: string,
): Promise<void> {
  const identity = requireAuthenticated(request);

  // system identity (disabled_internal mode) has wildcard
  if (identity.globalPermissions.includes('*')) return;

  // Check global permissions first (system_admin has all)
  if (identity.globalPermissions.includes(permission)) return;

  // Check project-scoped permissions
  const hasProjectPermission = await checkProjectPermission(identity, projectId, permission);
  if (hasProjectPermission) return;

  // Denied
  await recordAuthorizationDenied(request, identity, permission, projectId);
  throw new AppError('ACCESS_DENIED', 'Insufficient permissions for this project');
}

/**
 * Require any one of the listed permissions (OR logic).
 */
export async function requireAnyPermission(request: FastifyRequest, permissions: string[]): Promise<void> {
  const identity = requireAuthenticated(request);

  if (identity.globalPermissions.includes('*')) return;

  for (const perm of permissions) {
    if (identity.globalPermissions.includes(perm)) return;
  }

  await recordAuthorizationDenied(request, identity, permissions.join('|'));
  throw new AppError('ACCESS_DENIED', 'Insufficient permissions');
}

/**
 * Require a specific global role.
 */
export async function requireGlobalRole(request: FastifyRequest, role: string): Promise<void> {
  const identity = requireAuthenticated(request);

  if (identity.globalPermissions.includes('*')) return;
  if (identity.globalRoles.includes(role)) return;

  await recordAuthorizationDenied(request, identity, `role:${role}`);
  throw new AppError('ACCESS_DENIED', 'Insufficient role');
}

/**
 * Check if identity has a permission for a specific project via project role assignments.
 */
async function checkProjectPermission(
  identity: RequestIdentity,
  projectId: string,
  permission: string,
): Promise<boolean> {
  // For service accounts, check project role assignments using account_id
  // For users, use user_id
  const actorId = identity.actorId;

  // Query project role assignments and check if any assigned role has the required permission
  const result = await pgPool.query(
    `SELECT 1 FROM aidilam_app.project_role_assignments pra
     JOIN aidilam_app.role_permissions rp ON rp.role_id = pra.role_id
     JOIN aidilam_app.permissions p ON p.id = rp.permission_id
     WHERE pra.project_id = $1
       AND pra.user_id = $2
       AND p.code = $3
     LIMIT 1`,
    [projectId, actorId, permission]
  );

  return result.rows.length > 0;
}

/**
 * Record authorization denied security event.
 */
async function recordAuthorizationDenied(
  request: FastifyRequest,
  identity: RequestIdentity,
  permission: string,
  projectId?: string,
): Promise<void> {
  await recordSecurityEvent({
    requestId: request.id,
    eventType: 'authorization_denied',
    severity: 'warning',
    actorType: identity.actorType,
    actorId: identity.actorId,
    sourceIp: request.ip,
    userAgent: request.headers['user-agent'] || '',
    resource: request.url,
    details: {
      requiredPermission: permission,
      projectId: projectId || undefined,
      accountCode: identity.serviceAccountCode || undefined,
    },
  });
}
