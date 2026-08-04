import { FastifyInstance } from 'fastify';
import { pgPool } from '../../../infrastructure/database/index.js';
import { AppError } from '../../../core/errors/index.js';
import { requirePermission } from '../domain/authorization.js';
import { generateServiceToken, loadPepper } from '../domain/token-utils.js';
import { recordAuditEvent } from '../infrastructure/audit-events.js';
import { config } from '../../../config/index.js';
import { parsePagination } from '../../../core/types/index.js';

export async function securityRoutes(app: FastifyInstance) {
  // List service accounts
  app.get('/api/v1/security/service-accounts', {
    schema: {
      tags: ['security'],
      description: 'List service accounts - requires service_accounts.read',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    await requirePermission(request, 'service_accounts.read');

    const { page, pageSize } = parsePagination(request.query as Record<string, string>);
    const offset = (page - 1) * pageSize;

    const [countRes, dataRes] = await Promise.all([
      pgPool.query('SELECT count(*) FROM aidilam_app.service_accounts'),
      pgPool.query(
        `SELECT id, code, name, description, status, created_at, last_used_at
         FROM aidilam_app.service_accounts ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      ),
    ]);
    const total = parseInt(countRes.rows[0].count, 10);

    return {
      data: dataRes.rows,
      meta: { requestId: request.id, page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  });

  // Create service account
  app.post('/api/v1/security/service-accounts', {
    schema: {
      tags: ['security'],
      description: 'Create a service account - requires service_accounts.create',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['code', 'name'],
        properties: {
          code: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[a-z0-9-]+$' },
          name: { type: 'string', minLength: 1, maxLength: 255 },
          description: { type: 'string', maxLength: 2000 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    await requirePermission(request, 'service_accounts.create');

    const { code, name, description } = request.body as { code: string; name: string; description?: string };
    const identity = request.identity!;

    const result = await pgPool.query(
      `INSERT INTO aidilam_app.service_accounts (code, name, description, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id, code, name, status, created_at`,
      [code, name, description || null, identity.actorId]
    );

    await recordAuditEvent({
      requestId: request.id,
      identity,
      action: 'service_account.create',
      resourceType: 'service_account',
      resourceId: result.rows[0].id,
      outcome: 'success',
      sourceIp: request.ip,
      userAgent: request.headers['user-agent'],
      newValues: { code, name },
    });

    reply.status(201).send({ data: result.rows[0], meta: { requestId: request.id } });
  });

  // Get service account
  app.get('/api/v1/security/service-accounts/:id', {
    schema: {
      tags: ['security'],
      description: 'Get service account details - requires service_accounts.read',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    await requirePermission(request, 'service_accounts.read');

    const { id } = request.params as { id: string };
    const result = await pgPool.query(
      `SELECT id, code, name, description, status, created_at, updated_at, last_used_at
       FROM aidilam_app.service_accounts WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) throw new AppError('RESOURCE_NOT_FOUND', 'Service account not found');

    // Also get tokens (without hashes)
    const tokens = await pgPool.query(
      `SELECT id, token_prefix, name, status, expires_at, last_used_at, created_at, revoked_at
       FROM aidilam_app.service_tokens WHERE service_account_id = $1 ORDER BY created_at DESC`,
      [id]
    );

    return {
      data: { ...result.rows[0], tokens: tokens.rows },
      meta: { requestId: request.id },
    };
  });

  // Create token for service account
  app.post('/api/v1/security/service-accounts/:id/tokens', {
    schema: {
      tags: ['security'],
      description: 'Create a new token for a service account - requires service_accounts.rotate_token',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          expiresInDays: { type: 'integer', minimum: 1, maximum: 365 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    await requirePermission(request, 'service_accounts.rotate_token');

    const { id } = request.params as { id: string };
    const { name, expiresInDays } = request.body as { name: string; expiresInDays?: number };
    const identity = request.identity!;

    // Verify service account exists and is active
    const account = await pgPool.query(
      'SELECT id, code, status FROM aidilam_app.service_accounts WHERE id = $1',
      [id]
    );
    if (account.rows.length === 0) throw new AppError('RESOURCE_NOT_FOUND', 'Service account not found');
    if (account.rows[0].status !== 'active') throw new AppError('CONFLICT', 'Service account is not active');

    const pepper = loadPepper(config.auth.pepperPath);
    const { plaintext, prefix, hash } = generateServiceToken(pepper);

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const tokenResult = await pgPool.query(
      `INSERT INTO aidilam_app.service_tokens (service_account_id, token_prefix, token_hash, name, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, token_prefix, name, status, expires_at, created_at`,
      [id, prefix, hash, name, expiresAt, identity.actorId]
    );

    await recordAuditEvent({
      requestId: request.id,
      identity,
      action: 'service_token.create',
      resourceType: 'service_token',
      resourceId: tokenResult.rows[0].id,
      outcome: 'success',
      sourceIp: request.ip,
      userAgent: request.headers['user-agent'],
      metadata: { serviceAccountId: id, tokenName: name },
    });

    // Return plaintext token ONCE
    reply.status(201).send({
      data: {
        ...tokenResult.rows[0],
        token: plaintext, // Only time the token is exposed
      },
      meta: {
        requestId: request.id,
        warning: 'This token value is shown once and cannot be retrieved again.',
      },
    });
  });

  // Revoke token
  app.post('/api/v1/security/service-accounts/:id/tokens/:tokenId/revoke', {
    schema: {
      tags: ['security'],
      description: 'Revoke a service token - requires service_accounts.revoke_token',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    await requirePermission(request, 'service_accounts.revoke_token');

    const { id, tokenId } = request.params as { id: string; tokenId: string };
    const identity = request.identity!;

    const result = await pgPool.query(
      `UPDATE aidilam_app.service_tokens SET status = 'revoked', revoked_at = now()
       WHERE id = $1 AND service_account_id = $2 AND status = 'active'
       RETURNING id, token_prefix, name, status, revoked_at`,
      [tokenId, id]
    );
    if (result.rows.length === 0) throw new AppError('RESOURCE_NOT_FOUND', 'Token not found or already revoked');

    await recordAuditEvent({
      requestId: request.id,
      identity,
      action: 'service_token.revoke',
      resourceType: 'service_token',
      resourceId: tokenId,
      outcome: 'success',
      sourceIp: request.ip,
      userAgent: request.headers['user-agent'],
      metadata: { serviceAccountId: id },
    });

    return { data: result.rows[0], meta: { requestId: request.id } };
  });

  // List audit events
  app.get('/api/v1/security/audit-events', {
    schema: {
      tags: ['security'],
      description: 'List audit events - requires audit.read',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    await requirePermission(request, 'audit.read');

    const { page, pageSize } = parsePagination(request.query as Record<string, string>);
    const offset = (page - 1) * pageSize;

    const [countRes, dataRes] = await Promise.all([
      pgPool.query('SELECT count(*) FROM aidilam_app.audit_events'),
      pgPool.query(
        `SELECT id, occurred_at, request_id, actor_type, actor_id, actor_display, action,
                resource_type, resource_id, project_id, outcome, source_ip, metadata
         FROM aidilam_app.audit_events ORDER BY occurred_at DESC LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      ),
    ]);
    const total = parseInt(countRes.rows[0].count, 10);

    return {
      data: dataRes.rows,
      meta: { requestId: request.id, page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  });

  // List security events
  app.get('/api/v1/security/security-events', {
    schema: {
      tags: ['security'],
      description: 'List security events - requires security.read',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    await requirePermission(request, 'security.read');

    const { page, pageSize } = parsePagination(request.query as Record<string, string>);
    const offset = (page - 1) * pageSize;

    const [countRes, dataRes] = await Promise.all([
      pgPool.query('SELECT count(*) FROM aidilam_app.security_events'),
      pgPool.query(
        `SELECT id, occurred_at, request_id, event_type, severity, actor_type, actor_id,
                source_ip, resource, details
         FROM aidilam_app.security_events ORDER BY occurred_at DESC LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      ),
    ]);
    const total = parseInt(countRes.rows[0].count, 10);

    return {
      data: dataRes.rows,
      meta: { requestId: request.id, page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  });
}
