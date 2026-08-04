/**
 * Publishing Routes — Publishing Account, Destination, and Profile API
 *
 * Provides endpoints for managing publishing accounts, destinations,
 * and publishing profiles for content distribution.
 */

import { FastifyInstance } from 'fastify';
import { pgPool } from '../../../infrastructure/database/index.js';
import { AppError } from '../../../core/errors/index.js';
import { withTransaction } from '../../../core/transactions/index.js';
import { parsePagination } from '../../../core/types/index.js';
import { requirePermission, requireProjectPermission } from '../../security/domain/authorization.js';
import { recordAuditEvent } from '../../security/infrastructure/audit-events.js';

const CREDENTIAL_FIELDS = new Set([
  'access_token', 'accesstoken', 'refresh_token', 'refreshtoken',
  'password', 'cookie', 'cookies', 'authorization',
  'client_secret', 'clientsecret', 'session', 'session_id',
  'sessionid', 'oauth_token', 'oauthtoken', 'bearer',
]);

function rejectCredentialFields(body: unknown, depth = 0): void {
  if (depth > 5 || body === null || body === undefined) return;
  if (typeof body === 'object' && !Array.isArray(body)) {
    for (const key of Object.keys(body as Record<string, unknown>)) {
      const normalized = key.toLowerCase().replace(/[-_]/g, '');
      if (CREDENTIAL_FIELDS.has(normalized) || CREDENTIAL_FIELDS.has(key.toLowerCase())) {
        throw new AppError('VALIDATION_ERROR', 'Credential fields are not allowed in publishing requests');
      }
      const val = (body as Record<string, unknown>)[key];
      if (typeof val === 'object' && val !== null) rejectCredentialFields(val, depth + 1);
    }
  } else if (Array.isArray(body)) {
    for (let i = 0; i < Math.min(body.length, 20); i++) {
      if (typeof body[i] === 'object' && body[i] !== null) rejectCredentialFields(body[i], depth + 1);
    }
  }
}

const ALLOWED_ACCOUNT_STATUSES = ['draft', 'validation_only', 'disabled'];
const ALLOWED_DESTINATION_STATUSES = ['draft', 'validation_only', 'disabled'];

export async function publishingRoutes(app: FastifyInstance) {
  // Pre-validation hook: detect credential fields before schema strips additionalProperties
  app.addHook('preValidation', async (request) => {
    if (request.method === 'GET' || request.method === 'DELETE') return;
    if (!request.url.includes('/publishing/')) return;
    if (request.body && typeof request.body === 'object') {
      rejectCredentialFields(request.body);
    }
  });
  // =========================================================================
  // GET /api/v1/projects/:projectId/publishing/accounts
  // List publishing accounts for a project
  // =========================================================================
  app.get('/api/v1/projects/:projectId/publishing/accounts', {
    schema: {
      tags: ['publishing'],
      description: 'List publishing accounts for a project',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          pageSize: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'publishing.account.read');

    const query = request.query as { page?: string; pageSize?: string };
    const { page, pageSize } = parsePagination(query);
    const offset = (page - 1) * pageSize;

    const [countRes, dataRes] = await Promise.all([
      pgPool.query(
        `SELECT count(*) FROM aidilam_app.publishing_accounts
         WHERE project_id = $1 AND status != 'disabled'`,
        [projectId],
      ),
      pgPool.query(
        `SELECT pa.id, pa.project_id, pa.platform_id, pa.display_name,
                pa.external_account_reference, pa.account_type, pa.status,
                pa.capabilities_snapshot_json, pa.last_validated_at,
                pa.created_by, pa.created_at, pa.updated_at,
                pp.platform_key, pp.display_name AS platform_display_name
         FROM aidilam_app.publishing_accounts pa
         JOIN aidilam_app.publishing_platforms pp ON pp.id = pa.platform_id
         WHERE pa.project_id = $1 AND pa.status != 'disabled'
         ORDER BY pa.display_name
         LIMIT $2 OFFSET $3`,
        [projectId, pageSize, offset],
      ),
    ]);

    const total = parseInt(countRes.rows[0].count, 10);
    return {
      data: dataRes.rows,
      meta: { requestId: request.id, page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  });

  // =========================================================================
  // POST /api/v1/projects/:projectId/publishing/accounts
  // Create a publishing account
  // =========================================================================
  app.post('/api/v1/projects/:projectId/publishing/accounts', {
    schema: {
      tags: ['publishing'],
      description: 'Create a publishing account for a project',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['platformKey', 'displayName', 'accountType'],
        properties: {
          platformKey: { type: 'string', minLength: 1, maxLength: 100 },
          displayName: { type: 'string', minLength: 1, maxLength: 200 },
          accountType: { type: 'string', minLength: 1, maxLength: 100 },
          externalAccountReference: { type: 'string', maxLength: 500 },
          status: { type: 'string', enum: ['draft', 'validation_only', 'disabled'] },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'publishing.account.manage');

    const body = request.body as {
      platformKey: string;
      displayName: string;
      accountType: string;
      externalAccountReference?: string;
      status?: string;
    };

    rejectCredentialFields(body as unknown as Record<string, unknown>);

    const identity = request.identity!;

    // Validate status
    if (body.status && !ALLOWED_ACCOUNT_STATUSES.includes(body.status)) {
      throw new AppError('VALIDATION_ERROR', `Invalid status. Allowed: ${ALLOWED_ACCOUNT_STATUSES.join(', ')}`);
    }

    // Validate platform exists and is enabled
    const platformResult = await pgPool.query(
      `SELECT id, platform_key, display_name FROM aidilam_app.publishing_platforms
       WHERE platform_key = $1 AND is_enabled = true`,
      [body.platformKey],
    );

    if (platformResult.rows.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Platform not found or not enabled');
    }

    const platform = platformResult.rows[0];

    const result = await withTransaction(pgPool, async (client) => {
      const insertResult = await client.query(
        `INSERT INTO aidilam_app.publishing_accounts
           (project_id, platform_id, display_name, external_account_reference,
            account_type, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, created_at`,
        [
          projectId, platform.id, body.displayName,
          body.externalAccountReference ?? null,
          body.accountType, body.status ?? 'draft', identity.actorId,
        ],
      );

      const account = insertResult.rows[0];

      await recordAuditEvent({
        requestId: request.id,
        identity,
        action: 'publishing_account.create',
        resourceType: 'publishing_account',
        resourceId: account.id,
        projectId,
        outcome: 'success',
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'],
        newValues: { displayName: body.displayName, platformKey: body.platformKey, accountType: body.accountType },
      }, client);

      return account;
    });

    reply.status(201).send({
      data: {
        id: result.id,
        displayName: body.displayName,
        platformKey: body.platformKey,
        accountType: body.accountType,
        status: body.status ?? 'draft',
        createdAt: result.created_at,
      },
      meta: { requestId: request.id },
    });
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/publishing/accounts/:accountId
  // Get a publishing account
  // =========================================================================
  app.get('/api/v1/projects/:projectId/publishing/accounts/:accountId', {
    schema: {
      tags: ['publishing'],
      description: 'Get a publishing account by ID',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, accountId } = request.params as { projectId: string; accountId: string };
    await requireProjectPermission(request, projectId, 'publishing.account.read');

    const result = await pgPool.query(
      `SELECT pa.id, pa.project_id, pa.platform_id, pa.display_name,
              pa.external_account_reference, pa.account_type, pa.status,
              pa.capabilities_snapshot_json, pa.last_validated_at,
              pa.created_by, pa.created_at, pa.updated_at,
              pp.platform_key, pp.display_name AS platform_display_name
       FROM aidilam_app.publishing_accounts pa
       JOIN aidilam_app.publishing_platforms pp ON pp.id = pa.platform_id
       WHERE pa.id = $1 AND pa.project_id = $2`,
      [accountId, projectId],
    );

    if (result.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Publishing account not found');
    }

    return {
      data: result.rows[0],
      meta: { requestId: request.id },
    };
  });

  // =========================================================================
  // PATCH /api/v1/projects/:projectId/publishing/accounts/:accountId
  // Update a publishing account
  // =========================================================================
  app.patch('/api/v1/projects/:projectId/publishing/accounts/:accountId', {
    schema: {
      tags: ['publishing'],
      description: 'Update a publishing account',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          displayName: { type: 'string', minLength: 1, maxLength: 200 },
          accountType: { type: 'string', minLength: 1, maxLength: 100 },
          externalAccountReference: { type: 'string', maxLength: 500 },
          status: { type: 'string', enum: ['draft', 'validation_only', 'disabled'] },
        },
        additionalProperties: false,
      },
    },
  }, async (request) => {
    const { projectId, accountId } = request.params as { projectId: string; accountId: string };
    await requireProjectPermission(request, projectId, 'publishing.account.manage');

    const body = request.body as {
      displayName?: string;
      accountType?: string;
      externalAccountReference?: string;
      status?: string;
    };

    rejectCredentialFields(body as unknown as Record<string, unknown>);

    const identity = request.identity!;

    if (body.status && !ALLOWED_ACCOUNT_STATUSES.includes(body.status)) {
      throw new AppError('VALIDATION_ERROR', `Invalid status. Allowed: ${ALLOWED_ACCOUNT_STATUSES.join(', ')}`);
    }

    const result = await withTransaction(pgPool, async (client) => {
      const existing = await client.query(
        `SELECT id FROM aidilam_app.publishing_accounts
         WHERE id = $1 AND project_id = $2`,
        [accountId, projectId],
      );

      if (existing.rows.length === 0) {
        throw new AppError('RESOURCE_NOT_FOUND', 'Publishing account not found');
      }

      const setClauses: string[] = ['updated_at = now()'];
      const updateParams: unknown[] = [];
      let pIdx = 1;

      if (body.displayName !== undefined) { setClauses.push(`display_name = $${pIdx++}`); updateParams.push(body.displayName); }
      if (body.accountType !== undefined) { setClauses.push(`account_type = $${pIdx++}`); updateParams.push(body.accountType); }
      if (body.externalAccountReference !== undefined) { setClauses.push(`external_account_reference = $${pIdx++}`); updateParams.push(body.externalAccountReference); }
      if (body.status !== undefined) { setClauses.push(`status = $${pIdx++}`); updateParams.push(body.status); }

      updateParams.push(accountId);
      updateParams.push(projectId);

      const updateResult = await client.query(
        `UPDATE aidilam_app.publishing_accounts
         SET ${setClauses.join(', ')}
         WHERE id = $${pIdx++} AND project_id = $${pIdx++}
         RETURNING id, updated_at`,
        updateParams,
      );

      if (updateResult.rows.length === 0) {
        throw new AppError('RESOURCE_NOT_FOUND', 'Publishing account not found');
      }

      await recordAuditEvent({
        requestId: request.id,
        identity,
        action: 'publishing_account.update',
        resourceType: 'publishing_account',
        resourceId: accountId,
        projectId,
        outcome: 'success',
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'],
        newValues: { ...body },
      }, client);

      return updateResult.rows[0];
    });

    return {
      data: { id: result.id, updatedAt: result.updated_at },
      meta: { requestId: request.id },
    };
  });

  // =========================================================================
  // DELETE /api/v1/projects/:projectId/publishing/accounts/:accountId
  // Disable a publishing account (soft delete)
  // =========================================================================
  app.delete('/api/v1/projects/:projectId/publishing/accounts/:accountId', {
    schema: {
      tags: ['publishing'],
      description: 'Disable a publishing account (sets status to disabled)',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, accountId } = request.params as { projectId: string; accountId: string };
    await requireProjectPermission(request, projectId, 'publishing.account.manage');

    const identity = request.identity!;

    const result = await withTransaction(pgPool, async (client) => {
      const existing = await client.query(
        `SELECT id, status FROM aidilam_app.publishing_accounts
         WHERE id = $1 AND project_id = $2`,
        [accountId, projectId],
      );

      if (existing.rows.length === 0) {
        throw new AppError('RESOURCE_NOT_FOUND', 'Publishing account not found');
      }

      await client.query(
        `UPDATE aidilam_app.publishing_accounts
         SET status = 'disabled', updated_at = now()
         WHERE id = $1 AND project_id = $2`,
        [accountId, projectId],
      );

      await recordAuditEvent({
        requestId: request.id,
        identity,
        action: 'publishing_account.delete',
        resourceType: 'publishing_account',
        resourceId: accountId,
        projectId,
        outcome: 'success',
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'],
        previousValues: { status: existing.rows[0].status },
        newValues: { status: 'disabled' },
      }, client);

      return { id: accountId };
    });

    return {
      data: { id: result.id, status: 'disabled' },
      meta: { requestId: request.id },
    };
  });

  // =========================================================================
  // POST /api/v1/projects/:projectId/publishing/accounts/:accountId/validate
  // Validate a publishing account (mock)
  // =========================================================================
  app.post('/api/v1/projects/:projectId/publishing/accounts/:accountId/validate', {
    schema: {
      tags: ['publishing'],
      description: 'Validate a publishing account',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, accountId } = request.params as { projectId: string; accountId: string };
    await requireProjectPermission(request, projectId, 'publishing.validation.execute');

    const identity = request.identity!;

    const existing = await pgPool.query(
      `SELECT id FROM aidilam_app.publishing_accounts
       WHERE id = $1 AND project_id = $2`,
      [accountId, projectId],
    );

    if (existing.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Publishing account not found');
    }

    await recordAuditEvent({
      requestId: request.id,
      identity,
      action: 'publishing_account.validate',
      resourceType: 'publishing_account',
      resourceId: accountId,
      projectId,
      outcome: 'success',
      sourceIp: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return {
      data: { valid: true, validatedAt: new Date().toISOString() },
      meta: { requestId: request.id },
    };
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/publishing/destinations
  // List publishing destinations for a project
  // =========================================================================
  app.get('/api/v1/projects/:projectId/publishing/destinations', {
    schema: {
      tags: ['publishing'],
      description: 'List publishing destinations for a project',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          pageSize: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'publishing.destination.read');

    const query = request.query as { page?: string; pageSize?: string };
    const { page, pageSize } = parsePagination(query);
    const offset = (page - 1) * pageSize;

    const [countRes, dataRes] = await Promise.all([
      pgPool.query(
        `SELECT count(*) FROM aidilam_app.publishing_destinations
         WHERE project_id = $1 AND status != 'disabled'`,
        [projectId],
      ),
      pgPool.query(
        `SELECT pd.id, pd.project_id, pd.publishing_account_id, pd.destination_type,
                pd.display_name, pd.external_destination_reference, pd.status,
                pd.capabilities_snapshot_json, pd.default_privacy_json,
                pd.created_by, pd.created_at, pd.updated_at,
                pa.display_name AS account_display_name
         FROM aidilam_app.publishing_destinations pd
         JOIN aidilam_app.publishing_accounts pa ON pa.id = pd.publishing_account_id
         WHERE pd.project_id = $1 AND pd.status != 'disabled'
         ORDER BY pd.display_name
         LIMIT $2 OFFSET $3`,
        [projectId, pageSize, offset],
      ),
    ]);

    const total = parseInt(countRes.rows[0].count, 10);
    return {
      data: dataRes.rows,
      meta: { requestId: request.id, page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  });

  // =========================================================================
  // POST /api/v1/projects/:projectId/publishing/destinations
  // Create a publishing destination
  // =========================================================================
  app.post('/api/v1/projects/:projectId/publishing/destinations', {
    schema: {
      tags: ['publishing'],
      description: 'Create a publishing destination for a project',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['publishingAccountId', 'destinationType', 'displayName'],
        properties: {
          publishingAccountId: { type: 'string', format: 'uuid' },
          destinationType: { type: 'string', minLength: 1, maxLength: 100 },
          displayName: { type: 'string', minLength: 1, maxLength: 200 },
          externalDestinationReference: { type: 'string', maxLength: 500 },
          status: { type: 'string', enum: ['draft', 'validation_only', 'disabled'] },
          defaultPrivacy: { type: 'object' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'publishing.destination.manage');

    const body = request.body as {
      publishingAccountId: string;
      destinationType: string;
      displayName: string;
      externalDestinationReference?: string;
      status?: string;
      defaultPrivacy?: Record<string, unknown>;
    };

    const identity = request.identity!;

    // Validate status
    if (body.status && !ALLOWED_DESTINATION_STATUSES.includes(body.status)) {
      throw new AppError('VALIDATION_ERROR', `Invalid status. Allowed: ${ALLOWED_DESTINATION_STATUSES.join(', ')}`);
    }

    // Validate account exists, belongs to project, and is not revoked/error
    const accountResult = await pgPool.query(
      `SELECT id, status FROM aidilam_app.publishing_accounts
       WHERE id = $1 AND project_id = $2`,
      [body.publishingAccountId, projectId],
    );

    if (accountResult.rows.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Publishing account not found or does not belong to project');
    }

    const accountStatus = accountResult.rows[0].status;
    if (accountStatus === 'revoked' || accountStatus === 'error') {
      throw new AppError('VALIDATION_ERROR', 'Publishing account is in revoked or error status');
    }

    const result = await withTransaction(pgPool, async (client) => {
      const insertResult = await client.query(
        `INSERT INTO aidilam_app.publishing_destinations
           (project_id, publishing_account_id, destination_type, display_name,
            external_destination_reference, status, default_privacy_json, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, created_at`,
        [
          projectId, body.publishingAccountId, body.destinationType,
          body.displayName, body.externalDestinationReference ?? null,
          body.status ?? 'draft',
          body.defaultPrivacy ? JSON.stringify(body.defaultPrivacy) : '{}',
          identity.actorId,
        ],
      );

      const destination = insertResult.rows[0];

      await recordAuditEvent({
        requestId: request.id,
        identity,
        action: 'publishing_destination.create',
        resourceType: 'publishing_destination',
        resourceId: destination.id,
        projectId,
        outcome: 'success',
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'],
        newValues: { displayName: body.displayName, destinationType: body.destinationType, publishingAccountId: body.publishingAccountId },
      }, client);

      return destination;
    });

    reply.status(201).send({
      data: {
        id: result.id,
        displayName: body.displayName,
        destinationType: body.destinationType,
        publishingAccountId: body.publishingAccountId,
        status: body.status ?? 'draft',
        createdAt: result.created_at,
      },
      meta: { requestId: request.id },
    });
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/publishing/destinations/:destinationId
  // Get a publishing destination
  // =========================================================================
  app.get('/api/v1/projects/:projectId/publishing/destinations/:destinationId', {
    schema: {
      tags: ['publishing'],
      description: 'Get a publishing destination by ID',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, destinationId } = request.params as { projectId: string; destinationId: string };
    await requireProjectPermission(request, projectId, 'publishing.destination.read');

    const result = await pgPool.query(
      `SELECT pd.id, pd.project_id, pd.publishing_account_id, pd.destination_type,
              pd.display_name, pd.external_destination_reference, pd.status,
              pd.capabilities_snapshot_json, pd.default_privacy_json,
              pd.created_by, pd.created_at, pd.updated_at,
              pa.display_name AS account_display_name
       FROM aidilam_app.publishing_destinations pd
       JOIN aidilam_app.publishing_accounts pa ON pa.id = pd.publishing_account_id
       WHERE pd.id = $1 AND pd.project_id = $2`,
      [destinationId, projectId],
    );

    if (result.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Publishing destination not found');
    }

    return {
      data: result.rows[0],
      meta: { requestId: request.id },
    };
  });

  // =========================================================================
  // PATCH /api/v1/projects/:projectId/publishing/destinations/:destinationId
  // Update a publishing destination
  // =========================================================================
  app.patch('/api/v1/projects/:projectId/publishing/destinations/:destinationId', {
    schema: {
      tags: ['publishing'],
      description: 'Update a publishing destination',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          displayName: { type: 'string', minLength: 1, maxLength: 200 },
          destinationType: { type: 'string', minLength: 1, maxLength: 100 },
          externalDestinationReference: { type: 'string', maxLength: 500 },
          status: { type: 'string', enum: ['draft', 'validation_only', 'disabled'] },
          defaultPrivacy: { type: 'object' },
        },
        additionalProperties: false,
      },
    },
  }, async (request) => {
    const { projectId, destinationId } = request.params as { projectId: string; destinationId: string };
    await requireProjectPermission(request, projectId, 'publishing.destination.manage');

    const body = request.body as {
      displayName?: string;
      destinationType?: string;
      externalDestinationReference?: string;
      status?: string;
      defaultPrivacy?: Record<string, unknown>;
    };

    const identity = request.identity!;

    if (body.status && !ALLOWED_DESTINATION_STATUSES.includes(body.status)) {
      throw new AppError('VALIDATION_ERROR', `Invalid status. Allowed: ${ALLOWED_DESTINATION_STATUSES.join(', ')}`);
    }

    const result = await withTransaction(pgPool, async (client) => {
      const existing = await client.query(
        `SELECT id FROM aidilam_app.publishing_destinations
         WHERE id = $1 AND project_id = $2`,
        [destinationId, projectId],
      );

      if (existing.rows.length === 0) {
        throw new AppError('RESOURCE_NOT_FOUND', 'Publishing destination not found');
      }

      const setClauses: string[] = ['updated_at = now()'];
      const updateParams: unknown[] = [];
      let pIdx = 1;

      if (body.displayName !== undefined) { setClauses.push(`display_name = $${pIdx++}`); updateParams.push(body.displayName); }
      if (body.destinationType !== undefined) { setClauses.push(`destination_type = $${pIdx++}`); updateParams.push(body.destinationType); }
      if (body.externalDestinationReference !== undefined) { setClauses.push(`external_destination_reference = $${pIdx++}`); updateParams.push(body.externalDestinationReference); }
      if (body.status !== undefined) { setClauses.push(`status = $${pIdx++}`); updateParams.push(body.status); }
      if (body.defaultPrivacy !== undefined) { setClauses.push(`default_privacy_json = $${pIdx++}`); updateParams.push(JSON.stringify(body.defaultPrivacy)); }

      updateParams.push(destinationId);
      updateParams.push(projectId);

      const updateResult = await client.query(
        `UPDATE aidilam_app.publishing_destinations
         SET ${setClauses.join(', ')}
         WHERE id = $${pIdx++} AND project_id = $${pIdx++}
         RETURNING id, updated_at`,
        updateParams,
      );

      if (updateResult.rows.length === 0) {
        throw new AppError('RESOURCE_NOT_FOUND', 'Publishing destination not found');
      }

      await recordAuditEvent({
        requestId: request.id,
        identity,
        action: 'publishing_destination.update',
        resourceType: 'publishing_destination',
        resourceId: destinationId,
        projectId,
        outcome: 'success',
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'],
        newValues: { ...body },
      }, client);

      return updateResult.rows[0];
    });

    return {
      data: { id: result.id, updatedAt: result.updated_at },
      meta: { requestId: request.id },
    };
  });

  // =========================================================================
  // DELETE /api/v1/projects/:projectId/publishing/destinations/:destinationId
  // Disable a publishing destination (soft delete)
  // =========================================================================
  app.delete('/api/v1/projects/:projectId/publishing/destinations/:destinationId', {
    schema: {
      tags: ['publishing'],
      description: 'Disable a publishing destination (sets status to disabled)',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, destinationId } = request.params as { projectId: string; destinationId: string };
    await requireProjectPermission(request, projectId, 'publishing.destination.manage');

    const identity = request.identity!;

    const result = await withTransaction(pgPool, async (client) => {
      const existing = await client.query(
        `SELECT id, status FROM aidilam_app.publishing_destinations
         WHERE id = $1 AND project_id = $2`,
        [destinationId, projectId],
      );

      if (existing.rows.length === 0) {
        throw new AppError('RESOURCE_NOT_FOUND', 'Publishing destination not found');
      }

      await client.query(
        `UPDATE aidilam_app.publishing_destinations
         SET status = 'disabled', updated_at = now()
         WHERE id = $1 AND project_id = $2`,
        [destinationId, projectId],
      );

      await recordAuditEvent({
        requestId: request.id,
        identity,
        action: 'publishing_destination.delete',
        resourceType: 'publishing_destination',
        resourceId: destinationId,
        projectId,
        outcome: 'success',
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'],
        previousValues: { status: existing.rows[0].status },
        newValues: { status: 'disabled' },
      }, client);

      return { id: destinationId };
    });

    return {
      data: { id: result.id, status: 'disabled' },
      meta: { requestId: request.id },
    };
  });

  // =========================================================================
  // POST /api/v1/projects/:projectId/publishing/destinations/:destinationId/validate
  // Validate a publishing destination (mock)
  // =========================================================================
  app.post('/api/v1/projects/:projectId/publishing/destinations/:destinationId/validate', {
    schema: {
      tags: ['publishing'],
      description: 'Validate a publishing destination',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, destinationId } = request.params as { projectId: string; destinationId: string };
    await requireProjectPermission(request, projectId, 'publishing.validation.execute');

    const identity = request.identity!;

    const existing = await pgPool.query(
      `SELECT id FROM aidilam_app.publishing_destinations
       WHERE id = $1 AND project_id = $2`,
      [destinationId, projectId],
    );

    if (existing.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Publishing destination not found');
    }

    await recordAuditEvent({
      requestId: request.id,
      identity,
      action: 'publishing_destination.validate',
      resourceType: 'publishing_destination',
      resourceId: destinationId,
      projectId,
      outcome: 'success',
      sourceIp: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return {
      data: { valid: true, validatedAt: new Date().toISOString() },
      meta: { requestId: request.id },
    };
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/publishing/profiles
  // List publishing profiles for a project
  // =========================================================================
  app.get('/api/v1/projects/:projectId/publishing/profiles', {
    schema: {
      tags: ['publishing'],
      description: 'List publishing profiles for a project',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          pageSize: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'publishing.profile.read');

    const query = request.query as { page?: string; pageSize?: string };
    const { page, pageSize } = parsePagination(query);
    const offset = (page - 1) * pageSize;

    const [countRes, dataRes] = await Promise.all([
      pgPool.query(
        `SELECT count(*) FROM aidilam_app.publishing_profiles
         WHERE project_id = $1 AND is_active = true`,
        [projectId],
      ),
      pgPool.query(
        `SELECT pp.id, pp.project_id, pp.name, pp.description, pp.platform_id,
                pp.publishing_account_id, pp.publishing_destination_id,
                pp.caption_template, pp.hashtag_policy_json, pp.thumbnail_policy_json,
                pp.privacy_policy_json, pp.schedule_policy_json, pp.retry_policy_json,
                pp.quota_policy_json, pp.is_validation_only, pp.is_active,
                pp.created_by, pp.created_at, pp.updated_at,
                pl.platform_key, pl.display_name AS platform_display_name,
                pa.display_name AS account_display_name,
                pd.display_name AS destination_display_name
         FROM aidilam_app.publishing_profiles pp
         JOIN aidilam_app.publishing_platforms pl ON pl.id = pp.platform_id
         JOIN aidilam_app.publishing_accounts pa ON pa.id = pp.publishing_account_id
         LEFT JOIN aidilam_app.publishing_destinations pd ON pd.id = pp.publishing_destination_id
         WHERE pp.project_id = $1 AND pp.is_active = true
         ORDER BY pp.name
         LIMIT $2 OFFSET $3`,
        [projectId, pageSize, offset],
      ),
    ]);

    const total = parseInt(countRes.rows[0].count, 10);
    return {
      data: dataRes.rows,
      meta: { requestId: request.id, page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  });

  // =========================================================================
  // POST /api/v1/projects/:projectId/publishing/profiles
  // Create a publishing profile
  // =========================================================================
  app.post('/api/v1/projects/:projectId/publishing/profiles', {
    schema: {
      tags: ['publishing'],
      description: 'Create a publishing profile for a project',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name', 'platformKey', 'publishingAccountId', 'publishingDestinationId'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 200 },
          platformKey: { type: 'string', minLength: 1, maxLength: 100 },
          publishingAccountId: { type: 'string', format: 'uuid' },
          publishingDestinationId: { type: 'string', format: 'uuid' },
          captionTemplate: { type: 'string', maxLength: 2000 },
          hashtagPolicy: { type: 'object' },
          privacyPolicy: { type: 'object' },
          schedulePolicy: { type: 'object' },
          retryPolicy: { type: 'object' },
          quotaPolicy: { type: 'object' },
          isValidationOnly: { type: 'boolean' },
          isActive: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'publishing.profile.manage');

    const body = request.body as {
      name: string;
      platformKey: string;
      publishingAccountId: string;
      publishingDestinationId: string;
      captionTemplate?: string;
      hashtagPolicy?: Record<string, unknown>;
      privacyPolicy?: Record<string, unknown>;
      schedulePolicy?: Record<string, unknown>;
      retryPolicy?: Record<string, unknown>;
      quotaPolicy?: Record<string, unknown>;
      isValidationOnly?: boolean;
      isActive?: boolean;
    };

    const identity = request.identity!;

    // Validate platform exists and is enabled
    const platformResult = await pgPool.query(
      `SELECT id, platform_key FROM aidilam_app.publishing_platforms
       WHERE platform_key = $1 AND is_enabled = true`,
      [body.platformKey],
    );

    if (platformResult.rows.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Platform not found or not enabled');
    }

    const platform = platformResult.rows[0];

    // Validate account belongs to project
    const accountResult = await pgPool.query(
      `SELECT id, platform_id FROM aidilam_app.publishing_accounts
       WHERE id = $1 AND project_id = $2`,
      [body.publishingAccountId, projectId],
    );

    if (accountResult.rows.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Publishing account not found or does not belong to project');
    }

    // Validate platform matches account's platform
    if (accountResult.rows[0].platform_id !== platform.id) {
      throw new AppError('VALIDATION_ERROR', 'Platform does not match the publishing account platform');
    }

    // Validate destination belongs to project AND to the account
    const destinationResult = await pgPool.query(
      `SELECT id, publishing_account_id FROM aidilam_app.publishing_destinations
       WHERE id = $1 AND project_id = $2`,
      [body.publishingDestinationId, projectId],
    );

    if (destinationResult.rows.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Publishing destination not found or does not belong to project');
    }

    if (destinationResult.rows[0].publishing_account_id !== body.publishingAccountId) {
      throw new AppError('VALIDATION_ERROR', 'Publishing destination does not belong to the specified account');
    }

    const result = await withTransaction(pgPool, async (client) => {
      const insertResult = await client.query(
        `INSERT INTO aidilam_app.publishing_profiles
           (project_id, name, platform_id, publishing_account_id,
            publishing_destination_id, caption_template, hashtag_policy_json,
            privacy_policy_json, schedule_policy_json, retry_policy_json,
            quota_policy_json, is_validation_only, is_active, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id, created_at`,
        [
          projectId, body.name, platform.id, body.publishingAccountId,
          body.publishingDestinationId, body.captionTemplate ?? null,
          body.hashtagPolicy ? JSON.stringify(body.hashtagPolicy) : '{}',
          body.privacyPolicy ? JSON.stringify(body.privacyPolicy) : '{}',
          body.schedulePolicy ? JSON.stringify(body.schedulePolicy) : '{}',
          body.retryPolicy ? JSON.stringify(body.retryPolicy) : '{}',
          body.quotaPolicy ? JSON.stringify(body.quotaPolicy) : '{}',
          body.isValidationOnly ?? false, body.isActive ?? true,
          identity.actorId,
        ],
      );

      const profile = insertResult.rows[0];

      await recordAuditEvent({
        requestId: request.id,
        identity,
        action: 'publishing_profile.create',
        resourceType: 'publishing_profile',
        resourceId: profile.id,
        projectId,
        outcome: 'success',
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'],
        newValues: { name: body.name, platformKey: body.platformKey, publishingAccountId: body.publishingAccountId },
      }, client);

      return profile;
    });

    reply.status(201).send({
      data: {
        id: result.id,
        name: body.name,
        platformKey: body.platformKey,
        publishingAccountId: body.publishingAccountId,
        publishingDestinationId: body.publishingDestinationId,
        createdAt: result.created_at,
      },
      meta: { requestId: request.id },
    });
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/publishing/profiles/:profileId
  // Get a publishing profile
  // =========================================================================
  app.get('/api/v1/projects/:projectId/publishing/profiles/:profileId', {
    schema: {
      tags: ['publishing'],
      description: 'Get a publishing profile by ID',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, profileId } = request.params as { projectId: string; profileId: string };
    await requireProjectPermission(request, projectId, 'publishing.profile.read');

    const result = await pgPool.query(
      `SELECT pp.id, pp.project_id, pp.name, pp.description, pp.platform_id,
              pp.publishing_account_id, pp.publishing_destination_id,
              pp.caption_template, pp.hashtag_policy_json, pp.thumbnail_policy_json,
              pp.privacy_policy_json, pp.schedule_policy_json, pp.retry_policy_json,
              pp.quota_policy_json, pp.is_validation_only, pp.is_active,
              pp.created_by, pp.created_at, pp.updated_at,
              pl.platform_key, pl.display_name AS platform_display_name,
              pa.display_name AS account_display_name,
              pd.display_name AS destination_display_name
       FROM aidilam_app.publishing_profiles pp
       JOIN aidilam_app.publishing_platforms pl ON pl.id = pp.platform_id
       JOIN aidilam_app.publishing_accounts pa ON pa.id = pp.publishing_account_id
       LEFT JOIN aidilam_app.publishing_destinations pd ON pd.id = pp.publishing_destination_id
       WHERE pp.id = $1 AND pp.project_id = $2`,
      [profileId, projectId],
    );

    if (result.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Publishing profile not found');
    }

    return {
      data: result.rows[0],
      meta: { requestId: request.id },
    };
  });

  // =========================================================================
  // PATCH /api/v1/projects/:projectId/publishing/profiles/:profileId
  // Update a publishing profile
  // =========================================================================
  app.patch('/api/v1/projects/:projectId/publishing/profiles/:profileId', {
    schema: {
      tags: ['publishing'],
      description: 'Update a publishing profile',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 200 },
          description: { type: 'string', maxLength: 1000 },
          captionTemplate: { type: 'string', maxLength: 2000 },
          hashtagPolicy: { type: 'object' },
          privacyPolicy: { type: 'object' },
          schedulePolicy: { type: 'object' },
          retryPolicy: { type: 'object' },
          quotaPolicy: { type: 'object' },
          isValidationOnly: { type: 'boolean' },
          isActive: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
  }, async (request) => {
    const { projectId, profileId } = request.params as { projectId: string; profileId: string };
    await requireProjectPermission(request, projectId, 'publishing.profile.manage');

    const body = request.body as {
      name?: string;
      description?: string;
      captionTemplate?: string;
      hashtagPolicy?: Record<string, unknown>;
      privacyPolicy?: Record<string, unknown>;
      schedulePolicy?: Record<string, unknown>;
      retryPolicy?: Record<string, unknown>;
      quotaPolicy?: Record<string, unknown>;
      isValidationOnly?: boolean;
      isActive?: boolean;
    };

    const identity = request.identity!;

    const result = await withTransaction(pgPool, async (client) => {
      const existing = await client.query(
        `SELECT id FROM aidilam_app.publishing_profiles
         WHERE id = $1 AND project_id = $2`,
        [profileId, projectId],
      );

      if (existing.rows.length === 0) {
        throw new AppError('RESOURCE_NOT_FOUND', 'Publishing profile not found');
      }

      const setClauses: string[] = ['updated_at = now()'];
      const updateParams: unknown[] = [];
      let pIdx = 1;

      if (body.name !== undefined) { setClauses.push(`name = $${pIdx++}`); updateParams.push(body.name); }
      if (body.description !== undefined) { setClauses.push(`description = $${pIdx++}`); updateParams.push(body.description); }
      if (body.captionTemplate !== undefined) { setClauses.push(`caption_template = $${pIdx++}`); updateParams.push(body.captionTemplate); }
      if (body.hashtagPolicy !== undefined) { setClauses.push(`hashtag_policy_json = $${pIdx++}`); updateParams.push(JSON.stringify(body.hashtagPolicy)); }
      if (body.privacyPolicy !== undefined) { setClauses.push(`privacy_policy_json = $${pIdx++}`); updateParams.push(JSON.stringify(body.privacyPolicy)); }
      if (body.schedulePolicy !== undefined) { setClauses.push(`schedule_policy_json = $${pIdx++}`); updateParams.push(JSON.stringify(body.schedulePolicy)); }
      if (body.retryPolicy !== undefined) { setClauses.push(`retry_policy_json = $${pIdx++}`); updateParams.push(JSON.stringify(body.retryPolicy)); }
      if (body.quotaPolicy !== undefined) { setClauses.push(`quota_policy_json = $${pIdx++}`); updateParams.push(JSON.stringify(body.quotaPolicy)); }
      if (body.isValidationOnly !== undefined) { setClauses.push(`is_validation_only = $${pIdx++}`); updateParams.push(body.isValidationOnly); }
      if (body.isActive !== undefined) { setClauses.push(`is_active = $${pIdx++}`); updateParams.push(body.isActive); }

      updateParams.push(profileId);
      updateParams.push(projectId);

      const updateResult = await client.query(
        `UPDATE aidilam_app.publishing_profiles
         SET ${setClauses.join(', ')}
         WHERE id = $${pIdx++} AND project_id = $${pIdx++}
         RETURNING id, updated_at`,
        updateParams,
      );

      if (updateResult.rows.length === 0) {
        throw new AppError('RESOURCE_NOT_FOUND', 'Publishing profile not found');
      }

      await recordAuditEvent({
        requestId: request.id,
        identity,
        action: 'publishing_profile.update',
        resourceType: 'publishing_profile',
        resourceId: profileId,
        projectId,
        outcome: 'success',
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'],
        newValues: { ...body },
      }, client);

      return updateResult.rows[0];
    });

    return {
      data: { id: result.id, updatedAt: result.updated_at },
      meta: { requestId: request.id },
    };
  });

  // =========================================================================
  // DELETE /api/v1/projects/:projectId/publishing/profiles/:profileId
  // Disable a publishing profile (soft delete)
  // =========================================================================
  app.delete('/api/v1/projects/:projectId/publishing/profiles/:profileId', {
    schema: {
      tags: ['publishing'],
      description: 'Disable a publishing profile (sets is_active to false)',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, profileId } = request.params as { projectId: string; profileId: string };
    await requireProjectPermission(request, projectId, 'publishing.profile.manage');

    const identity = request.identity!;

    const result = await withTransaction(pgPool, async (client) => {
      const existing = await client.query(
        `SELECT id, is_active FROM aidilam_app.publishing_profiles
         WHERE id = $1 AND project_id = $2`,
        [profileId, projectId],
      );

      if (existing.rows.length === 0) {
        throw new AppError('RESOURCE_NOT_FOUND', 'Publishing profile not found');
      }

      await client.query(
        `UPDATE aidilam_app.publishing_profiles
         SET is_active = false, updated_at = now()
         WHERE id = $1 AND project_id = $2`,
        [profileId, projectId],
      );

      await recordAuditEvent({
        requestId: request.id,
        identity,
        action: 'publishing_profile.delete',
        resourceType: 'publishing_profile',
        resourceId: profileId,
        projectId,
        outcome: 'success',
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'],
        previousValues: { isActive: existing.rows[0].is_active },
        newValues: { isActive: false },
      }, client);

      return { id: profileId };
    });

    return {
      data: { id: result.id, isActive: false },
      meta: { requestId: request.id },
    };
  });

  // =========================================================================
  // POST /api/v1/projects/:projectId/publishing/profiles/:profileId/validate
  // Validate a publishing profile (mock)
  // =========================================================================
  app.post('/api/v1/projects/:projectId/publishing/profiles/:profileId/validate', {
    schema: {
      tags: ['publishing'],
      description: 'Validate a publishing profile',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId, profileId } = request.params as { projectId: string; profileId: string };
    await requireProjectPermission(request, projectId, 'publishing.validation.execute');

    const identity = request.identity!;

    const existing = await pgPool.query(
      `SELECT id FROM aidilam_app.publishing_profiles
       WHERE id = $1 AND project_id = $2`,
      [profileId, projectId],
    );

    if (existing.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Publishing profile not found');
    }

    await recordAuditEvent({
      requestId: request.id,
      identity,
      action: 'publishing_profile.validate',
      resourceType: 'publishing_profile',
      resourceId: profileId,
      projectId,
      outcome: 'success',
      sourceIp: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return {
      data: { valid: true, validatedAt: new Date().toISOString() },
      meta: { requestId: request.id },
    };
  });
}
