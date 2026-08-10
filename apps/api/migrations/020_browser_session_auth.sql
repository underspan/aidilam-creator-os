-- Migration 020: Browser Session Authentication
-- AIDILAM-VIDEOMVP-004R3
-- Adds password_hash to users, creates browser_sessions table.

-- Add password hash column to users
ALTER TABLE aidilam_app.users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE aidilam_app.users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;
ALTER TABLE aidilam_app.users ADD COLUMN IF NOT EXISTS force_password_reset boolean NOT NULL DEFAULT false;

-- Browser sessions (server-side, opaque ID in cookie)
CREATE TABLE IF NOT EXISTS aidilam_app.browser_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES aidilam_app.users(id),
  auth_method text NOT NULL DEFAULT 'password' CHECK (auth_method IN ('password', 'oidc', 'bootstrap')),
  csrf_token_hash text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  source_ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_browser_sessions_user ON aidilam_app.browser_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_browser_sessions_expiry ON aidilam_app.browser_sessions(expires_at) WHERE revoked_at IS NULL;

-- Rollback: DROP TABLE aidilam_app.browser_sessions; ALTER TABLE aidilam_app.users DROP COLUMN password_hash, DROP COLUMN password_changed_at, DROP COLUMN force_password_reset;
