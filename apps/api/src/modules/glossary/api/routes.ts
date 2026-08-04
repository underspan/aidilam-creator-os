/**
 * Glossary Routes — Translation Glossary Management API
 *
 * Provides endpoints for creating, listing, and managing translation glossaries
 * and their entries within a project scope.
 */

import { FastifyInstance } from 'fastify';
import { pgPool } from '../../../infrastructure/database/index.js';
import { AppError } from '../../../core/errors/index.js';
import { parsePagination } from '../../../core/types/index.js';
import { requireProjectPermission } from '../../security/domain/authorization.js';
import { recordAuditEvent } from '../../security/infrastructure/audit-events.js';

export async function glossaryRoutes(app: FastifyInstance) {
  // =========================================================================
  // POST /api/v1/projects/:projectId/translation-glossaries
  // Create a new translation glossary
  // =========================================================================
  app.post('/api/v1/projects/:projectId/translation-glossaries', {
    schema: {
      tags: ['glossary'],
      description: 'Create a new translation glossary',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['code', 'name', 'sourceLanguage', 'targetLanguage'],
        properties: {
          code: { type: 'string', minLength: 1, maxLength: 100, pattern: '^[a-z0-9_-]+$' },
          name: { type: 'string', minLength: 1, maxLength: 200 },
          description: { type: 'string', maxLength: 1000 },
          sourceLanguage: { type: 'string', minLength: 2, maxLength: 10 },
          targetLanguage: { type: 'string', minLength: 2, maxLength: 10 },
          isDefault: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'translations.glossary.create');

    const { code, name, description, sourceLanguage, targetLanguage, isDefault } = request.body as {
      code: string;
      name: string;
      description?: string;
      sourceLanguage: string;
      targetLanguage: string;
      isDefault?: boolean;
    };

    const identity = request.identity!;

    // Check project exists
    const projectResult = await pgPool.query(
      `SELECT id FROM aidilam_app.projects WHERE id = $1`,
      [projectId],
    );
    if (projectResult.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Project not found');
    }

    // Check code uniqueness within project
    const existingResult = await pgPool.query(
      `SELECT id FROM aidilam_app.translation_glossaries
       WHERE project_id = $1 AND code = $2`,
      [projectId, code],
    );
    if (existingResult.rows.length > 0) {
      throw new AppError('CONFLICT', `Glossary code '${code}' already exists in this project`);
    }

    // Insert glossary
    const insertResult = await pgPool.query(
      `INSERT INTO aidilam_app.translation_glossaries
         (project_id, code, name, description, source_language, target_language, is_default, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, code, name, description, source_language, target_language,
                 status, version, is_default, created_by, created_at, updated_at`,
      [projectId, code, name, description || null, sourceLanguage, targetLanguage, isDefault || false, identity.actorId],
    );

    const glossary = insertResult.rows[0];

    await recordAuditEvent({
      requestId: request.id,
      identity,
      action: 'translations.glossary.create',
      resourceType: 'translation_glossary',
      resourceId: glossary.id,
      projectId,
      outcome: 'success',
      sourceIp: request.ip,
      userAgent: request.headers['user-agent'] || '',
      newValues: { code, name, sourceLanguage, targetLanguage },
    });

    return reply.status(201).send({
      id: glossary.id,
      projectId,
      code: glossary.code,
      name: glossary.name,
      description: glossary.description,
      sourceLanguage: glossary.source_language,
      targetLanguage: glossary.target_language,
      status: glossary.status,
      version: glossary.version,
      isDefault: glossary.is_default,
      createdBy: glossary.created_by,
      createdAt: glossary.created_at,
      updatedAt: glossary.updated_at,
    });
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/translation-glossaries
  // List glossaries for a project
  // =========================================================================
  app.get('/api/v1/projects/:projectId/translation-glossaries', {
    schema: {
      tags: ['glossary'],
      description: 'List translation glossaries for a project',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          pageSize: { type: 'string' },
          sourceLanguage: { type: 'string' },
          targetLanguage: { type: 'string' },
          status: { type: 'string', enum: ['draft', 'reviewed', 'approved', 'retired'] },
        },
      },
    },
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'translations.glossary.read');

    const query = request.query as {
      page?: string;
      pageSize?: string;
      sourceLanguage?: string;
      targetLanguage?: string;
      status?: string;
    };

    const pagination = parsePagination(query);
    const limit = pagination.pageSize;
    const offset = (pagination.page - 1) * pagination.pageSize;

    const conditions: string[] = ['project_id = $1'];
    const params: unknown[] = [projectId];
    let paramIdx = 2;

    if (query.sourceLanguage) {
      conditions.push(`source_language = $${paramIdx}`);
      params.push(query.sourceLanguage);
      paramIdx++;
    }
    if (query.targetLanguage) {
      conditions.push(`target_language = $${paramIdx}`);
      params.push(query.targetLanguage);
      paramIdx++;
    }
    if (query.status) {
      conditions.push(`status = $${paramIdx}`);
      params.push(query.status);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await pgPool.query(
      `SELECT count(*)::integer AS total FROM aidilam_app.translation_glossaries WHERE ${whereClause}`,
      params,
    );

    const dataResult = await pgPool.query(
      `SELECT id, code, name, description, source_language, target_language,
              status, version, is_default, created_by, approved_by, created_at, updated_at, approved_at
       FROM aidilam_app.translation_glossaries
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset],
    );

    return reply.send({
      data: dataResult.rows.map((row) => ({
        id: row.id,
        projectId,
        code: row.code,
        name: row.name,
        description: row.description,
        sourceLanguage: row.source_language,
        targetLanguage: row.target_language,
        status: row.status,
        version: row.version,
        isDefault: row.is_default,
        createdBy: row.created_by,
        approvedBy: row.approved_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        approvedAt: row.approved_at,
      })),
      pagination: {
        total: countResult.rows[0].total,
        page: pagination.page,
        pageSize: pagination.pageSize,
      },
    });
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/translation-glossaries/:glossaryId
  // Get glossary detail with entries
  // =========================================================================
  app.get('/api/v1/projects/:projectId/translation-glossaries/:glossaryId', {
    schema: {
      tags: ['glossary'],
      description: 'Get translation glossary detail with entries',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { projectId, glossaryId } = request.params as { projectId: string; glossaryId: string };
    await requireProjectPermission(request, projectId, 'translations.glossary.read');

    const glossaryResult = await pgPool.query(
      `SELECT id, code, name, description, source_language, target_language,
              status, version, is_default, created_by, approved_by, created_at, updated_at, approved_at
       FROM aidilam_app.translation_glossaries
       WHERE id = $1 AND project_id = $2`,
      [glossaryId, projectId],
    );

    if (glossaryResult.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Glossary not found');
    }

    const glossary = glossaryResult.rows[0];

    const entriesResult = await pgPool.query(
      `SELECT id, source_term, target_term, case_sensitive, match_mode, notes, priority, is_active, created_at, updated_at
       FROM aidilam_app.translation_glossary_entries
       WHERE glossary_id = $1
       ORDER BY priority DESC, source_term ASC`,
      [glossaryId],
    );

    return reply.send({
      id: glossary.id,
      projectId,
      code: glossary.code,
      name: glossary.name,
      description: glossary.description,
      sourceLanguage: glossary.source_language,
      targetLanguage: glossary.target_language,
      status: glossary.status,
      version: glossary.version,
      isDefault: glossary.is_default,
      createdBy: glossary.created_by,
      approvedBy: glossary.approved_by,
      createdAt: glossary.created_at,
      updatedAt: glossary.updated_at,
      approvedAt: glossary.approved_at,
      entries: entriesResult.rows.map((row) => ({
        id: row.id,
        sourceTerm: row.source_term,
        targetTerm: row.target_term,
        caseSensitive: row.case_sensitive,
        matchMode: row.match_mode,
        notes: row.notes,
        priority: row.priority,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  });

  // =========================================================================
  // POST /api/v1/projects/:projectId/translation-glossaries/:glossaryId/entries
  // Add entry to glossary
  // =========================================================================
  app.post('/api/v1/projects/:projectId/translation-glossaries/:glossaryId/entries', {
    schema: {
      tags: ['glossary'],
      description: 'Add an entry to a translation glossary',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['sourceTerm', 'targetTerm'],
        properties: {
          sourceTerm: { type: 'string', minLength: 1, maxLength: 500 },
          targetTerm: { type: 'string', minLength: 1, maxLength: 500 },
          caseSensitive: { type: 'boolean' },
          matchMode: { type: 'string', enum: ['exact', 'case_insensitive', 'whole_word', 'phrase'] },
          notes: { type: 'string', maxLength: 1000 },
          priority: { type: 'integer', minimum: 0, maximum: 100 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { projectId, glossaryId } = request.params as { projectId: string; glossaryId: string };
    await requireProjectPermission(request, projectId, 'translations.glossary.edit');

    const { sourceTerm, targetTerm, caseSensitive, matchMode, notes, priority } = request.body as {
      sourceTerm: string;
      targetTerm: string;
      caseSensitive?: boolean;
      matchMode?: string;
      notes?: string;
      priority?: number;
    };

    const identity = request.identity!;

    // Verify glossary exists and belongs to project
    const glossaryResult = await pgPool.query(
      `SELECT id, status FROM aidilam_app.translation_glossaries
       WHERE id = $1 AND project_id = $2`,
      [glossaryId, projectId],
    );

    if (glossaryResult.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Glossary not found');
    }

    const glossary = glossaryResult.rows[0];
    if (glossary.status === 'retired') {
      throw new AppError('CONFLICT', 'Cannot add entries to a retired glossary');
    }

    // Check uniqueness of source term in this glossary
    const existingEntry = await pgPool.query(
      `SELECT id FROM aidilam_app.translation_glossary_entries
       WHERE glossary_id = $1 AND source_term = $2`,
      [glossaryId, sourceTerm],
    );

    if (existingEntry.rows.length > 0) {
      throw new AppError('CONFLICT', `Source term '${sourceTerm}' already exists in this glossary`);
    }

    const insertResult = await pgPool.query(
      `INSERT INTO aidilam_app.translation_glossary_entries
         (glossary_id, source_term, target_term, case_sensitive, match_mode, notes, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, source_term, target_term, case_sensitive, match_mode, notes, priority, is_active, created_at, updated_at`,
      [glossaryId, sourceTerm, targetTerm, caseSensitive || false, matchMode || 'exact', notes || null, priority || 0],
    );

    const entry = insertResult.rows[0];

    // Bump glossary version and updated_at
    await pgPool.query(
      `UPDATE aidilam_app.translation_glossaries
       SET version = version + 1, updated_at = now()
       WHERE id = $1`,
      [glossaryId],
    );

    await recordAuditEvent({
      requestId: request.id,
      identity,
      action: 'translations.glossary.entry.create',
      resourceType: 'translation_glossary_entry',
      resourceId: entry.id,
      projectId,
      outcome: 'success',
      sourceIp: request.ip,
      userAgent: request.headers['user-agent'] || '',
      newValues: { glossaryId, sourceTerm, targetTerm },
    });

    return reply.status(201).send({
      id: entry.id,
      glossaryId,
      sourceTerm: entry.source_term,
      targetTerm: entry.target_term,
      caseSensitive: entry.case_sensitive,
      matchMode: entry.match_mode,
      notes: entry.notes,
      priority: entry.priority,
      isActive: entry.is_active,
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
    });
  });

  // =========================================================================
  // POST /api/v1/projects/:projectId/translation-glossaries/:glossaryId/approve
  // Approve a glossary
  // =========================================================================
  app.post('/api/v1/projects/:projectId/translation-glossaries/:glossaryId/approve', {
    schema: {
      tags: ['glossary'],
      description: 'Approve a translation glossary',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { projectId, glossaryId } = request.params as { projectId: string; glossaryId: string };
    await requireProjectPermission(request, projectId, 'translations.glossary.approve');

    const identity = request.identity!;

    // Verify glossary exists
    const glossaryResult = await pgPool.query(
      `SELECT id, status, code, name FROM aidilam_app.translation_glossaries
       WHERE id = $1 AND project_id = $2`,
      [glossaryId, projectId],
    );

    if (glossaryResult.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Glossary not found');
    }

    const glossary = glossaryResult.rows[0];
    if (glossary.status === 'approved') {
      throw new AppError('CONFLICT', 'Glossary is already approved');
    }
    if (glossary.status === 'retired') {
      throw new AppError('CONFLICT', 'Cannot approve a retired glossary');
    }

    // Transition to approved
    await pgPool.query(
      `UPDATE aidilam_app.translation_glossaries
       SET status = 'approved', approved_by = $2, approved_at = now(), updated_at = now()
       WHERE id = $1`,
      [glossaryId, identity.actorId],
    );

    await recordAuditEvent({
      requestId: request.id,
      identity,
      action: 'translations.glossary.approve',
      resourceType: 'translation_glossary',
      resourceId: glossaryId,
      projectId,
      outcome: 'success',
      sourceIp: request.ip,
      userAgent: request.headers['user-agent'] || '',
      previousValues: { status: glossary.status },
      newValues: { status: 'approved' },
    });

    return reply.send({
      id: glossaryId,
      status: 'approved',
      approvedBy: identity.actorId,
      approvedAt: new Date().toISOString(),
    });
  });
}
