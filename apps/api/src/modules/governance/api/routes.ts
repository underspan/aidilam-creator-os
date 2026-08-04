/**
 * Governance Routes — Translation Quality, Reviews, Usage, and Budget APIs
 *
 * Provides endpoints for viewing quality results, managing review lifecycle,
 * tracking usage, and configuring translation budgets within a project scope.
 */

import { FastifyInstance } from 'fastify';
import { pgPool } from '../../../infrastructure/database/index.js';
import { AppError } from '../../../core/errors/index.js';
import { parsePagination } from '../../../core/types/index.js';
import { requireProjectPermission } from '../../security/domain/authorization.js';
import { recordAuditEvent } from '../../security/infrastructure/audit-events.js';

export async function governanceRoutes(app: FastifyInstance) {
  // =========================================================================
  // QUALITY RESULTS
  // =========================================================================

  // GET /api/v1/projects/:projectId/translation-quality-results
  app.get('/api/v1/projects/:projectId/translation-quality-results', {
    schema: {
      tags: ['governance'],
      description: 'List translation quality results for a project',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          pageSize: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'passed', 'warning', 'failed', 'manual_review_required'] },
        },
      },
    },
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'translations.quality.read');

    const query = request.query as { page?: string; pageSize?: string; status?: string };
    const pagination = parsePagination(query);
    const limit = pagination.pageSize;
    const offset = (pagination.page - 1) * pagination.pageSize;

    const conditions: string[] = ['tr.project_id = $1'];
    const params: unknown[] = [projectId];
    let paramIdx = 2;

    if (query.status) {
      conditions.push(`qr.status = $${paramIdx}`);
      params.push(query.status);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await pgPool.query(
      `SELECT count(*)::integer AS total
       FROM aidilam_app.translation_quality_results qr
       JOIN aidilam_app.translation_runs tr ON tr.id = qr.translation_run_id
       WHERE ${whereClause}`,
      params,
    );

    const dataResult = await pgPool.query(
      `SELECT qr.id, qr.translation_run_id, qr.status, qr.cue_alignment_score,
              qr.empty_translation_count, qr.source_copy_count, qr.glossary_violations,
              qr.timing_violations, qr.length_ratio_warnings, qr.details_json,
              qr.created_at, qr.updated_at
       FROM aidilam_app.translation_quality_results qr
       JOIN aidilam_app.translation_runs tr ON tr.id = qr.translation_run_id
       WHERE ${whereClause}
       ORDER BY qr.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset],
    );

    return reply.send({
      data: dataResult.rows.map((row) => ({
        id: row.id,
        translationRunId: row.translation_run_id,
        status: row.status,
        cueAlignmentScore: row.cue_alignment_score,
        emptyTranslationCount: row.empty_translation_count,
        sourceCopyCount: row.source_copy_count,
        glossaryViolations: row.glossary_violations,
        timingViolations: row.timing_violations,
        lengthRatioWarnings: row.length_ratio_warnings,
        detailsJson: row.details_json,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      pagination: {
        total: countResult.rows[0].total,
        page: pagination.page,
        pageSize: pagination.pageSize,
      },
    });
  });

  // GET /api/v1/projects/:projectId/translation-quality-results/:qualityResultId
  app.get('/api/v1/projects/:projectId/translation-quality-results/:qualityResultId', {
    schema: {
      tags: ['governance'],
      description: 'Get a specific translation quality result',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { projectId, qualityResultId } = request.params as { projectId: string; qualityResultId: string };
    await requireProjectPermission(request, projectId, 'translations.quality.read');

    const result = await pgPool.query(
      `SELECT qr.id, qr.translation_run_id, qr.status, qr.cue_alignment_score,
              qr.empty_translation_count, qr.source_copy_count, qr.glossary_violations,
              qr.timing_violations, qr.length_ratio_warnings, qr.details_json,
              qr.created_at, qr.updated_at
       FROM aidilam_app.translation_quality_results qr
       JOIN aidilam_app.translation_runs tr ON tr.id = qr.translation_run_id
       WHERE qr.id = $1 AND tr.project_id = $2`,
      [qualityResultId, projectId],
    );

    if (result.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Quality result not found');
    }

    const row = result.rows[0];
    return reply.send({
      id: row.id,
      translationRunId: row.translation_run_id,
      status: row.status,
      cueAlignmentScore: row.cue_alignment_score,
      emptyTranslationCount: row.empty_translation_count,
      sourceCopyCount: row.source_copy_count,
      glossaryViolations: row.glossary_violations,
      timingViolations: row.timing_violations,
      lengthRatioWarnings: row.length_ratio_warnings,
      detailsJson: row.details_json,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  });

  // =========================================================================
  // REVIEW LIFECYCLE
  // =========================================================================

  // GET /api/v1/projects/:projectId/translation-reviews
  app.get('/api/v1/projects/:projectId/translation-reviews', {
    schema: {
      tags: ['governance'],
      description: 'List translation review assignments for a project',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          pageSize: { type: 'string' },
          status: { type: 'string', enum: ['unassigned', 'assigned', 'in_review', 'changes_requested', 'approved', 'rejected'] },
        },
      },
    },
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'translations.review.read');

    const query = request.query as { page?: string; pageSize?: string; status?: string };
    const pagination = parsePagination(query);
    const limit = pagination.pageSize;
    const offset = (pagination.page - 1) * pagination.pageSize;

    const conditions: string[] = ['project_id = $1'];
    const params: unknown[] = [projectId];
    let paramIdx = 2;

    if (query.status) {
      conditions.push(`status = $${paramIdx}`);
      params.push(query.status);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await pgPool.query(
      `SELECT count(*)::integer AS total
       FROM aidilam_app.translation_review_assignments
       WHERE ${whereClause}`,
      params,
    );

    const dataResult = await pgPool.query(
      `SELECT id, project_id, subtitle_version_id, translation_run_id,
              assigned_to, status, priority, due_at, created_by, created_at, updated_at
       FROM aidilam_app.translation_review_assignments
       WHERE ${whereClause}
       ORDER BY priority DESC, created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset],
    );

    return reply.send({
      data: dataResult.rows.map((row) => ({
        id: row.id,
        projectId: row.project_id,
        subtitleVersionId: row.subtitle_version_id,
        translationRunId: row.translation_run_id,
        assignedTo: row.assigned_to,
        status: row.status,
        priority: row.priority,
        dueAt: row.due_at,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      pagination: {
        total: countResult.rows[0].total,
        page: pagination.page,
        pageSize: pagination.pageSize,
      },
    });
  });

  // GET /api/v1/projects/:projectId/translation-reviews/:reviewId
  app.get('/api/v1/projects/:projectId/translation-reviews/:reviewId', {
    schema: {
      tags: ['governance'],
      description: 'Get a specific translation review assignment',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { projectId, reviewId } = request.params as { projectId: string; reviewId: string };
    await requireProjectPermission(request, projectId, 'translations.review.read');

    const result = await pgPool.query(
      `SELECT id, project_id, subtitle_version_id, translation_run_id,
              assigned_to, status, priority, due_at, created_by, created_at, updated_at
       FROM aidilam_app.translation_review_assignments
       WHERE id = $1 AND project_id = $2`,
      [reviewId, projectId],
    );

    if (result.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Review assignment not found');
    }

    const row = result.rows[0];
    return reply.send({
      id: row.id,
      projectId: row.project_id,
      subtitleVersionId: row.subtitle_version_id,
      translationRunId: row.translation_run_id,
      assignedTo: row.assigned_to,
      status: row.status,
      priority: row.priority,
      dueAt: row.due_at,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  });

  // POST /api/v1/projects/:projectId/translation-reviews/:reviewId/start
  app.post('/api/v1/projects/:projectId/translation-reviews/:reviewId/start', {
    schema: {
      tags: ['governance'],
      description: 'Start a translation review (assigned → in_review)',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { projectId, reviewId } = request.params as { projectId: string; reviewId: string };
    await requireProjectPermission(request, projectId, 'translations.review.read');

    const identity = request.identity!;

    const result = await pgPool.query(
      `UPDATE aidilam_app.translation_review_assignments
       SET status = 'in_review', updated_at = now()
       WHERE id = $1 AND project_id = $2 AND status = 'assigned'
       RETURNING id, status, updated_at`,
      [reviewId, projectId],
    );

    if (result.rows.length === 0) {
      // Check if the review exists at all
      const existsResult = await pgPool.query(
        `SELECT id, status FROM aidilam_app.translation_review_assignments
         WHERE id = $1 AND project_id = $2`,
        [reviewId, projectId],
      );
      if (existsResult.rows.length === 0) {
        throw new AppError('RESOURCE_NOT_FOUND', 'Review assignment not found');
      }
      throw new AppError('CONFLICT', `Cannot start review: current status is '${existsResult.rows[0].status}'`);
    }

    await recordAuditEvent({
      requestId: request.id,
      identity,
      action: 'translations.review.start',
      resourceType: 'translation_review_assignment',
      resourceId: reviewId,
      projectId,
      outcome: 'success',
      sourceIp: request.ip,
      userAgent: request.headers['user-agent'] || '',
      previousValues: { status: 'assigned' },
      newValues: { status: 'in_review' },
    });

    return reply.send({
      id: result.rows[0].id,
      status: result.rows[0].status,
      updatedAt: result.rows[0].updated_at,
    });
  });

  // POST /api/v1/projects/:projectId/translation-reviews/:reviewId/request-changes
  app.post('/api/v1/projects/:projectId/translation-reviews/:reviewId/request-changes', {
    schema: {
      tags: ['governance'],
      description: 'Request changes on a translation review (in_review → changes_requested)',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['comment'],
        properties: {
          comment: { type: 'string', minLength: 1, maxLength: 5000 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { projectId, reviewId } = request.params as { projectId: string; reviewId: string };
    await requireProjectPermission(request, projectId, 'translations.review.read');

    const { comment } = request.body as { comment: string };
    const identity = request.identity!;

    // First get current state to read existing details_json
    const current = await pgPool.query(
      `SELECT id, status, details_json
       FROM aidilam_app.translation_review_assignments
       WHERE id = $1 AND project_id = $2`,
      [reviewId, projectId],
    );

    if (current.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Review assignment not found');
    }

    if (current.rows[0].status !== 'in_review') {
      throw new AppError('CONFLICT', `Cannot request changes: current status is '${current.rows[0].status}'`);
    }

    const existingDetails = current.rows[0].details_json || {};
    const updatedDetails = {
      ...existingDetails,
      changesRequested: [
        ...(existingDetails.changesRequested || []),
        { comment, requestedBy: identity.actorId, requestedAt: new Date().toISOString() },
      ],
    };

    const result = await pgPool.query(
      `UPDATE aidilam_app.translation_review_assignments
       SET status = 'changes_requested', details_json = $3, updated_at = now()
       WHERE id = $1 AND project_id = $2
       RETURNING id, status, updated_at`,
      [reviewId, projectId, JSON.stringify(updatedDetails)],
    );

    await recordAuditEvent({
      requestId: request.id,
      identity,
      action: 'translations.review.request_changes',
      resourceType: 'translation_review_assignment',
      resourceId: reviewId,
      projectId,
      outcome: 'success',
      sourceIp: request.ip,
      userAgent: request.headers['user-agent'] || '',
      previousValues: { status: 'in_review' },
      newValues: { status: 'changes_requested', comment },
    });

    return reply.send({
      id: result.rows[0].id,
      status: result.rows[0].status,
      updatedAt: result.rows[0].updated_at,
    });
  });

  // POST /api/v1/projects/:projectId/translation-reviews/:reviewId/approve
  app.post('/api/v1/projects/:projectId/translation-reviews/:reviewId/approve', {
    schema: {
      tags: ['governance'],
      description: 'Approve a translation review',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { projectId, reviewId } = request.params as { projectId: string; reviewId: string };
    await requireProjectPermission(request, projectId, 'translations.review.read');

    const identity = request.identity!;

    const result = await pgPool.query(
      `UPDATE aidilam_app.translation_review_assignments
       SET status = 'approved', updated_at = now()
       WHERE id = $1 AND project_id = $2 AND status IN ('in_review', 'changes_requested')
       RETURNING id, status, updated_at`,
      [reviewId, projectId],
    );

    if (result.rows.length === 0) {
      const existsResult = await pgPool.query(
        `SELECT id, status FROM aidilam_app.translation_review_assignments
         WHERE id = $1 AND project_id = $2`,
        [reviewId, projectId],
      );
      if (existsResult.rows.length === 0) {
        throw new AppError('RESOURCE_NOT_FOUND', 'Review assignment not found');
      }
      throw new AppError('CONFLICT', `Cannot approve review: current status is '${existsResult.rows[0].status}'`);
    }

    await recordAuditEvent({
      requestId: request.id,
      identity,
      action: 'translations.review.approve',
      resourceType: 'translation_review_assignment',
      resourceId: reviewId,
      projectId,
      outcome: 'success',
      sourceIp: request.ip,
      userAgent: request.headers['user-agent'] || '',
      newValues: { status: 'approved' },
    });

    return reply.send({
      id: result.rows[0].id,
      status: result.rows[0].status,
      updatedAt: result.rows[0].updated_at,
    });
  });

  // POST /api/v1/projects/:projectId/translation-reviews/:reviewId/reject
  app.post('/api/v1/projects/:projectId/translation-reviews/:reviewId/reject', {
    schema: {
      tags: ['governance'],
      description: 'Reject a translation review',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { projectId, reviewId } = request.params as { projectId: string; reviewId: string };
    await requireProjectPermission(request, projectId, 'translations.review.read');

    const identity = request.identity!;

    const result = await pgPool.query(
      `UPDATE aidilam_app.translation_review_assignments
       SET status = 'rejected', updated_at = now()
       WHERE id = $1 AND project_id = $2 AND status IN ('in_review', 'changes_requested')
       RETURNING id, status, updated_at`,
      [reviewId, projectId],
    );

    if (result.rows.length === 0) {
      const existsResult = await pgPool.query(
        `SELECT id, status FROM aidilam_app.translation_review_assignments
         WHERE id = $1 AND project_id = $2`,
        [reviewId, projectId],
      );
      if (existsResult.rows.length === 0) {
        throw new AppError('RESOURCE_NOT_FOUND', 'Review assignment not found');
      }
      throw new AppError('CONFLICT', `Cannot reject review: current status is '${existsResult.rows[0].status}'`);
    }

    await recordAuditEvent({
      requestId: request.id,
      identity,
      action: 'translations.review.reject',
      resourceType: 'translation_review_assignment',
      resourceId: reviewId,
      projectId,
      outcome: 'success',
      sourceIp: request.ip,
      userAgent: request.headers['user-agent'] || '',
      newValues: { status: 'rejected' },
    });

    return reply.send({
      id: result.rows[0].id,
      status: result.rows[0].status,
      updatedAt: result.rows[0].updated_at,
    });
  });

  // =========================================================================
  // USAGE
  // =========================================================================

  // GET /api/v1/projects/:projectId/translation-usage
  app.get('/api/v1/projects/:projectId/translation-usage', {
    schema: {
      tags: ['governance'],
      description: 'List translation usage records for a project',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          pageSize: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'translations.usage.read');

    const query = request.query as { page?: string; pageSize?: string };
    const pagination = parsePagination(query);
    const limit = pagination.pageSize;
    const offset = (pagination.page - 1) * pagination.pageSize;

    const countResult = await pgPool.query(
      `SELECT count(*)::integer AS total
       FROM aidilam_app.translation_usage_records
       WHERE project_id = $1`,
      [projectId],
    );

    const dataResult = await pgPool.query(
      `SELECT id, project_id, translation_run_id, provider_code, model_code,
              input_units, output_units, estimated_cost, actual_cost,
              currency, request_count, retry_count, created_at
       FROM aidilam_app.translation_usage_records
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [projectId, limit, offset],
    );

    return reply.send({
      data: dataResult.rows.map((row) => ({
        id: row.id,
        projectId: row.project_id,
        translationRunId: row.translation_run_id,
        providerCode: row.provider_code,
        modelCode: row.model_code,
        inputUnits: row.input_units,
        outputUnits: row.output_units,
        estimatedCost: row.estimated_cost,
        actualCost: row.actual_cost,
        currency: row.currency,
        requestCount: row.request_count,
        retryCount: row.retry_count,
        createdAt: row.created_at,
      })),
      pagination: {
        total: countResult.rows[0].total,
        page: pagination.page,
        pageSize: pagination.pageSize,
      },
    });
  });

  // GET /api/v1/projects/:projectId/translation-usage/:usageId
  app.get('/api/v1/projects/:projectId/translation-usage/:usageId', {
    schema: {
      tags: ['governance'],
      description: 'Get a specific translation usage record',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { projectId, usageId } = request.params as { projectId: string; usageId: string };
    await requireProjectPermission(request, projectId, 'translations.usage.read');

    const result = await pgPool.query(
      `SELECT id, project_id, translation_run_id, provider_code, model_code,
              input_units, output_units, estimated_cost, actual_cost,
              currency, request_count, retry_count, created_at
       FROM aidilam_app.translation_usage_records
       WHERE id = $1 AND project_id = $2`,
      [usageId, projectId],
    );

    if (result.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Usage record not found');
    }

    const row = result.rows[0];
    return reply.send({
      id: row.id,
      projectId: row.project_id,
      translationRunId: row.translation_run_id,
      providerCode: row.provider_code,
      modelCode: row.model_code,
      inputUnits: row.input_units,
      outputUnits: row.output_units,
      estimatedCost: row.estimated_cost,
      actualCost: row.actual_cost,
      currency: row.currency,
      requestCount: row.request_count,
      retryCount: row.retry_count,
      createdAt: row.created_at,
    });
  });

  // GET /api/v1/projects/:projectId/translation-usage/summary
  app.get('/api/v1/projects/:projectId/translation-usage/summary', {
    schema: {
      tags: ['governance'],
      description: 'Get daily and monthly usage spend summary',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'translations.usage.read');

    const dailyResult = await pgPool.query(
      `SELECT date_trunc('day', created_at)::date AS day,
              SUM(estimated_cost)::numeric AS total_cost,
              SUM(input_units)::integer AS total_input_units,
              SUM(output_units)::integer AS total_output_units,
              SUM(request_count)::integer AS total_requests
       FROM aidilam_app.translation_usage_records
       WHERE project_id = $1
         AND created_at >= date_trunc('month', now())
       GROUP BY date_trunc('day', created_at)
       ORDER BY day DESC`,
      [projectId],
    );

    const monthlyResult = await pgPool.query(
      `SELECT date_trunc('month', created_at)::date AS month,
              SUM(estimated_cost)::numeric AS total_cost,
              SUM(input_units)::integer AS total_input_units,
              SUM(output_units)::integer AS total_output_units,
              SUM(request_count)::integer AS total_requests
       FROM aidilam_app.translation_usage_records
       WHERE project_id = $1
         AND created_at >= (now() - interval '6 months')
       GROUP BY date_trunc('month', created_at)
       ORDER BY month DESC`,
      [projectId],
    );

    return reply.send({
      daily: dailyResult.rows.map((row) => ({
        day: row.day,
        totalCost: row.total_cost,
        totalInputUnits: row.total_input_units,
        totalOutputUnits: row.total_output_units,
        totalRequests: row.total_requests,
      })),
      monthly: monthlyResult.rows.map((row) => ({
        month: row.month,
        totalCost: row.total_cost,
        totalInputUnits: row.total_input_units,
        totalOutputUnits: row.total_output_units,
        totalRequests: row.total_requests,
      })),
    });
  });

  // =========================================================================
  // BUDGET
  // =========================================================================

  // GET /api/v1/projects/:projectId/translation-budget
  app.get('/api/v1/projects/:projectId/translation-budget', {
    schema: {
      tags: ['governance'],
      description: 'Get current translation budget and spend for a project',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'translations.budget.read');

    const budgetResult = await pgPool.query(
      `SELECT id, project_id, currency, per_run_limit, daily_limit, monthly_limit,
              is_active, version, created_by, updated_by, created_at, updated_at
       FROM aidilam_app.translation_budgets
       WHERE project_id = $1`,
      [projectId],
    );

    // Daily spend: sum of today's committed/reserved reservations
    const dailySpendResult = await pgPool.query(
      `SELECT COALESCE(SUM(COALESCE(committed_amount, estimated_amount)), 0)::numeric AS daily_spend
       FROM aidilam_app.translation_budget_reservations
       WHERE project_id = $1
         AND status IN ('reserved', 'committed')
         AND created_at >= date_trunc('day', now())`,
      [projectId],
    );

    // Monthly spend: sum of this month's committed/reserved reservations
    const monthlySpendResult = await pgPool.query(
      `SELECT COALESCE(SUM(COALESCE(committed_amount, estimated_amount)), 0)::numeric AS monthly_spend
       FROM aidilam_app.translation_budget_reservations
       WHERE project_id = $1
         AND status IN ('reserved', 'committed')
         AND created_at >= date_trunc('month', now())`,
      [projectId],
    );

    const dailySpend = dailySpendResult.rows[0].daily_spend;
    const monthlySpend = monthlySpendResult.rows[0].monthly_spend;

    if (budgetResult.rows.length === 0) {
      // No budget configured — return defaults (no limits)
      return reply.send({
        projectId,
        currency: 'USD',
        perRunLimit: null,
        dailyLimit: null,
        monthlyLimit: null,
        isActive: true,
        version: 0,
        dailySpend,
        monthlySpend,
        createdAt: null,
        updatedAt: null,
      });
    }

    const row = budgetResult.rows[0];
    return reply.send({
      id: row.id,
      projectId: row.project_id,
      currency: row.currency,
      perRunLimit: row.per_run_limit,
      dailyLimit: row.daily_limit,
      monthlyLimit: row.monthly_limit,
      isActive: row.is_active,
      version: row.version,
      dailySpend,
      monthlySpend,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  });

  // PUT /api/v1/projects/:projectId/translation-budget
  app.put('/api/v1/projects/:projectId/translation-budget', {
    schema: {
      tags: ['governance'],
      description: 'Update translation budget limits with optimistic concurrency',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['version'],
        properties: {
          currency: { type: 'string', minLength: 3, maxLength: 3 },
          perRunLimit: { type: ['number', 'null'] },
          dailyLimit: { type: ['number', 'null'] },
          monthlyLimit: { type: ['number', 'null'] },
          isActive: { type: 'boolean' },
          version: { type: 'integer', minimum: 0 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'translations.budget.manage');

    const body = request.body as {
      currency?: string;
      perRunLimit?: number | null;
      dailyLimit?: number | null;
      monthlyLimit?: number | null;
      isActive?: boolean;
      version: number;
    };

    const identity = request.identity!;

    // Verify project exists
    const projectResult = await pgPool.query(
      `SELECT id FROM aidilam_app.projects WHERE id = $1`,
      [projectId],
    );
    if (projectResult.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Project not found');
    }

    // Upsert with optimistic concurrency via version check
    const result = await pgPool.query(
      `INSERT INTO aidilam_app.translation_budgets
         (project_id, currency, per_run_limit, daily_limit, monthly_limit, is_active, version, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $7)
       ON CONFLICT (project_id) DO UPDATE SET
         currency = COALESCE($2, aidilam_app.translation_budgets.currency),
         per_run_limit = $3,
         daily_limit = $4,
         monthly_limit = $5,
         is_active = COALESCE($6, aidilam_app.translation_budgets.is_active),
         version = aidilam_app.translation_budgets.version + 1,
         updated_by = $7,
         updated_at = now()
       WHERE aidilam_app.translation_budgets.version = $8
       RETURNING id, project_id, currency, per_run_limit, daily_limit, monthly_limit,
                 is_active, version, created_by, updated_by, created_at, updated_at`,
      [
        projectId,
        body.currency || 'USD',
        body.perRunLimit ?? null,
        body.dailyLimit ?? null,
        body.monthlyLimit ?? null,
        body.isActive ?? true,
        identity.actorId,
        body.version,
      ],
    );

    if (result.rows.length === 0) {
      throw new AppError('CONFLICT', 'Budget version conflict — reload and retry');
    }

    const row = result.rows[0];

    await recordAuditEvent({
      requestId: request.id,
      identity,
      action: 'translations.budget.update',
      resourceType: 'translation_budget',
      resourceId: row.id,
      projectId,
      outcome: 'success',
      sourceIp: request.ip,
      userAgent: request.headers['user-agent'] || '',
      newValues: {
        perRunLimit: body.perRunLimit,
        dailyLimit: body.dailyLimit,
        monthlyLimit: body.monthlyLimit,
        isActive: body.isActive,
      },
    });

    return reply.send({
      id: row.id,
      projectId: row.project_id,
      currency: row.currency,
      perRunLimit: row.per_run_limit,
      dailyLimit: row.daily_limit,
      monthlyLimit: row.monthly_limit,
      isActive: row.is_active,
      version: row.version,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  });
}
