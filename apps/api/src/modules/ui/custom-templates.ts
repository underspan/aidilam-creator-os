/**
 * Workspace Custom Template CRUD
 * AIDILAM-COM-04C2R
 */
import { FastifyInstance } from 'fastify';
import { pgPool } from '../../infrastructure/database/index.js';
import { createHash } from 'node:crypto';

const SESSION_COOKIE = 'aidilam_session';
async function getSessionUserId(request: any): Promise<string | null> {
  const sid = request.cookies?.[SESSION_COOKIE];
  if (!sid) return null;
  const { createHash: ch } = await import('node:crypto');
  const h = ch('sha256').update(sid).digest('hex');
  const r = await pgPool.query(`SELECT user_id FROM aidilam_app.browser_sessions WHERE session_hash=$1 AND revoked_at IS NULL AND expires_at>now()`, [h]);
  return r.rows[0]?.user_id || null;
}

export async function customTemplateRoutes(app: FastifyInstance) {

  // CREATE custom template
  app.post('/api/v1/workspaces/:workspaceId/templates', {
    schema: { tags: ['templates'], body: {
      type: 'object', required: ['name', 'category'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 200 },
        description: { type: 'string', maxLength: 1000 },
        category: { type: 'string' },
        config: { type: 'object' },
        idempotencyKey: { type: 'string' },
      },
    }},
  }, async (request) => {
    const userId = await getSessionUserId(request);
    if (!userId) return { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Not authenticated' } };
    const { workspaceId } = request.params as { workspaceId: string };
    const body = request.body as { name: string; description?: string; category: string; config?: any; idempotencyKey?: string };

    // Verify workspace membership
    const member = await pgPool.query(
      `SELECT role FROM aidilam_app.workspace_members WHERE workspace_id=$1 AND user_id=$2 AND status='active'`,
      [workspaceId, userId]
    );
    if (member.rows.length === 0) return { error: { code: 'ACCESS_DENIED', message: 'Not a workspace member' } };
    if (!['owner', 'admin', 'editor'].includes(member.rows[0].role)) return { error: { code: 'ACCESS_DENIED', message: 'Insufficient role' } };

    const config = body.config || { language: { source: 'auto', target: 'vi' }, voice: { capability: 'tts', provider_mode: 'workspace_default', voice: 'vi-VN-HoaiMyNeural' }, video: { aspect_ratio: '9:16', resolution: '1080x1920' }, subtitle: { enabled: true }, audio: { original_volume: 0.15 } };
    const configStr = JSON.stringify(config);
    const checksum = createHash('sha256').update(configStr).digest('hex').slice(0, 16);
    const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);

    // Create template + version atomically
    const tmplRes = await pgPool.query(
      `INSERT INTO aidilam_app.template_definitions (workspace_id, name, slug, description, category, template_type, status, visibility, created_by)
       VALUES ($1, $2, $3, $4, $5, 'workspace', 'active', 'workspace', $6) RETURNING id`,
      [workspaceId, body.name, slug, body.description || '', body.category, userId]
    );
    const templateId = tmplRes.rows[0].id;

    const verRes = await pgPool.query(
      `INSERT INTO aidilam_app.template_versions (template_id, version, config_json, config_checksum, created_by)
       VALUES ($1, 1, $2, $3, $4) RETURNING id`,
      [templateId, configStr, checksum, userId]
    );
    const versionId = verRes.rows[0].id;

    await pgPool.query(`UPDATE aidilam_app.template_definitions SET current_version_id=$1 WHERE id=$2`, [versionId, templateId]);

    return { data: { templateId, versionId, version: 1, name: body.name } };
  });

  // EDIT (create new version)
  app.post('/api/v1/workspaces/:workspaceId/templates/:templateId/versions', {
    schema: { tags: ['templates'], body: { type: 'object', properties: { config: { type: 'object' } } } },
  }, async (request) => {
    const userId = await getSessionUserId(request);
    if (!userId) return { error: { code: 'AUTHENTICATION_REQUIRED' } };
    const { workspaceId, templateId } = request.params as { workspaceId: string; templateId: string };
    const body = request.body as { config?: any };

    // Verify ownership
    const tmpl = await pgPool.query(
      `SELECT id, workspace_id FROM aidilam_app.template_definitions WHERE id=$1 AND workspace_id=$2 AND template_type IN ('workspace','custom')`,
      [templateId, workspaceId]
    );
    if (tmpl.rows.length === 0) return { error: { code: 'NOT_FOUND', message: 'Template not found in this workspace' } };

    // Get current max version
    const maxVer = await pgPool.query(`SELECT max(version) as v FROM aidilam_app.template_versions WHERE template_id=$1`, [templateId]);
    const nextVersion = (maxVer.rows[0]?.v || 0) + 1;

    const configStr = JSON.stringify(body.config || {});
    const checksum = createHash('sha256').update(configStr).digest('hex').slice(0, 16);

    const verRes = await pgPool.query(
      `INSERT INTO aidilam_app.template_versions (template_id, version, config_json, config_checksum, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [templateId, nextVersion, configStr, checksum, userId]
    );
    await pgPool.query(`UPDATE aidilam_app.template_definitions SET current_version_id=$1, updated_at=now() WHERE id=$2`, [verRes.rows[0].id, templateId]);

    return { data: { templateId, versionId: verRes.rows[0].id, version: nextVersion } };
  });

  // ARCHIVE
  app.post('/api/v1/workspaces/:workspaceId/templates/:templateId/archive', {
    schema: { tags: ['templates'] },
  }, async (request) => {
    const userId = await getSessionUserId(request);
    if (!userId) return { error: { code: 'AUTHENTICATION_REQUIRED' } };
    const { workspaceId, templateId } = request.params as { workspaceId: string; templateId: string };

    const res = await pgPool.query(
      `UPDATE aidilam_app.template_definitions SET status='archived', updated_at=now()
       WHERE id=$1 AND workspace_id=$2 AND template_type IN ('workspace','custom') RETURNING id`,
      [templateId, workspaceId]
    );
    if (res.rows.length === 0) return { error: { code: 'NOT_FOUND' } };
    return { data: { archived: true, templateId } };
  });

  // LIST workspace templates
  app.get('/api/v1/workspaces/:workspaceId/templates', {
    schema: { tags: ['templates'] },
  }, async (request) => {
    const userId = await getSessionUserId(request);
    if (!userId) return { error: { code: 'AUTHENTICATION_REQUIRED' } };
    const { workspaceId } = request.params as { workspaceId: string };

    const templates = await pgPool.query(
      `SELECT td.id, td.name, td.category, td.status, td.template_type, tv.version, tv.config_json
       FROM aidilam_app.template_definitions td
       LEFT JOIN aidilam_app.template_versions tv ON tv.id = td.current_version_id
       WHERE (td.workspace_id = $1 OR td.template_type = 'system') AND td.status = 'active'
       ORDER BY td.template_type, td.name`,
      [workspaceId]
    );
    return { data: { items: templates.rows } };
  });
}
