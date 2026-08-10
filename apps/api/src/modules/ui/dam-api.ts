/**
 * Digital Asset Management API
 * AIDILAM-COM-04D
 */
import { FastifyInstance } from 'fastify';
import { pgPool } from '../../infrastructure/database/index.js';
import { config } from '../../config/index.js';

const SESSION_COOKIE = 'aidilam_session';
async function getUserId(request: any): Promise<string | null> {
  const sid = request.cookies?.[SESSION_COOKIE];
  if (!sid) return null;
  const { createHash } = await import('node:crypto');
  const h = createHash('sha256').update(sid).digest('hex');
  const r = await pgPool.query(`SELECT user_id FROM aidilam_app.browser_sessions WHERE session_hash=$1 AND revoked_at IS NULL AND expires_at>now()`, [h]);
  return r.rows[0]?.user_id || null;
}

export async function damRoutes(app: FastifyInstance) {

  // === COLLECTIONS ===
  app.post('/api/v1/workspaces/:workspaceId/collections', { schema: { tags: ['dam'] } }, async (req) => {
    const userId = await getUserId(req);
    if (!userId) return { error: { code: 'AUTH_REQUIRED' } };
    const { workspaceId } = req.params as { workspaceId: string };
    const { name, description } = req.body as { name: string; description?: string };
    const res = await pgPool.query(
      `INSERT INTO aidilam_app.asset_collections (workspace_id, name, description, created_by) VALUES ($1, $2, $3, $4) RETURNING id, name`,
      [workspaceId, name, description || '', userId]
    );
    return { data: res.rows[0] };
  });

  app.get('/api/v1/workspaces/:workspaceId/collections', { schema: { tags: ['dam'] } }, async (req) => {
    if (!await getUserId(req)) return { error: { code: 'AUTH_REQUIRED' } };
    const { workspaceId } = req.params as { workspaceId: string };
    const res = await pgPool.query(
      `SELECT ac.id, ac.name, ac.status, (SELECT count(*) FROM aidilam_app.asset_collection_items aci WHERE aci.collection_id=ac.id)::int as item_count
       FROM aidilam_app.asset_collections ac WHERE ac.workspace_id=$1 AND ac.status='active' ORDER BY ac.name`, [workspaceId]
    );
    return { data: { items: res.rows } };
  });

  app.post('/api/v1/workspaces/:workspaceId/collections/:collectionId/items', { schema: { tags: ['dam'] } }, async (req) => {
    const userId = await getUserId(req);
    if (!userId) return { error: { code: 'AUTH_REQUIRED' } };
    const { workspaceId, collectionId } = req.params as { workspaceId: string; collectionId: string };
    const { assetId } = req.body as { assetId: string };
    // Verify collection belongs to workspace
    const col = await pgPool.query(`SELECT id FROM aidilam_app.asset_collections WHERE id=$1 AND workspace_id=$2`, [collectionId, workspaceId]);
    if (col.rows.length === 0) return { error: { code: 'NOT_FOUND' } };
    await pgPool.query(
      `INSERT INTO aidilam_app.asset_collection_items (collection_id, asset_id, added_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [collectionId, assetId, userId]
    );
    return { data: { added: true } };
  });

  // === TAGS ===
  app.post('/api/v1/workspaces/:workspaceId/tags', { schema: { tags: ['dam'] } }, async (req) => {
    const userId = await getUserId(req);
    if (!userId) return { error: { code: 'AUTH_REQUIRED' } };
    const { workspaceId } = req.params as { workspaceId: string };
    const { name, color } = req.body as { name: string; color?: string };
    const res = await pgPool.query(
      `INSERT INTO aidilam_app.asset_tags (workspace_id, name, color) VALUES ($1, $2, $3) ON CONFLICT (workspace_id, name) DO NOTHING RETURNING id, name`,
      [workspaceId, name, color || '#6C63FF']
    );
    return { data: res.rows[0] || { exists: true } };
  });

  app.get('/api/v1/workspaces/:workspaceId/tags', { schema: { tags: ['dam'] } }, async (req) => {
    if (!await getUserId(req)) return { error: { code: 'AUTH_REQUIRED' } };
    const { workspaceId } = req.params as { workspaceId: string };
    const res = await pgPool.query(`SELECT id, name, color FROM aidilam_app.asset_tags WHERE workspace_id=$1 ORDER BY name`, [workspaceId]);
    return { data: { items: res.rows } };
  });

  app.post('/api/v1/workspaces/:workspaceId/tags/:tagId/bind', { schema: { tags: ['dam'] } }, async (req) => {
    if (!await getUserId(req)) return { error: { code: 'AUTH_REQUIRED' } };
    const { workspaceId, tagId } = req.params as { workspaceId: string; tagId: string };
    const { assetId } = req.body as { assetId: string };
    // Verify tag belongs to workspace
    const tag = await pgPool.query(`SELECT id FROM aidilam_app.asset_tags WHERE id=$1 AND workspace_id=$2`, [tagId, workspaceId]);
    if (tag.rows.length === 0) return { error: { code: 'NOT_FOUND' } };
    await pgPool.query(`INSERT INTO aidilam_app.asset_tag_bindings (tag_id, asset_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [tagId, assetId]);
    return { data: { bound: true } };
  });

  // === LINEAGE ===
  app.get('/api/v1/projects/:projectId/assets/:assetId/lineage', { schema: { tags: ['dam'] } }, async (req) => {
    if (!await getUserId(req)) return { error: { code: 'AUTH_REQUIRED' } };
    const { projectId, assetId } = req.params as { projectId: string; assetId: string };
    // Get parent and child lineage
    const parents = await pgPool.query(
      `SELECT al.relationship_type, al.stage, al.job_id, a.id as asset_id, a.media_kind, a.original_filename
       FROM aidilam_app.asset_lineage al JOIN aidilam_app.assets a ON a.id=al.parent_asset_id
       WHERE al.child_asset_id=$1`, [assetId]
    );
    const children = await pgPool.query(
      `SELECT al.relationship_type, al.stage, al.job_id, a.id as asset_id, a.media_kind, a.original_filename
       FROM aidilam_app.asset_lineage al JOIN aidilam_app.assets a ON a.id=al.child_asset_id
       WHERE al.parent_asset_id=$1`, [assetId]
    );
    // Also check source_asset_id on the asset itself
    const self = await pgPool.query(`SELECT source_asset_id FROM aidilam_app.assets WHERE id=$1 AND project_id=$2`, [assetId, projectId]);
    return { data: { parents: parents.rows, children: children.rows, sourceAssetId: self.rows[0]?.source_asset_id } };
  });

  // === ASSET ARCHIVE ===
  app.post('/api/v1/projects/:projectId/assets/:assetId/archive', { schema: { tags: ['dam'] } }, async (req) => {
    if (!await getUserId(req)) return { error: { code: 'AUTH_REQUIRED' } };
    const { projectId, assetId } = req.params as { projectId: string; assetId: string };
    const res = await pgPool.query(
      `UPDATE aidilam_app.assets SET status='archived', updated_at=now() WHERE id=$1 AND project_id=$2 AND status NOT IN ('archived') RETURNING id`,
      [assetId, projectId]
    );
    return { data: { archived: res.rows.length > 0 } };
  });

  // === EXACT VERSION DOWNLOAD ===
  app.post('/api/v1/projects/:projectId/assets/:assetId/versions/:versionId/download-url', {
    schema: { tags: ['dam'] },
  }, async (req, reply) => {
    const userId = await getUserId(req);
    if (!userId) return { error: { code: 'AUTH_REQUIRED' } };
    const { projectId, assetId, versionId } = req.params as { projectId: string; assetId: string; versionId: string };
    const asset = await pgPool.query(`SELECT id FROM aidilam_app.assets WHERE id=$1 AND project_id=$2`, [assetId, projectId]);
    if (asset.rows.length === 0) return { error: { code: 'NOT_FOUND', message: 'Asset not found' } };
    const ver = await pgPool.query(`SELECT storage_reference FROM aidilam_app.asset_versions WHERE id=$1 AND asset_id=$2`, [versionId, assetId]);
    if (ver.rows.length === 0) return { error: { code: 'NOT_FOUND', message: 'Version not found' } };
    // Use existing download-url pattern (presigned URL via project asset endpoint)
    return { data: { downloadUrl: '/api/v1/projects/' + projectId + '/assets/' + assetId + '/download-url', versionId, assetId, storageRef: ver.rows[0].storage_reference } };
  });


  // === REPROCESS TO NEW VERSION ===
  app.post('/api/v1/projects/:projectId/assets/:assetId/reprocess', {
    schema: { tags: ['dam'], body: { type: 'object', required: ['idempotencyKey'], properties: {
      idempotencyKey: { type: 'string', minLength: 8 },
      voiceCode: { type: 'string' },
      baseVersionId: { type: 'string', format: 'uuid' },
    }}},
  }, async (req, reply) => {
    const userId = await getUserId(req);
    if (!userId) return { error: { code: 'AUTH_REQUIRED' } };
    const { projectId, assetId } = req.params as { projectId: string; assetId: string };
    const body = req.body as { idempotencyKey: string; voiceCode?: string; baseVersionId?: string };

    // Verify asset belongs to project
    const asset = await pgPool.query(`SELECT id, project_id FROM aidilam_app.assets WHERE id=$1 AND project_id=$2`, [assetId, projectId]);
    if (asset.rows.length === 0) return { error: { code: 'NOT_FOUND' } };

    // Get workspace from project
    const proj = await pgPool.query(`SELECT workspace_id FROM aidilam_app.projects WHERE id=$1`, [projectId]);
    const workspaceId = proj.rows[0]?.workspace_id;
    if (!workspaceId) return { error: { code: 'NOT_FOUND' } };

    // Verify workspace membership
    const membership = await pgPool.query(`SELECT role FROM aidilam_app.workspace_members WHERE workspace_id=$1 AND user_id=$2 AND status='active'`, [workspaceId, userId]);
    if (membership.rows.length === 0) return { error: { code: 'ACCESS_DENIED', message: 'Not a member of this workspace' } };

    // Verify asset has at least v1 (base version required)
    const versions = await pgPool.query(`SELECT count(*)::int as cnt FROM aidilam_app.asset_versions WHERE asset_id=$1`, [assetId]);
    if (versions.rows[0]?.cnt === 0) return { error: { code: 'VALIDATION_ERROR', message: 'Asset has no base version. Cannot reprocess.' } };

    // Find the source asset (from lineage)
    const lineage = await pgPool.query(`SELECT parent_asset_id FROM aidilam_app.asset_lineage WHERE child_asset_id=$1 AND relationship_type='render' LIMIT 1`, [assetId]);
    const sourceAssetId = lineage.rows[0]?.parent_asset_id;
    if (!sourceAssetId) return { error: { code: 'VALIDATION_ERROR', message: 'Cannot find source for reprocess' } };

    // Idempotency
    const existing = await pgPool.query(`SELECT id, status FROM aidilam_app.jobs WHERE project_id=$1 AND idempotency_key=$2`, [projectId, body.idempotencyKey]);
    if (existing.rows.length > 0) return { data: { jobId: existing.rows[0].id, status: existing.rows[0].status, replayed: true } };

    // Create reprocess job with target asset info
    const jobRes = await pgPool.query(
      `INSERT INTO aidilam_app.jobs (project_id, job_type, status, idempotency_key, input_payload)
       VALUES ($1, 'video_pipeline', 'queued', $2, $3) RETURNING id, status, created_at`,
      [projectId, body.idempotencyKey, JSON.stringify({
        projectId, sourceAssetId,
        targetAssetId: assetId,
        reprocess: true,
        sourceLanguage: 'zh', targetLanguage: 'vi',
        voiceCode: body.voiceCode || 'vi-VN-NamMinhNeural',
        outputWidth: 1080, outputHeight: 1920,
      })]
    );
    const job = jobRes.rows[0];

    // Enqueue via internal API call (avoids Redis connection issues in request handler)
    const { Queue } = await import('bullmq');
    const Redis = (await import('ioredis')).default;
    const redisPass = config.secrets.redisPassword || '';
    const redis = new Redis({ host: config.redis.host, port: config.redis.port, password: redisPass || undefined, maxRetriesPerRequest: null, connectTimeout: 5000, lazyConnect: true });
    try {
      await redis.connect();
      const q = new Queue('aidilam-jobs', { connection: redis, prefix: 'aidilam:queue' });
      await q.add('video_pipeline', { jobId: job.id, jobType: 'video_pipeline', projectId }, { jobId: `reprocess-${job.id}`, attempts: 1 });
      await q.close();
    } finally { redis.disconnect(); }

    return { data: { jobId: job.id, status: 'queued', reprocess: true, targetAssetId: assetId, publishingTriggered: false } };
  });


}
