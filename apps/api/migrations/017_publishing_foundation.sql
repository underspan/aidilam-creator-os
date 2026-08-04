-- Migration: 017_publishing_foundation
-- Task: AIDILAM-DEP-015A
-- Description: Publishing platform registry, accounts, destinations, profiles, jobs, plans, attempts, usage, reservations, audit
-- Forward-only: no down migration in production

BEGIN;

-- =============================================================================
-- 1. Table: publishing_platforms
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.publishing_platforms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_key text NOT NULL UNIQUE,
    display_name text NOT NULL,
    adapter_key text NOT NULL UNIQUE,
    is_enabled boolean NOT NULL DEFAULT false,
    capabilities_json jsonb NOT NULL DEFAULT '{}',
    limits_json jsonb NOT NULL DEFAULT '{}',
    metadata_schema_version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT publishing_platforms_key_lowercase CHECK (platform_key = lower(platform_key))
);

CREATE TRIGGER trg_publishing_platforms_updated_at BEFORE UPDATE ON aidilam_app.publishing_platforms
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();

-- =============================================================================
-- 2. Table: publishing_accounts
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.publishing_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    platform_id uuid NOT NULL REFERENCES aidilam_app.publishing_platforms(id),
    display_name text NOT NULL,
    external_account_reference text,
    account_type text NOT NULL DEFAULT 'page',
    status text NOT NULL DEFAULT 'draft',
    credential_reference text,
    capabilities_snapshot_json jsonb NOT NULL DEFAULT '{}',
    last_validated_at timestamptz,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT publishing_accounts_status_check CHECK (status IN ('draft', 'validation_only', 'active', 'disabled', 'revoked', 'error'))
);

CREATE INDEX idx_publishing_accounts_project ON aidilam_app.publishing_accounts(project_id);
CREATE INDEX idx_publishing_accounts_project_platform ON aidilam_app.publishing_accounts(project_id, platform_id);
CREATE INDEX idx_publishing_accounts_project_status ON aidilam_app.publishing_accounts(project_id, status);

CREATE TRIGGER trg_publishing_accounts_updated_at BEFORE UPDATE ON aidilam_app.publishing_accounts
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();

-- =============================================================================
-- 3. Table: publishing_destinations
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.publishing_destinations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    publishing_account_id uuid NOT NULL REFERENCES aidilam_app.publishing_accounts(id),
    destination_type text NOT NULL DEFAULT 'page',
    display_name text NOT NULL,
    external_destination_reference text,
    status text NOT NULL DEFAULT 'draft',
    capabilities_snapshot_json jsonb NOT NULL DEFAULT '{}',
    default_privacy_json jsonb NOT NULL DEFAULT '{}',
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT publishing_destinations_status_check CHECK (status IN ('draft', 'validation_only', 'active', 'disabled', 'error'))
);

CREATE INDEX idx_publishing_destinations_project ON aidilam_app.publishing_destinations(project_id);
CREATE INDEX idx_publishing_destinations_account ON aidilam_app.publishing_destinations(publishing_account_id);

CREATE TRIGGER trg_publishing_destinations_updated_at BEFORE UPDATE ON aidilam_app.publishing_destinations
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();

-- =============================================================================
-- 4. Table: publishing_profiles
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.publishing_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    name text NOT NULL,
    description text,
    platform_id uuid NOT NULL REFERENCES aidilam_app.publishing_platforms(id),
    publishing_account_id uuid NOT NULL REFERENCES aidilam_app.publishing_accounts(id),
    publishing_destination_id uuid NOT NULL REFERENCES aidilam_app.publishing_destinations(id),
    caption_template text,
    hashtag_policy_json jsonb NOT NULL DEFAULT '{}',
    thumbnail_policy_json jsonb NOT NULL DEFAULT '{}',
    privacy_policy_json jsonb NOT NULL DEFAULT '{}',
    schedule_policy_json jsonb NOT NULL DEFAULT '{}',
    retry_policy_json jsonb NOT NULL DEFAULT '{"maxAttempts": 3, "backoffMs": 5000, "backoffMultiplier": 2}',
    quota_policy_json jsonb NOT NULL DEFAULT '{}',
    is_validation_only boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_publishing_profiles_project ON aidilam_app.publishing_profiles(project_id);
CREATE INDEX idx_publishing_profiles_project_platform ON aidilam_app.publishing_profiles(project_id, platform_id);

CREATE TRIGGER trg_publishing_profiles_updated_at BEFORE UPDATE ON aidilam_app.publishing_profiles
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();

-- =============================================================================
-- 5. Table: publishing_jobs
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.publishing_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    publishing_profile_id uuid NOT NULL REFERENCES aidilam_app.publishing_profiles(id),
    source_asset_id uuid NOT NULL REFERENCES aidilam_app.assets(id),
    status text NOT NULL DEFAULT 'draft',
    scheduled_at timestamptz,
    idempotency_key text NOT NULL,
    current_attempt integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 3,
    progress_percent integer NOT NULL DEFAULT 0,
    current_stage text,
    external_publish_id text,
    published_url_safe text,
    error_code text,
    error_message_safe text,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    queued_at timestamptz,
    started_at timestamptz,
    completed_at timestamptz,
    cancel_requested_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT publishing_jobs_status_check CHECK (status IN ('draft', 'scheduled', 'queued', 'publishing', 'retry_wait', 'cancel_requested', 'cancelled', 'succeeded', 'failed')),
    CONSTRAINT publishing_jobs_progress_check CHECK (progress_percent BETWEEN 0 AND 100),
    CONSTRAINT publishing_jobs_attempts_check CHECK (current_attempt >= 0 AND max_attempts >= 1),
    CONSTRAINT publishing_jobs_idempotency_unique UNIQUE (project_id, idempotency_key)
);

CREATE INDEX idx_publishing_jobs_project_status ON aidilam_app.publishing_jobs(project_id, status);
CREATE INDEX idx_publishing_jobs_project_scheduled ON aidilam_app.publishing_jobs(project_id, scheduled_at);
CREATE INDEX idx_publishing_jobs_status_scheduled ON aidilam_app.publishing_jobs(status, scheduled_at);

CREATE TRIGGER trg_publishing_jobs_updated_at BEFORE UPDATE ON aidilam_app.publishing_jobs
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();

-- =============================================================================
-- 6. Table: publishing_plans
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.publishing_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    publishing_job_id uuid NOT NULL REFERENCES aidilam_app.publishing_jobs(id),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    plan_version integer NOT NULL DEFAULT 1,
    platform_snapshot_json jsonb NOT NULL DEFAULT '{}',
    account_snapshot_json jsonb NOT NULL DEFAULT '{}',
    destination_snapshot_json jsonb NOT NULL DEFAULT '{}',
    source_asset_snapshot_json jsonb NOT NULL DEFAULT '{}',
    content_snapshot_json jsonb NOT NULL DEFAULT '{}',
    schedule_snapshot_json jsonb NOT NULL DEFAULT '{}',
    retry_snapshot_json jsonb NOT NULL DEFAULT '{}',
    quota_snapshot_json jsonb NOT NULL DEFAULT '{}',
    adapter_snapshot_json jsonb NOT NULL DEFAULT '{}',
    request_fingerprint text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_publishing_plans_job ON aidilam_app.publishing_plans(publishing_job_id);

-- =============================================================================
-- 7. Table: publishing_attempts
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.publishing_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    publishing_job_id uuid NOT NULL REFERENCES aidilam_app.publishing_jobs(id),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    attempt_number integer NOT NULL,
    status text NOT NULL DEFAULT 'queued',
    adapter_key text NOT NULL,
    started_at timestamptz,
    completed_at timestamptz,
    external_publish_id text,
    published_url_safe text,
    http_status_safe integer,
    platform_error_code_safe text,
    error_code text,
    error_message_safe text,
    request_fingerprint text,
    response_fingerprint text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT publishing_attempts_status_check CHECK (status IN ('queued', 'running', 'retryable_failed', 'permanent_failed', 'cancelled', 'succeeded')),
    CONSTRAINT publishing_attempts_unique UNIQUE (publishing_job_id, attempt_number)
);

CREATE INDEX idx_publishing_attempts_job ON aidilam_app.publishing_attempts(publishing_job_id);

-- =============================================================================
-- 8. Table: publishing_usage_records
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.publishing_usage_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    publishing_job_id uuid NOT NULL REFERENCES aidilam_app.publishing_jobs(id) UNIQUE,
    publishing_attempt_id uuid REFERENCES aidilam_app.publishing_attempts(id),
    platform_id uuid NOT NULL REFERENCES aidilam_app.publishing_platforms(id),
    publish_operations integer NOT NULL DEFAULT 1,
    platform_requests integer NOT NULL DEFAULT 0,
    upload_bytes bigint NOT NULL DEFAULT 0,
    quota_units numeric NOT NULL DEFAULT 1,
    estimated_cost numeric NOT NULL DEFAULT 0,
    committed_cost numeric,
    pricing_version text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_publishing_usage_project ON aidilam_app.publishing_usage_records(project_id);

-- =============================================================================
-- 9. Table: publishing_quota_reservations
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.publishing_quota_reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    publishing_job_id uuid NOT NULL REFERENCES aidilam_app.publishing_jobs(id) UNIQUE,
    status text NOT NULL DEFAULT 'reserved',
    reserved_publish_operations integer NOT NULL DEFAULT 1,
    reserved_platform_requests integer NOT NULL DEFAULT 0,
    reserved_upload_bytes bigint NOT NULL DEFAULT 0,
    reserved_quota_units numeric NOT NULL DEFAULT 1,
    reserved_cost numeric NOT NULL DEFAULT 0,
    committed_cost numeric,
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 minutes'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    settled_at timestamptz,
    CONSTRAINT publishing_quota_reservations_status_check CHECK (status IN ('reserved', 'committed', 'released', 'expired'))
);

CREATE INDEX idx_publishing_quota_project_status ON aidilam_app.publishing_quota_reservations(project_id, status);

CREATE TRIGGER trg_publishing_quota_reservations_updated_at BEFORE UPDATE ON aidilam_app.publishing_quota_reservations
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();

-- =============================================================================
-- 10. Table: publishing_audit_events
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.publishing_audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    publishing_job_id uuid,
    publishing_attempt_id uuid,
    event_type text NOT NULL,
    actor_type text NOT NULL DEFAULT 'system',
    actor_id text,
    metadata_safe_json jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_publishing_audit_project ON aidilam_app.publishing_audit_events(project_id);
CREATE INDEX idx_publishing_audit_job ON aidilam_app.publishing_audit_events(publishing_job_id);

-- =============================================================================
-- 11. Seed: Platform Registry
-- =============================================================================

INSERT INTO aidilam_app.publishing_platforms (platform_key, display_name, adapter_key, is_enabled, capabilities_json, limits_json) VALUES
  ('facebook', 'Facebook', 'mock-facebook', true, '{"video_upload":true,"scheduled_publish":true,"caption":true,"hashtags":true,"thumbnail":true,"privacy":true,"destination_selection":true,"first_comment":true,"geo":false,"music_reference":false,"short_video":false,"playlist":false}', '{"max_video_duration_ms":14400000,"max_file_size_bytes":10737418240,"max_caption_length":63206,"max_hashtags":30,"min_video_duration_ms":1000}'),
  ('tiktok', 'TikTok', 'mock-tiktok', true, '{"video_upload":true,"short_video":true,"scheduled_publish":true,"caption":true,"hashtags":true,"thumbnail":false,"privacy":true,"destination_selection":false,"first_comment":false,"geo":true,"music_reference":true,"playlist":false}', '{"max_video_duration_ms":600000,"max_file_size_bytes":4294967296,"max_caption_length":4000,"max_hashtags":100,"min_video_duration_ms":1000}'),
  ('youtube', 'YouTube', 'mock-youtube', true, '{"video_upload":true,"scheduled_publish":true,"caption":true,"hashtags":true,"thumbnail":true,"privacy":true,"destination_selection":true,"first_comment":false,"geo":false,"music_reference":false,"short_video":true,"playlist":true}', '{"max_video_duration_ms":43200000,"max_file_size_bytes":137438953472,"max_caption_length":5000,"max_hashtags":500,"min_video_duration_ms":1000}'),
  ('douyin', 'Douyin', 'mock-douyin', true, '{"video_upload":true,"short_video":true,"scheduled_publish":true,"caption":true,"hashtags":true,"thumbnail":false,"privacy":true,"destination_selection":false,"first_comment":false,"geo":true,"music_reference":true,"playlist":false}', '{"max_video_duration_ms":900000,"max_file_size_bytes":4294967296,"max_caption_length":4000,"max_hashtags":50,"min_video_duration_ms":1000}'),
  ('bilibili', 'Bilibili', 'mock-bilibili', true, '{"video_upload":true,"scheduled_publish":true,"caption":true,"hashtags":true,"thumbnail":true,"privacy":false,"destination_selection":true,"first_comment":false,"geo":false,"music_reference":false,"short_video":false,"playlist":true}', '{"max_video_duration_ms":28800000,"max_file_size_bytes":8589934592,"max_caption_length":2000,"max_hashtags":12,"min_video_duration_ms":1000}'),
  ('xiaohongshu', 'Xiaohongshu', 'mock-xiaohongshu', true, '{"video_upload":true,"short_video":true,"scheduled_publish":false,"caption":true,"hashtags":true,"thumbnail":true,"privacy":false,"destination_selection":false,"first_comment":false,"geo":true,"music_reference":true,"playlist":false}', '{"max_video_duration_ms":900000,"max_file_size_bytes":4294967296,"max_caption_length":1000,"max_hashtags":20,"min_video_duration_ms":1000}')
ON CONFLICT (platform_key) DO NOTHING;

-- =============================================================================
-- 12. Permissions
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.publishing_platforms TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.publishing_accounts TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.publishing_destinations TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.publishing_profiles TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.publishing_jobs TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.publishing_plans TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.publishing_attempts TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.publishing_usage_records TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.publishing_quota_reservations TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.publishing_audit_events TO aidilam_runtime;

COMMIT;
