-- Migration 018: YouTube OAuth Foundation
-- AIDILAM-DEP-016A3
-- Adds persistence for YouTube OAuth client config, authorization sessions, and credential bindings.
-- NO raw tokens stored — only vault references.

-- YouTube OAuth Client Configuration
CREATE TABLE IF NOT EXISTS aidilam_app.youtube_oauth_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
  display_name text NOT NULL,
  client_id_reference text NOT NULL,         -- public identifier (safe to log)
  client_secret_reference text NOT NULL,     -- vault reference (NEVER raw secret)
  redirect_uri text,                          -- null = fail-closed
  audience text NOT NULL DEFAULT 'external' CHECK (audience IN ('internal', 'external')),
  publishing_status text NOT NULL DEFAULT 'testing' CHECK (publishing_status IN ('testing', 'published')),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_youtube_oauth_clients_project ON aidilam_app.youtube_oauth_clients(project_id);

-- YouTube Authorization Sessions (temporary, expire quickly)
CREATE TABLE IF NOT EXISTS aidilam_app.youtube_oauth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
  platform_account_id uuid NOT NULL,
  state_hash text NOT NULL,                   -- SHA-256 of random state (NEVER raw state)
  pkce_verifier_reference text,               -- vault reference (NEVER raw verifier)
  redirect_uri text NOT NULL,
  requested_scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','redirect_ready','callback_received','token_exchange_pending','authorized','expired','rejected','failed','consumed')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_youtube_oauth_sessions_project ON aidilam_app.youtube_oauth_sessions(project_id);
CREATE INDEX idx_youtube_oauth_sessions_state ON aidilam_app.youtube_oauth_sessions(state_hash);
CREATE INDEX idx_youtube_oauth_sessions_expiry ON aidilam_app.youtube_oauth_sessions(expires_at) WHERE status IN ('created','redirect_ready');

-- YouTube Credential Bindings
CREATE TABLE IF NOT EXISTS aidilam_app.youtube_credential_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
  platform_account_id uuid NOT NULL,
  google_subject_hash text NOT NULL,          -- hashed Google sub (NEVER raw)
  channel_id text NOT NULL,                   -- public YouTube channel ID
  channel_title text NOT NULL,
  credential_reference text NOT NULL,         -- vault reference to refresh token (NEVER raw token)
  scope_set text[] NOT NULL DEFAULT '{}',
  authorized_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','expired','revoked','reauthorization_required','disabled')),
  last_validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT youtube_credential_bindings_unique_active UNIQUE (project_id, platform_account_id) 
);
CREATE INDEX idx_youtube_credential_bindings_project ON aidilam_app.youtube_credential_bindings(project_id);
CREATE INDEX idx_youtube_credential_bindings_account ON aidilam_app.youtube_credential_bindings(platform_account_id);

-- YouTube OAuth Audit Events
CREATE TABLE IF NOT EXISTS aidilam_app.youtube_oauth_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
  event_type text NOT NULL,
  actor_type text NOT NULL DEFAULT 'user',
  actor_id text,
  platform_account_id uuid,
  session_id uuid,
  binding_id uuid,
  status text,
  reason_code text,
  metadata_safe_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_youtube_oauth_audit_project ON aidilam_app.youtube_oauth_audit_events(project_id);
CREATE INDEX idx_youtube_oauth_audit_type ON aidilam_app.youtube_oauth_audit_events(event_type);

-- Register YouTube OAuth permissions
INSERT INTO aidilam_app.permissions (id, code, description) VALUES
  (gen_random_uuid(), 'youtube.oauth.configure', 'Configure YouTube OAuth client'),
  (gen_random_uuid(), 'youtube.oauth.authorize', 'Authorize YouTube channel'),
  (gen_random_uuid(), 'youtube.oauth.view', 'View YouTube OAuth status'),
  (gen_random_uuid(), 'youtube.oauth.revoke', 'Revoke YouTube credentials'),
  (gen_random_uuid(), 'youtube.account.bind', 'Bind YouTube account/channel')
ON CONFLICT DO NOTHING;

-- Grant YouTube OAuth permissions to system_admin
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM aidilam_app.roles r, aidilam_app.permissions p
WHERE r.code = 'system_admin' AND p.code LIKE 'youtube.%'
ON CONFLICT DO NOTHING;

-- Rollback notes:
-- DROP TABLE IF EXISTS aidilam_app.youtube_oauth_audit_events;
-- DROP TABLE IF EXISTS aidilam_app.youtube_credential_bindings;
-- DROP TABLE IF EXISTS aidilam_app.youtube_oauth_sessions;
-- DROP TABLE IF EXISTS aidilam_app.youtube_oauth_clients;
-- DELETE FROM aidilam_app.role_permissions WHERE permission_id IN (SELECT id FROM aidilam_app.permissions WHERE code LIKE 'youtube.%');
-- DELETE FROM aidilam_app.permissions WHERE code LIKE 'youtube.%';
