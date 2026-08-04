import { FastifyInstance } from 'fastify';
import { pgPool } from '../../../infrastructure/database/index.js';
import { AppError } from '../../../core/errors/index.js';
import { withTransaction } from '../../../core/transactions/index.js';
import { parsePagination } from '../../../core/types/index.js';
import { requirePermission, requireProjectPermission } from '../../security/domain/authorization.js';
import { recordAuditEvent } from '../../security/infrastructure/audit-events.js';

export async function projectRoutes(app: FastifyInstance) {
  app.post('/api/v1/projects', {
    schema: {
      tags: ['projects'],
      description: 'Create a new project - requires projects.create',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['code', 'name'],
        properties: {
          code: { type: 'string', minLength: 1, maxLength: 64 },
          name: { type: 'string', minLength: 1, maxLength: 255 },
          description: { type: 'string', maxLength: 2000 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    await requirePermission(request, 'projects.create');

    const { code, name, description } = request.body as { code: string; name: string; description?: string };
    const identity = request.identity!;

    const result = await withTransaction(pgPool, async (client) => {
      const projectRes = await client.query(
        `INSERT INTO aidilam_app.projects (code, name, description) VALUES ($1, $2, $3) RETURNING id, code, name, status, created_at`,
        [code, name, description || null]
      );
      const project = projectRes.rows[0];

      // Record audit event within the same transaction
      await recordAuditEvent({
        requestId: request.id,
        identity,
        action: 'project.create',
        resourceType: 'project',
        resourceId: project.id,
        outcome: 'success',
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'],
        newValues: { code, name, description: description || null },
      }, client);

      return project;
    });

    reply.status(201).send({ data: result, meta: { requestId: request.id } });
  });

  app.get('/api/v1/projects', {
    schema: {
      tags: ['projects'],
      description: 'List projects - requires projects.read',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    await requirePermission(request, 'projects.read');

    const { page, pageSize } = parsePagination(request.query as Record<string, string>);
    const offset = (page - 1) * pageSize;
    const [countRes, dataRes] = await Promise.all([
      pgPool.query('SELECT count(*) FROM aidilam_app.projects'),
      pgPool.query('SELECT id, code, name, status, created_at FROM aidilam_app.projects ORDER BY created_at DESC LIMIT $1 OFFSET $2', [pageSize, offset]),
    ]);
    const total = parseInt(countRes.rows[0].count, 10);
    return { data: dataRes.rows, meta: { requestId: request.id, page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  });

  app.get('/api/v1/projects/:projectId', {
    schema: {
      tags: ['projects'],
      description: 'Get project details - requires projects.read',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'projects.read');

    const result = await pgPool.query('SELECT * FROM aidilam_app.projects WHERE id = $1', [projectId]);
    if (result.rows.length === 0) throw new AppError('RESOURCE_NOT_FOUND', 'Project not found');
    return { data: result.rows[0], meta: { requestId: request.id } };
  });

  app.patch('/api/v1/projects/:projectId', {
    schema: {
      tags: ['projects'],
      description: 'Update project - requires projects.update',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          description: { type: 'string', maxLength: 2000 },
        },
        additionalProperties: false,
      },
    },
  }, async (request) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'projects.update');

    const body = request.body as { name?: string; description?: string };
    const identity = request.identity!;

    // Get current values for audit
    const current = await pgPool.query('SELECT name, description FROM aidilam_app.projects WHERE id = $1', [projectId]);
    if (current.rows.length === 0) throw new AppError('RESOURCE_NOT_FOUND', 'Project not found');

    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (body.name !== undefined) { sets.push(`name = $${idx++}`); values.push(body.name); }
    if (body.description !== undefined) { sets.push(`description = $${idx++}`); values.push(body.description); }

    if (sets.length === 0) throw new AppError('VALIDATION_ERROR', 'No fields to update');

    values.push(projectId);
    const result = await pgPool.query(
      `UPDATE aidilam_app.projects SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    await recordAuditEvent({
      requestId: request.id,
      identity,
      action: 'project.update',
      resourceType: 'project',
      resourceId: projectId,
      projectId,
      outcome: 'success',
      sourceIp: request.ip,
      userAgent: request.headers['user-agent'],
      previousValues: current.rows[0],
      newValues: body,
    });

    return { data: result.rows[0], meta: { requestId: request.id } };
  });

  app.post('/api/v1/projects/:projectId/archive', {
    schema: {
      tags: ['projects'],
      description: 'Archive a project - requires projects.archive',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'projects.archive');

    const identity = request.identity!;
    const result = await pgPool.query(
      `UPDATE aidilam_app.projects SET status = 'archived', archived_at = now() WHERE id = $1 AND status != 'archived' RETURNING *`,
      [projectId]
    );
    if (result.rows.length === 0) throw new AppError('RESOURCE_NOT_FOUND', 'Project not found or already archived');

    await recordAuditEvent({
      requestId: request.id,
      identity,
      action: 'project.archive',
      resourceType: 'project',
      resourceId: projectId,
      projectId,
      outcome: 'success',
      sourceIp: request.ip,
      userAgent: request.headers['user-agent'],
      newValues: { status: 'archived' },
    });

    return { data: result.rows[0], meta: { requestId: request.id } };
  });
}
