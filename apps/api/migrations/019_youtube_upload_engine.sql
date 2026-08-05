-- Migration 019: YouTube Resumable Upload Engine
-- AIDILAM-DEP-016A4
-- Adds persistence for upload sessions and checkpoints.
-- NO raw upload-session URIs stored — only vault/secret references.
-- Rollback: DROP TABLE aidilam_app.youtube_upload_checkpoints; DROP TABLE aidilam_app.youtube_upload_sessions;

-- YouTube Upload Sessions
CREATE TABLE IF NOT EXISTS aidilam_app.youtube_upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
  publishing_job_id uuid NOT NULL,
  publishing_attempt_id uuid NOT NULL,
  platform_account_id uuid NOT NULL,
  credential_binding_id uuid NOT NULL REFERENCES aidilam_app.youtube_credential_bindings(id),
  upload_session_secret_reference text NOT NULL,  -- vault reference (NEVER raw session URI)
  total_bytes bigint NOT NULL CHECK (total_bytes > 0),
  uploaded_bytes bigint NOT NULL DEFAULT 0 CHECK (uploaded_bytes >= 0),
  next_byte_offset bigint NOT NULL DEFAULT 0 CHECK (next_byte_offset >= 0),
  chunk_size integer NOT NULL CHECK (chunk_size >= 262144 AND chunk_size <= 67108864),
  media_checksum text NOT NULL,
  status text NOT NULL DEFAULT 'initializing' CHECK (status IN (
    'initializing','ready','uploading','interrupted','retry_wait',
    'completing','uploaded','expired','cancelled','failed','reconciliation_required'
  )),
  idempotency_key text NOT NULL,
  expires_at timestamptz NOT NULL,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- One active session per logical upload (job+attempt combination)
  CONSTRAINT uq_upload_session_idempotency UNIQUE (project_id, idempotency_key),
  CONSTRAINT chk_uploaded_le_total CHECK (uploaded_bytes <= total_bytes),
  CONSTRAINT chk_offset_le_total CHECK (next_byte_offset <= total_bytes)
);

CREATE INDEX idx_upload_sessions_project ON aidilam_app.youtube_upload_sessions(project_id);
CREATE INDEX idx_upload_sessions_job ON aidilam_app.youtube_upload_sessions(publishing_job_id);
CREATE INDEX idx_upload_sessions_status ON aidilam_app.youtube_upload_sessions(status) WHERE status IN ('uploading','interrupted','retry_wait','reconciliation_required');
CREATE INDEX idx_upload_sessions_expiry ON aidilam_app.youtube_upload_sessions(expires_at) WHERE status NOT IN ('uploaded','cancelled','failed','expired');
CREATE INDEX idx_upload_sessions_active ON aidilam_app.youtube_upload_sessions(project_id, publishing_job_id, publishing_attempt_id) WHERE status NOT IN ('uploaded','cancelled','failed','expired');

-- YouTube Upload Checkpoints
CREATE TABLE IF NOT EXISTS aidilam_app.youtube_upload_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
  upload_session_id uuid NOT NULL REFERENCES aidilam_app.youtube_upload_sessions(id),
  byte_start bigint NOT NULL CHECK (byte_start >= 0),
  byte_end bigint NOT NULL CHECK (byte_end > 0),
  bytes_accepted bigint NOT NULL DEFAULT 0 CHECK (bytes_accepted >= 0),
  chunk_checksum text NOT NULL,
  transport_request_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','sending','accepted','retryable_failed','permanent_failed','superseded'
  )),
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_byte_range CHECK (byte_end > byte_start),
  CONSTRAINT chk_accepted_le_range CHECK (bytes_accepted <= (byte_end - byte_start))
);

CREATE INDEX idx_upload_checkpoints_session ON aidilam_app.youtube_upload_checkpoints(upload_session_id);
CREATE INDEX idx_upload_checkpoints_project ON aidilam_app.youtube_upload_checkpoints(project_id);
CREATE INDEX idx_upload_checkpoints_ordered ON aidilam_app.youtube_upload_checkpoints(upload_session_id, byte_start ASC);
CREATE INDEX idx_upload_checkpoints_accepted ON aidilam_app.youtube_upload_checkpoints(upload_session_id) WHERE status = 'accepted';
