/**
 * YouTube Upload Repositories
 * AIDILAM-DEP-016A4R
 *
 * DB-backed repositories for upload sessions and checkpoints.
 * Project-scoped. No raw session URIs. Atomic conditional updates.
 */
import { Pool, PoolClient } from 'pg';

// ═══════════════════════════════════════════════════════════════════════════════
// Upload Session Repository
// ═══════════════════════════════════════════════════════════════════════════════

export class UploadSessionRepository {
  constructor(private pool: Pool) {}

  async createIdempotently(projectId: string, data: {
    publishingJobId: string;
    publishingAttemptId: string;
    platformAccountId: string;
    credentialBindingId: string;
    uploadSessionSecretReference: string;
    totalBytes: number;
    chunkSize: number;
    mediaChecksum: string;
    idempotencyKey: string;
    expiresAt: Date;
  }) {
    // Try insert; on conflict return existing
    const result = await this.pool.query(
      `INSERT INTO aidilam_app.youtube_upload_sessions
       (project_id, publishing_job_id, publishing_attempt_id, platform_account_id,
        credential_binding_id, upload_session_secret_reference, total_bytes, chunk_size,
        media_checksum, status, idempotency_key, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ready', $10, $11)
       ON CONFLICT (project_id, idempotency_key) DO NOTHING
       RETURNING id, status, created_at`,
      [projectId, data.publishingJobId, data.publishingAttemptId, data.platformAccountId,
       data.credentialBindingId, data.uploadSessionSecretReference, data.totalBytes,
       data.chunkSize, data.mediaChecksum, data.idempotencyKey, data.expiresAt]
    );
    if (result.rows.length > 0) return { created: true, ...result.rows[0] };

    // Conflict — fetch existing
    const existing = await this.pool.query(
      `SELECT id, publishing_job_id, status, created_at FROM aidilam_app.youtube_upload_sessions
       WHERE project_id = $1 AND idempotency_key = $2`,
      [projectId, data.idempotencyKey]
    );
    if (existing.rows[0]?.publishing_job_id !== data.publishingJobId) {
      throw new Error('Idempotency conflict: different payload for same key');
    }
    return { created: false, ...existing.rows[0] };
  }

  async findByProjectAndId(projectId: string, sessionId: string) {
    const result = await this.pool.query(
      `SELECT * FROM aidilam_app.youtube_upload_sessions WHERE id = $1 AND project_id = $2`,
      [sessionId, projectId]
    );
    return result.rows[0] || null;
  }

  async findActiveByLogicalUpload(projectId: string, publishingJobId: string, publishingAttemptId: string) {
    const result = await this.pool.query(
      `SELECT * FROM aidilam_app.youtube_upload_sessions
       WHERE project_id = $1 AND publishing_job_id = $2 AND publishing_attempt_id = $3
       AND status NOT IN ('uploaded','cancelled','failed','expired')
       LIMIT 1`,
      [projectId, publishingJobId, publishingAttemptId]
    );
    return result.rows[0] || null;
  }

  async markReady(projectId: string, sessionId: string) {
    const result = await this.pool.query(
      `UPDATE aidilam_app.youtube_upload_sessions
       SET status = 'ready', updated_at = now()
       WHERE id = $1 AND project_id = $2 AND status = 'initializing'
       RETURNING id`,
      [sessionId, projectId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async updateProgressAtomically(projectId: string, sessionId: string, bytesAccepted: number) {
    // Only advance — never regress. Uses conditional WHERE.
    const result = await this.pool.query(
      `UPDATE aidilam_app.youtube_upload_sessions
       SET uploaded_bytes = uploaded_bytes + $3,
           next_byte_offset = next_byte_offset + $3,
           status = CASE WHEN uploaded_bytes + $3 >= total_bytes THEN 'completing' ELSE 'uploading' END,
           last_activity_at = now(),
           updated_at = now()
       WHERE id = $1 AND project_id = $2
       AND status IN ('ready', 'uploading', 'interrupted')
       AND uploaded_bytes + $3 <= total_bytes
       RETURNING id, uploaded_bytes, next_byte_offset, status`,
      [sessionId, projectId, bytesAccepted]
    );
    return result.rows[0] || null;
  }

  async markInterrupted(projectId: string, sessionId: string) {
    const result = await this.pool.query(
      `UPDATE aidilam_app.youtube_upload_sessions
       SET status = 'interrupted', updated_at = now()
       WHERE id = $1 AND project_id = $2 AND status IN ('uploading', 'ready')
       RETURNING id`,
      [sessionId, projectId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async enterRetryWait(projectId: string, sessionId: string) {
    const result = await this.pool.query(
      `UPDATE aidilam_app.youtube_upload_sessions
       SET status = 'retry_wait', updated_at = now()
       WHERE id = $1 AND project_id = $2 AND status IN ('interrupted', 'uploading')
       RETURNING id`,
      [sessionId, projectId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markUploaded(projectId: string, sessionId: string) {
    const result = await this.pool.query(
      `UPDATE aidilam_app.youtube_upload_sessions
       SET status = 'uploaded', updated_at = now()
       WHERE id = $1 AND project_id = $2 AND status = 'completing'
       RETURNING id`,
      [sessionId, projectId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markExpired(projectId: string, sessionId: string) {
    const result = await this.pool.query(
      `UPDATE aidilam_app.youtube_upload_sessions
       SET status = 'expired', updated_at = now()
       WHERE id = $1 AND project_id = $2 AND status NOT IN ('uploaded','cancelled','failed','expired')
       RETURNING id`,
      [sessionId, projectId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async cancel(projectId: string, sessionId: string) {
    const result = await this.pool.query(
      `UPDATE aidilam_app.youtube_upload_sessions
       SET status = 'cancelled', updated_at = now()
       WHERE id = $1 AND project_id = $2 AND status NOT IN ('uploaded','cancelled','failed','expired')
       RETURNING id`,
      [sessionId, projectId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markFailed(projectId: string, sessionId: string) {
    const result = await this.pool.query(
      `UPDATE aidilam_app.youtube_upload_sessions
       SET status = 'failed', updated_at = now()
       WHERE id = $1 AND project_id = $2 AND status NOT IN ('uploaded','cancelled','failed','expired')
       RETURNING id`,
      [sessionId, projectId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markReconciliationRequired(projectId: string, sessionId: string) {
    const result = await this.pool.query(
      `UPDATE aidilam_app.youtube_upload_sessions
       SET status = 'reconciliation_required', updated_at = now()
       WHERE id = $1 AND project_id = $2 AND status IN ('uploading','interrupted','retry_wait')
       RETURNING id`,
      [sessionId, projectId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async findStaleUploading(thresholdMs: number) {
    const result = await this.pool.query(
      `SELECT id, project_id, publishing_job_id, publishing_attempt_id, status
       FROM aidilam_app.youtube_upload_sessions
       WHERE status IN ('uploading','interrupted','retry_wait')
       AND last_activity_at < now() - ($1 || ' milliseconds')::interval
       LIMIT 20`,
      [thresholdMs.toString()]
    );
    return result.rows;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Upload Checkpoint Repository
// ═══════════════════════════════════════════════════════════════════════════════

export class UploadCheckpointRepository {
  constructor(private pool: Pool) {}

  async createPending(projectId: string, data: {
    uploadSessionId: string;
    byteStart: number;
    byteEnd: number;
    chunkChecksum: string;
    transportRequestId: string;
  }) {
    const result = await this.pool.query(
      `INSERT INTO aidilam_app.youtube_upload_checkpoints
       (project_id, upload_session_id, byte_start, byte_end, chunk_checksum, transport_request_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING id, created_at`,
      [projectId, data.uploadSessionId, data.byteStart, data.byteEnd, data.chunkChecksum, data.transportRequestId]
    );
    return result.rows[0];
  }

  async markSending(projectId: string, checkpointId: string) {
    const result = await this.pool.query(
      `UPDATE aidilam_app.youtube_upload_checkpoints
       SET status = 'sending', updated_at = now()
       WHERE id = $1 AND project_id = $2 AND status = 'pending'
       RETURNING id`,
      [checkpointId, projectId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markAccepted(projectId: string, checkpointId: string, bytesAccepted: number) {
    const result = await this.pool.query(
      `UPDATE aidilam_app.youtube_upload_checkpoints
       SET status = 'accepted', bytes_accepted = $3, updated_at = now()
       WHERE id = $1 AND project_id = $2 AND status IN ('sending', 'pending')
       RETURNING id, byte_start, byte_end, bytes_accepted`,
      [checkpointId, projectId, bytesAccepted]
    );
    return result.rows[0] || null;
  }

  async markRetryableFailed(projectId: string, checkpointId: string) {
    const result = await this.pool.query(
      `UPDATE aidilam_app.youtube_upload_checkpoints
       SET status = 'retryable_failed', retry_count = retry_count + 1, updated_at = now()
       WHERE id = $1 AND project_id = $2 AND status IN ('sending', 'pending')
       RETURNING id, retry_count`,
      [checkpointId, projectId]
    );
    return result.rows[0] || null;
  }

  async markPermanentFailed(projectId: string, checkpointId: string) {
    const result = await this.pool.query(
      `UPDATE aidilam_app.youtube_upload_checkpoints
       SET status = 'permanent_failed', updated_at = now()
       WHERE id = $1 AND project_id = $2 AND status IN ('sending', 'pending')
       RETURNING id`,
      [checkpointId, projectId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async supersede(projectId: string, checkpointId: string) {
    const result = await this.pool.query(
      `UPDATE aidilam_app.youtube_upload_checkpoints
       SET status = 'superseded', updated_at = now()
       WHERE id = $1 AND project_id = $2 AND status NOT IN ('accepted','superseded')
       RETURNING id`,
      [checkpointId, projectId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listOrdered(projectId: string, uploadSessionId: string) {
    const result = await this.pool.query(
      `SELECT * FROM aidilam_app.youtube_upload_checkpoints
       WHERE upload_session_id = $1 AND project_id = $2
       ORDER BY byte_start ASC`,
      [uploadSessionId, projectId]
    );
    return result.rows;
  }

  async findLastAccepted(projectId: string, uploadSessionId: string) {
    const result = await this.pool.query(
      `SELECT * FROM aidilam_app.youtube_upload_checkpoints
       WHERE upload_session_id = $1 AND project_id = $2 AND status = 'accepted'
       ORDER BY byte_start DESC LIMIT 1`,
      [uploadSessionId, projectId]
    );
    return result.rows[0] || null;
  }
}
