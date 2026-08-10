/**
 * Workflow HTTP API Routes (workspace-scoped)
 * AIDILAM-COM-04E1R2
 *
 * All workflow read/mutation endpoints enforce:
 * Session → User → Workspace Membership → Workflow Ownership/Visibility → Permission → Operation
 */
import { FastifyInstance } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { pgPool } from '../../infrastructure/database/index.js';
import { validateWorkflowVersion, WorkflowSpecification } from './validator.js';

const SESSION_COOKIE = 'aidilam_session';

interface AuthContext {
  userId: string;
  isAdmin: boolean;
}

async function getAuthContext(request: any): Promise<AuthContext | null> {
  const sid = request.cookies?.[SESSION_COOKIE];
  if (!sid) return null;
  const h = createHash('sha256').update(sid).digest('hex');
  const r = await pgPool.query(
    `SELECT bs.user_id FROM aidilam_app.browser_sessions bs WHERE bs.session_hash=$1 AND bs.revoked_at IS NULL AND bs.expires_at>now()`,
    [h]
  );
  if (r.rows.length === 0) return null;
  const userId = r.rows[0].user_id;
  // Check if user is owner in any workspace (system_admin equivalent)
  const adminCheck = await pgPool.query(
    `SELECT 1 FROM aidilam_app.workspace_members WHERE user_id=$1 AND role='owner' LIMIT 1`,
    [userId]
  );
  return { userId, isAdmin: adminCheck.rows.length > 0 };
}

async function verifyWorkspaceMembership(userId: string, workspaceId: string): Promise<string | null> {
  const res = await pgPool.query(
    `SELECT role FROM aidilam_app.workspace_members WHERE workspace_id=$1 AND user_id=$2 AND status='active'`,
    [workspaceId, userId]
  );
  return res.rows[0]?.role || null;
}

export async function workflowRoutes(app: FastifyInstance) {

  // === LIST WORKFLOWS (workspace-scoped) ===
  app.get('/api/v1/workspaces/:workspaceId/workflows', { schema: { tags: ['workflow'] } }, async (req) => {
    const auth = await getAuthContext(req);
    if (!auth) return { error: { code: 'AUTH_REQUIRED' } };
    const { workspaceId } = req.params as { workspaceId: string };
    const role = await verifyWorkspaceMembership(auth.userId, workspaceId);
    if (!role) return { error: { code: 'ACCESS_DENIED', message: 'Not a workspace member' } };

    const wfs = await pgPool.query(
      `SELECT wd.id, wd.name, wd.workflow_type, wd.status, wd.category, wv.checksum_sha256, wv.version_number
       FROM aidilam_app.workflow_definitions wd
       LEFT JOIN aidilam_app.workflow_versions wv ON wv.id=wd.current_version_id
       WHERE (wd.workspace_id=$1 OR wd.workflow_type='system') AND wd.status='active'
       ORDER BY wd.workflow_type, wd.name`,
      [workspaceId]
    );
    return { data: { items: wfs.rows } };
  });

  // === GET WORKFLOW DETAIL ===
  app.get('/api/v1/workspaces/:workspaceId/workflows/:workflowId', { schema: { tags: ['workflow'] } }, async (req) => {
    const auth = await getAuthContext(req);
    if (!auth) return { error: { code: 'AUTH_REQUIRED' } };
    const { workspaceId, workflowId } = req.params as { workspaceId: string; workflowId: string };
    const role = await verifyWorkspaceMembership(auth.userId, workspaceId);
    if (!role) return { error: { code: 'ACCESS_DENIED', message: 'Not a workspace member' } };

    // Workflow must belong to workspace OR be system
    const wf = await pgPool.query(
      `SELECT id, name, slug, workflow_type, status, category, visibility, current_version_id, workspace_id
       FROM aidilam_app.workflow_definitions
       WHERE id=$1 AND (workspace_id=$2 OR (workflow_type='system' AND workspace_id IS NULL)) AND status='active'`,
      [workflowId, workspaceId]
    );
    if (wf.rows.length === 0) return { error: { code: 'NOT_FOUND' } };
    return { data: wf.rows[0] };
  });

  // === LIST VERSIONS ===
  app.get('/api/v1/workspaces/:workspaceId/workflows/:workflowId/versions', { schema: { tags: ['workflow'] } }, async (req) => {
    const auth = await getAuthContext(req);
    if (!auth) return { error: { code: 'AUTH_REQUIRED' } };
    const { workspaceId, workflowId } = req.params as { workspaceId: string; workflowId: string };
    const role = await verifyWorkspaceMembership(auth.userId, workspaceId);
    if (!role) return { error: { code: 'ACCESS_DENIED', message: 'Not a workspace member' } };

    // Verify workflow access
    const wf = await pgPool.query(
      `SELECT id FROM aidilam_app.workflow_definitions WHERE id=$1 AND (workspace_id=$2 OR (workflow_type='system' AND workspace_id IS NULL)) AND status='active'`,
      [workflowId, workspaceId]
    );
    if (wf.rows.length === 0) return { error: { code: 'NOT_FOUND' } };

    const vers = await pgPool.query(
      `SELECT id, version_number, schema_version, checksum_sha256, status, created_at
       FROM aidilam_app.workflow_versions WHERE workflow_definition_id=$1 ORDER BY version_number DESC`,
      [workflowId]
    );
    return { data: { items: vers.rows } };
  });

  // === GET VERSION DETAIL (with nodes/edges) ===
  app.get('/api/v1/workspaces/:workspaceId/workflows/:workflowId/versions/:versionId', { schema: { tags: ['workflow'] } }, async (req) => {
    const auth = await getAuthContext(req);
    if (!auth) return { error: { code: 'AUTH_REQUIRED' } };
    const { workspaceId, workflowId, versionId } = req.params as { workspaceId: string; workflowId: string; versionId: string };
    const role = await verifyWorkspaceMembership(auth.userId, workspaceId);
    if (!role) return { error: { code: 'ACCESS_DENIED', message: 'Not a workspace member' } };

    // Verify workflow belongs to workspace
    const wf = await pgPool.query(
      `SELECT id FROM aidilam_app.workflow_definitions WHERE id=$1 AND (workspace_id=$2 OR (workflow_type='system' AND workspace_id IS NULL)) AND status='active'`,
      [workflowId, workspaceId]
    );
    if (wf.rows.length === 0) return { error: { code: 'NOT_FOUND' } };

    const ver = await pgPool.query(
      `SELECT id, version_number, schema_version, configuration_json, checksum_sha256, status, created_at
       FROM aidilam_app.workflow_versions WHERE id=$1 AND workflow_definition_id=$2`,
      [versionId, workflowId]
    );
    if (ver.rows.length === 0) return { error: { code: 'NOT_FOUND' } };

    const nodes = await pgPool.query(
      `SELECT node_key, node_type, display_name, position_index, config_json, capability
       FROM aidilam_app.workflow_nodes WHERE workflow_version_id=$1 ORDER BY position_index`,
      [versionId]
    );
    const edges = await pgPool.query(
      `SELECT from_node_key, to_node_key, edge_type FROM aidilam_app.workflow_edges WHERE workflow_version_id=$1`,
      [versionId]
    );

    return { data: { ...ver.rows[0], nodes: nodes.rows, edges: edges.rows } };
  });

  // === CREATE VERSION (validates through canonical validator) ===
  app.post('/api/v1/workspaces/:workspaceId/workflows/:workflowId/versions', { schema: { tags: ['workflow'] } }, async (req) => {
    const auth = await getAuthContext(req);
    if (!auth) return { error: { code: 'AUTH_REQUIRED' } };
    const { workspaceId, workflowId } = req.params as { workspaceId: string; workflowId: string };

    // Server-derived: ignore any body.workspaceId, body.userId, body.role, body.systemAdmin
    const role = await verifyWorkspaceMembership(auth.userId, workspaceId);
    if (!role) return { error: { code: 'ACCESS_DENIED', message: 'Not a workspace member' } };

    // Must be workspace-owned (cannot create versions on system workflows)
    const wf = await pgPool.query(
      `SELECT id, workspace_id, workflow_type FROM aidilam_app.workflow_definitions WHERE id=$1 AND workspace_id=$2 AND workflow_type='workspace' AND status='active'`,
      [workflowId, workspaceId]
    );
    if (wf.rows.length === 0) return { error: { code: 'ACCESS_DENIED', message: 'Cannot modify system workflow or foreign workspace workflow' } };

    const body = req.body as { nodes: any[]; edges: any[] };
    if (!body || !body.nodes) return { error: { code: 'VALIDATION_ERROR', message: 'nodes required' } };

    const spec: WorkflowSpecification = { nodes: body.nodes, edges: body.edges || [] };

    // === CANONICAL VALIDATION ===
    const validation = validateWorkflowVersion(spec);
    if (!validation.valid) {
      return { error: { code: 'WORKFLOW_VALIDATION_FAILED', details: validation.errors, metadata: validation.metadata } };
    }

    // Determine next version number
    const lastVer = await pgPool.query(
      `SELECT MAX(version_number) as max_ver FROM aidilam_app.workflow_versions WHERE workflow_definition_id=$1`,
      [workflowId]
    );
    const nextVer = (lastVer.rows[0]?.max_ver || 0) + 1;

    // Compute checksum
    const configJson = { nodes: spec.nodes, edges: spec.edges };
    const canonical = JSON.stringify(configJson, Object.keys(configJson).sort());
    const checksum = createHash('sha256').update(canonical).digest('hex');

    const verRes = await pgPool.query(
      `INSERT INTO aidilam_app.workflow_versions (workflow_definition_id, version_number, schema_version, configuration_json, checksum_sha256, status, created_by)
       VALUES ($1, $2, '1.0', $3, $4, 'draft', $5) RETURNING id, version_number`,
      [workflowId, nextVer, JSON.stringify(configJson), checksum, auth.userId]
    );
    const newVerId = verRes.rows[0].id;

    // Insert nodes
    for (const n of spec.nodes) {
      await pgPool.query(
        `INSERT INTO aidilam_app.workflow_nodes (workflow_version_id, node_key, node_type, display_name, position_index, config_json, capability)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [newVerId, n.node_key, n.node_type, n.display_name, n.position_index, JSON.stringify(n.config_json || {}), n.capability || null]
      );
    }
    // Insert edges
    for (const e of spec.edges) {
      await pgPool.query(
        `INSERT INTO aidilam_app.workflow_edges (workflow_version_id, from_node_key, to_node_key, edge_type)
         VALUES ($1,$2,$3,$4)`,
        [newVerId, e.from_node_key, e.to_node_key, e.edge_type || 'success']
      );
    }

    return { data: { versionId: newVerId, versionNumber: nextVer, checksum, validation: validation.metadata } };
  });

  // === ACTIVATE VERSION ===
  app.post('/api/v1/workspaces/:workspaceId/workflows/:workflowId/versions/:versionId/activate', { schema: { tags: ['workflow'] } }, async (req) => {
    const auth = await getAuthContext(req);
    if (!auth) return { error: { code: 'AUTH_REQUIRED' } };
    const { workspaceId, workflowId, versionId } = req.params as { workspaceId: string; workflowId: string; versionId: string };
    const role = await verifyWorkspaceMembership(auth.userId, workspaceId);
    if (!role) return { error: { code: 'ACCESS_DENIED', message: 'Not a workspace member' } };

    // Must be workspace-owned
    const wf = await pgPool.query(
      `SELECT id FROM aidilam_app.workflow_definitions WHERE id=$1 AND workspace_id=$2 AND workflow_type='workspace' AND status='active'`,
      [workflowId, workspaceId]
    );
    if (wf.rows.length === 0) return { error: { code: 'ACCESS_DENIED', message: 'Cannot modify system workflow or foreign workspace workflow' } };

    const ver = await pgPool.query(
      `SELECT id FROM aidilam_app.workflow_versions WHERE id=$1 AND workflow_definition_id=$2`,
      [versionId, workflowId]
    );
    if (ver.rows.length === 0) return { error: { code: 'NOT_FOUND' } };

    await pgPool.query(`UPDATE aidilam_app.workflow_versions SET status='active' WHERE id=$1`, [versionId]);
    await pgPool.query(`UPDATE aidilam_app.workflow_definitions SET current_version_id=$1 WHERE id=$2`, [versionId, workflowId]);

    return { data: { activated: true, versionId, workflowId } };
  });

  // === ARCHIVE WORKFLOW ===
  app.post('/api/v1/workspaces/:workspaceId/workflows/:workflowId/archive', { schema: { tags: ['workflow'] } }, async (req) => {
    const auth = await getAuthContext(req);
    if (!auth) return { error: { code: 'AUTH_REQUIRED' } };
    const { workspaceId, workflowId } = req.params as { workspaceId: string; workflowId: string };
    const role = await verifyWorkspaceMembership(auth.userId, workspaceId);
    if (!role) return { error: { code: 'ACCESS_DENIED', message: 'Not a workspace member' } };

    // Must be workspace-owned
    const wf = await pgPool.query(
      `SELECT id FROM aidilam_app.workflow_definitions WHERE id=$1 AND workspace_id=$2 AND workflow_type='workspace' AND status='active'`,
      [workflowId, workspaceId]
    );
    if (wf.rows.length === 0) return { error: { code: 'ACCESS_DENIED', message: 'Cannot archive system workflow or foreign workspace workflow' } };

    await pgPool.query(`UPDATE aidilam_app.workflow_definitions SET status='archived' WHERE id=$1`, [workflowId]);
    return { data: { archived: true, workflowId } };
  });

  // === CLONE WORKFLOW (workspace-scoped, validates through canonical validator) ===
  app.post('/api/v1/workspaces/:workspaceId/workflows/:workflowId/clone', { schema: { tags: ['workflow'] } }, async (req) => {
    const auth = await getAuthContext(req);
    if (!auth) return { error: { code: 'AUTH_REQUIRED' } };
    const { workspaceId, workflowId } = req.params as { workspaceId: string; workflowId: string };
    const role = await verifyWorkspaceMembership(auth.userId, workspaceId);
    if (!role) return { error: { code: 'ACCESS_DENIED', message: 'Not a workspace member' } };

    // Source workflow must be accessible (own workspace or system)
    const src = await pgPool.query(
      `SELECT wd.id, wd.name, wd.slug, wv.id as ver_id, wv.configuration_json, wv.checksum_sha256
       FROM aidilam_app.workflow_definitions wd
       JOIN aidilam_app.workflow_versions wv ON wv.id=wd.current_version_id
       WHERE wd.id=$1 AND (wd.workspace_id=$2 OR (wd.workflow_type='system' AND wd.workspace_id IS NULL)) AND wd.status='active'`,
      [workflowId, workspaceId]
    );
    if (src.rows.length === 0) return { error: { code: 'NOT_FOUND' } };

    const s = src.rows[0];

    // Load nodes and edges for validation
    const nodesRes = await pgPool.query(
      `SELECT node_key, node_type, display_name, position_index, config_json, capability
       FROM aidilam_app.workflow_nodes WHERE workflow_version_id=$1`,
      [s.ver_id]
    );
    const edgesRes = await pgPool.query(
      `SELECT from_node_key, to_node_key, edge_type FROM aidilam_app.workflow_edges WHERE workflow_version_id=$1`,
      [s.ver_id]
    );

    // === CANONICAL VALIDATION of cloned specification ===
    const spec: WorkflowSpecification = { nodes: nodesRes.rows, edges: edgesRes.rows };
    const validation = validateWorkflowVersion(spec);
    if (!validation.valid) {
      return { error: { code: 'WORKFLOW_VALIDATION_FAILED', message: 'Source workflow fails validation', details: validation.errors } };
    }

    // Create definition
    const defRes = await pgPool.query(
      `INSERT INTO aidilam_app.workflow_definitions (workspace_id, name, slug, category, workflow_type, status, visibility, created_by)
       VALUES ($1, $2, $3, 'video', 'workspace', 'active', 'workspace', $4) RETURNING id`,
      [workspaceId, s.name + ' (Clone)', s.slug + '-clone-' + Date.now().toString(36), auth.userId]
    );
    const newDefId = defRes.rows[0].id;

    // Create v1
    const verRes = await pgPool.query(
      `INSERT INTO aidilam_app.workflow_versions (workflow_definition_id, version_number, schema_version, configuration_json, checksum_sha256, status, created_by)
       VALUES ($1, 1, '1.0', $2, $3, 'active', $4) RETURNING id`,
      [newDefId, JSON.stringify(s.configuration_json), s.checksum_sha256, auth.userId]
    );
    const newVerId = verRes.rows[0].id;
    await pgPool.query(`UPDATE aidilam_app.workflow_definitions SET current_version_id=$1 WHERE id=$2`, [newVerId, newDefId]);

    // Clone nodes
    for (const n of nodesRes.rows) {
      await pgPool.query(
        `INSERT INTO aidilam_app.workflow_nodes (workflow_version_id, node_key, node_type, display_name, position_index, config_json, capability)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [newVerId, n.node_key, n.node_type, n.display_name, n.position_index, JSON.stringify(n.config_json), n.capability]
      );
    }
    // Clone edges
    for (const e of edgesRes.rows) {
      await pgPool.query(
        `INSERT INTO aidilam_app.workflow_edges (workflow_version_id, from_node_key, to_node_key, edge_type)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [newVerId, e.from_node_key, e.to_node_key, e.edge_type]
      );
    }

    return { data: { definitionId: newDefId, versionId: newVerId, workspaceId, clonedFrom: workflowId, validation: validation.metadata } };
  });

}
