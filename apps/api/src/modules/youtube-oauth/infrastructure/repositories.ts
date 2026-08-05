/**
 * YouTube OAuth Persistence Repositories
 * AIDILAM-DEP-016A3.1R
 *
 * Project-scoped persistence using existing pgPool pattern.
 * All operations require projectId. No unscoped queries.
 * Only opaque references stored — no raw credentials.
 */
import { Pool } from 'pg';

// ═══════════════════════════════════════════════════════════════════════════════
// Client Config Repository
// ═══════════════════════════════════════════════════════════════════════════════

export class YouTubeOAuthClientConfigRepository {
  constructor(private pool: Pool) {}

  async create(projectId: string, data: { displayName: string; clientIdReference: string; clientSecretReference: string; redirectUri?: string; audience?: string; publishingStatus?: string }) {
    const result = await this.pool.query(
      `INSERT INTO aidilam_app.youtube_oauth_clients (project_id, display_name, client_id_reference, client_secret_reference, redirect_uri, audience, publishing_status, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false) RETURNING id, created_at`,
      [projectId, data.displayName, data.clientIdReference, data.clientSecretReference, data.redirectUri || null, data.audience || 'external', data.publishingStatus || 'testing']
    );
    return result.rows[0];
  }

  async findByProject(projectId: string) {
    const result = await this.pool.query(
      `SELECT id, display_name, client_id_reference, redirect_uri, audience, publishing_status, enabled, created_at, updated_at
       FROM aidilam_app.youtube_oauth_clients WHERE project_id = $1 ORDER BY created_at DESC`,
      [projectId]
    );
    return result.rows;
  }

  async findEnabledByProject(projectId: string) {
    const result = await this.pool.query(
      `SELECT id, display_name, client_id_reference, redirect_uri, audience, publishing_status, enabled, created_at
       FROM aidilam_app.youtube_oauth_clients WHERE project_id = $1 AND enabled = true LIMIT 1`,
      [projectId]
    );
    return result.rows[0] || null;
  }

  async disable(projectId: string, configId: string) {
    const result = await this.pool.query(
      `UPDATE aidilam_app.youtube_oauth_clients SET enabled = false, updated_at = now() WHERE id = $1 AND project_id = $2 RETURNING id`,
      [configId, projectId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Authorization Session Repository
// ═══════════════════════════════════════════════════════════════════════════════

export class YouTubeAuthorizationSessionRepository {
  constructor(private pool: Pool) {}

  async create(projectId: string, data: { platformAccountId: string; stateHash: string; pkceVerifierReference?: string; redirectUri: string; requestedScopes: string[]; expiresAt: Date; createdBy: string }) {
    const result = await this.pool.query(
      `INSERT INTO aidilam_app.youtube_oauth_sessions (project_id, platform_account_id, state_hash, pkce_verifier_reference, redirect_uri, requested_scopes, status, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'redirect_ready', $7, $8) RETURNING id, created_at`,
      [projectId, data.platformAccountId, data.stateHash, data.pkceVerifierReference || null, data.redirectUri, data.requestedScopes, data.expiresAt, data.createdBy]
    );
    return result.rows[0];
  }

  async findByProjectAndId(projectId: string, sessionId: string) {
    const result = await this.pool.query(
      `SELECT id, status, requested_scopes, expires_at, consumed_at, created_at FROM aidilam_app.youtube_oauth_sessions WHERE id = $1 AND project_id = $2`,
      [sessionId, projectId]
    );
    return result.rows[0] || null;
  }

  async findActiveUnexpired(projectId: string, stateHash: string) {
    const result = await this.pool.query(
      `SELECT id, status, platform_account_id, expires_at FROM aidilam_app.youtube_oauth_sessions
       WHERE project_id = $1 AND state_hash = $2 AND status = 'redirect_ready' AND expires_at > now()`,
      [projectId, stateHash]
    );
    return result.rows[0] || null;
  }

  async consumeOnce(projectId: string, sessionId: string): Promise<boolean> {
    // Atomic: only succeeds if status is still 'redirect_ready'
    const result = await this.pool.query(
      `UPDATE aidilam_app.youtube_oauth_sessions SET status = 'consumed', consumed_at = now(), updated_at = now()
       WHERE id = $1 AND project_id = $2 AND status = 'redirect_ready' RETURNING id`,
      [sessionId, projectId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async expireStale(projectId: string): Promise<number> {
    const result = await this.pool.query(
      `UPDATE aidilam_app.youtube_oauth_sessions SET status = 'expired', updated_at = now()
       WHERE project_id = $1 AND status IN ('created', 'redirect_ready') AND expires_at <= now() RETURNING id`,
      [projectId]
    );
    return result.rowCount ?? 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Credential Binding Repository
// ═══════════════════════════════════════════════════════════════════════════════

export class YouTubeCredentialBindingRepository {
  constructor(private pool: Pool) {}

  async bindIdempotently(projectId: string, data: { platformAccountId: string; googleSubjectHash: string; channelId: string; channelTitle: string; credentialReference: string; scopeSet: string[] }) {
    const result = await this.pool.query(
      `INSERT INTO aidilam_app.youtube_credential_bindings (project_id, platform_account_id, google_subject_hash, channel_id, channel_title, credential_reference, scope_set, status, authorized_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', now())
       ON CONFLICT (project_id, platform_account_id) DO UPDATE SET
         google_subject_hash = EXCLUDED.google_subject_hash,
         channel_id = EXCLUDED.channel_id,
         channel_title = EXCLUDED.channel_title,
         credential_reference = EXCLUDED.credential_reference,
         scope_set = EXCLUDED.scope_set,
         status = 'active',
         authorized_at = now(),
         revoked_at = NULL,
         updated_at = now()
       RETURNING id, status`,
      [projectId, data.platformAccountId, data.googleSubjectHash, data.channelId, data.channelTitle, data.credentialReference, data.scopeSet]
    );
    return result.rows[0];
  }

  async findActiveByProjectAndAccount(projectId: string, platformAccountId: string) {
    const result = await this.pool.query(
      `SELECT id, channel_id, channel_title, credential_reference, scope_set, status, authorized_at, last_validated_at
       FROM aidilam_app.youtube_credential_bindings
       WHERE project_id = $1 AND platform_account_id = $2 AND status = 'active'`,
      [projectId, platformAccountId]
    );
    return result.rows[0] || null;
  }

  async revoke(projectId: string, platformAccountId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE aidilam_app.youtube_credential_bindings SET status = 'revoked', revoked_at = now(), updated_at = now()
       WHERE project_id = $1 AND platform_account_id = $2 AND status = 'active' RETURNING id`,
      [projectId, platformAccountId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markReauthorizationRequired(projectId: string, platformAccountId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE aidilam_app.youtube_credential_bindings SET status = 'reauthorization_required', updated_at = now()
       WHERE project_id = $1 AND platform_account_id = $2 AND status = 'active' RETURNING id`,
      [projectId, platformAccountId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
