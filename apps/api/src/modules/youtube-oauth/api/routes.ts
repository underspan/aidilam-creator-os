/**
 * YouTube OAuth Internal Management Routes
 * AIDILAM-DEP-016A3
 *
 * Internal endpoints for YouTube OAuth configuration, authorization, and binding management.
 * Public OAuth callback is NOT exposed in this phase.
 * Real transport is NOT active.
 */
import { FastifyInstance } from 'fastify';
import { pgPool } from '../../../infrastructure/database/index.js';
import { AppError } from '../../../core/errors/index.js';
import { requireProjectPermission } from '../../security/domain/authorization.js';

export async function youtubeOAuthRoutes(app: FastifyInstance): Promise<void> {

  // GET YouTube OAuth binding status for an account
  app.get('/api/v1/projects/:projectId/integrations/youtube/oauth/bindings/:accountId', { schema: { tags: ['youtube-oauth'] } },
  async (request) => {
    const { projectId, accountId } = request.params as { projectId: string; accountId: string };
    await requireProjectPermission(request, projectId, 'youtube.oauth.view');

    const result = await pgPool.query(
      `SELECT id, channel_id, channel_title, status, scope_set, authorized_at, revoked_at, last_validated_at, created_at
       FROM aidilam_app.youtube_credential_bindings
       WHERE project_id = $1 AND platform_account_id = $2 AND status != 'disabled'
       ORDER BY created_at DESC LIMIT 1`,
      [projectId, accountId]
    );

    if (result.rows.length === 0) {
      return { data: null, meta: { requestId: request.id, bound: false } };
    }

    // REDACTED: no credential_reference, no google_subject_hash in response
    const row = result.rows[0];
    return {
      data: {
        id: row.id,
        channelId: row.channel_id,
        channelTitle: row.channel_title,
        status: row.status,
        scopes: row.scope_set,
        authorizedAt: row.authorized_at,
        revokedAt: row.revoked_at,
        lastValidatedAt: row.last_validated_at,
      },
      meta: { requestId: request.id, bound: true },
    };
  });

  // POST revoke credential binding
  app.post('/api/v1/projects/:projectId/integrations/youtube/oauth/bindings/:accountId/revoke', { schema: { tags: ['youtube-oauth'] } },
  async (request) => {
    const { projectId, accountId } = request.params as { projectId: string; accountId: string };
    await requireProjectPermission(request, projectId, 'youtube.oauth.revoke');

    const binding = await pgPool.query(
      `SELECT id, status FROM aidilam_app.youtube_credential_bindings
       WHERE project_id = $1 AND platform_account_id = $2 AND status = 'active'`,
      [projectId, accountId]
    );

    if (binding.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'No active YouTube credential binding found');
    }

    await pgPool.query(
      `UPDATE aidilam_app.youtube_credential_bindings SET status = 'revoked', revoked_at = now(), updated_at = now() WHERE id = $1`,
      [binding.rows[0].id]
    );

    // Audit
    await pgPool.query(
      `INSERT INTO aidilam_app.youtube_oauth_audit_events (project_id, event_type, actor_type, actor_id, platform_account_id, binding_id, status)
       VALUES ($1, 'youtube_credential_revoked', 'user', $2, $3, $4, 'revoked')`,
      [projectId, request.identity!.actorId, accountId, binding.rows[0].id]
    );

    return { data: { bindingId: binding.rows[0].id, status: 'revoked' }, meta: { requestId: request.id } };
  });

  // GET OAuth session status (for tracking authorization flow)
  app.get('/api/v1/projects/:projectId/integrations/youtube/oauth/sessions/:sessionId', { schema: { tags: ['youtube-oauth'] } },
  async (request) => {
    const { projectId, sessionId } = request.params as { projectId: string; sessionId: string };
    await requireProjectPermission(request, projectId, 'youtube.oauth.view');

    const result = await pgPool.query(
      `SELECT id, status, requested_scopes, expires_at, consumed_at, created_at
       FROM aidilam_app.youtube_oauth_sessions
       WHERE id = $1 AND project_id = $2`,
      [sessionId, projectId]
    );

    if (result.rows.length === 0) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Authorization session not found');
    }

    // REDACTED: no state_hash, no pkce_verifier_reference
    const row = result.rows[0];
    return {
      data: {
        id: row.id,
        status: row.status,
        scopes: row.requested_scopes,
        expiresAt: row.expires_at,
        consumedAt: row.consumed_at,
        createdAt: row.created_at,
      },
      meta: { requestId: request.id },
    };
  });

  // POST create/update OAuth client configuration
  app.post('/api/v1/projects/:projectId/integrations/youtube/oauth/config', { schema: { tags: ['youtube-oauth'] } },
  async (request) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'youtube.oauth.configure');
    const body = request.body as { displayName: string; clientIdReference: string; clientSecretReference: string; redirectUri?: string };
    if (!body.displayName || !body.clientIdReference || !body.clientSecretReference) {
      throw new AppError('VALIDATION_ERROR', 'Missing required configuration fields');
    }
    const result = await pgPool.query(
      `INSERT INTO aidilam_app.youtube_oauth_clients (project_id, display_name, client_id_reference, client_secret_reference, redirect_uri, enabled)
       VALUES ($1, $2, $3, $4, $5, false) RETURNING id, created_at`,
      [projectId, body.displayName, body.clientIdReference, body.clientSecretReference, body.redirectUri || null]
    );
    // Audit
    await pgPool.query(
      `INSERT INTO aidilam_app.youtube_oauth_audit_events (project_id, event_type, actor_type, actor_id, metadata_safe_json)
       VALUES ($1, 'youtube_oauth_config_created', 'user', $2, $3)`,
      [projectId, request.identity!.actorId, JSON.stringify({ configId: result.rows[0].id })]
    );
    return { data: { id: result.rows[0].id, createdAt: result.rows[0].created_at }, meta: { requestId: request.id } };
  });

  // GET OAuth client configuration
  app.get('/api/v1/projects/:projectId/integrations/youtube/oauth/config', { schema: { tags: ['youtube-oauth'] } },
  async (request) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'youtube.oauth.view');
    const result = await pgPool.query(
      `SELECT id, display_name, client_id_reference, redirect_uri, audience, publishing_status, enabled, created_at
       FROM aidilam_app.youtube_oauth_clients WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [projectId]
    );
    if (result.rows.length === 0) return { data: null, meta: { requestId: request.id } };
    // REDACTED: no client_secret_reference in response
    return { data: result.rows[0], meta: { requestId: request.id } };
  });

  // POST create authorization session
  app.post('/api/v1/projects/:projectId/integrations/youtube/oauth/sessions', { schema: { tags: ['youtube-oauth'] } },
  async (request) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectPermission(request, projectId, 'youtube.oauth.authorize');
    const body = request.body as { platformAccountId: string; scopes?: string[]; idempotencyKey?: string };
    if (!body.platformAccountId) throw new AppError('VALIDATION_ERROR', 'Missing platformAccountId');

    // Idempotency: check if session with same key already exists (project-scoped)
    if (body.idempotencyKey) {
      const existing = await pgPool.query(
        `SELECT id, expires_at, status, platform_account_id, requested_scopes FROM aidilam_app.youtube_oauth_sessions
         WHERE project_id = $1 AND state_hash LIKE $2 AND status IN ('redirect_ready','consumed')`,
        [projectId, `idem:${body.idempotencyKey}:%`]
      );
      if (existing.rows.length > 0) {
        const ex = existing.rows[0];
        // Conflict check: same account + same scopes?
        const samePayload = ex.platform_account_id === body.platformAccountId;
        if (!samePayload) throw new AppError('CONFLICT', 'Idempotency key reused with different payload');
        // Return existing session (no new row, no new audit)
        const config = await pgPool.query(`SELECT redirect_uri FROM aidilam_app.youtube_oauth_clients WHERE project_id = $1 AND enabled = true LIMIT 1`, [projectId]);
        return { data: { id: ex.id, expiresAt: ex.expires_at, redirectUri: config.rows[0]?.redirect_uri, replayed: true }, meta: { requestId: request.id } };
      }
    }

    const { randomBytes, createHash } = await import('node:crypto');
    const rawState = randomBytes(32).toString('hex');
    // Prefix state_hash with idempotency key for lookup (key:hash format)
    const stateHashRaw = createHash('sha256').update(rawState).digest('hex');
    const stateHash = body.idempotencyKey ? `idem:${body.idempotencyKey}:${stateHashRaw}` : stateHashRaw;

    const config = await pgPool.query(
      `SELECT redirect_uri FROM aidilam_app.youtube_oauth_clients WHERE project_id = $1 AND enabled = true LIMIT 1`, [projectId]
    );
    const redirectUri = config.rows[0]?.redirect_uri;
    if (!redirectUri) throw new AppError('VALIDATION_ERROR', 'No enabled OAuth config with redirect URI');

    const result = await pgPool.query(
      `INSERT INTO aidilam_app.youtube_oauth_sessions (project_id, platform_account_id, state_hash, redirect_uri, requested_scopes, status, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, 'redirect_ready', now() + interval '10 minutes', $6) RETURNING id, created_at, expires_at`,
      [projectId, body.platformAccountId, stateHash, redirectUri, body.scopes || ['https://www.googleapis.com/auth/youtube.upload'], request.identity!.actorId]
    );

    // Audit: session created (once per new session)
    await pgPool.query(
      `INSERT INTO aidilam_app.youtube_oauth_audit_events (project_id, event_type, actor_type, actor_id, session_id, status, metadata_safe_json)
       VALUES ($1, 'youtube_oauth_session_created', 'user', $2, $3, 'redirect_ready', '{}')`,
      [projectId, request.identity!.actorId, result.rows[0].id]
    );

    return { data: { id: result.rows[0].id, expiresAt: result.rows[0].expires_at, redirectUri }, meta: { requestId: request.id } };
  });

  // POST mark reauthorization required
  app.post('/api/v1/projects/:projectId/integrations/youtube/oauth/bindings/:accountId/reauthorization-required', { schema: { tags: ['youtube-oauth'] } },
  async (request) => {
    const { projectId, accountId } = request.params as { projectId: string; accountId: string };
    await requireProjectPermission(request, projectId, 'youtube.oauth.revoke');

    const result = await pgPool.query(
      `UPDATE aidilam_app.youtube_credential_bindings SET status = 'reauthorization_required', updated_at = now()
       WHERE project_id = $1 AND platform_account_id = $2 AND status = 'active' RETURNING id`,
      [projectId, accountId]
    );
    if ((result.rowCount ?? 0) === 0) throw new AppError('RESOURCE_NOT_FOUND', 'No active binding found');

    // Audit
    await pgPool.query(
      `INSERT INTO aidilam_app.youtube_oauth_audit_events (project_id, event_type, actor_type, actor_id, platform_account_id, binding_id, status)
       VALUES ($1, 'youtube_reauthorization_required', 'user', $2, $3, $4, 'reauthorization_required')`,
      [projectId, request.identity!.actorId, accountId, result.rows[0].id]
    );

    return { data: { bindingId: result.rows[0].id, status: 'reauthorization_required' }, meta: { requestId: request.id } };
  });
}
