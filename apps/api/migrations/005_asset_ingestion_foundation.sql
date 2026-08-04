-- Migration: 005_asset_ingestion_foundation
-- Task: AIDILAM-DEP-008
-- Description: Extend assets table for ingestion workflow, add upload sessions
-- Applied to: aidilam_app.assets, new table aidilam_app.asset_upload_sessions
-- Forward-only: no down migration in production

BEGIN;

-- =============================================================================
-- 1. Add new columns to assets (IF NOT EXISTS for safety)
-- =============================================================================

ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS storage_provider text DEFAULT 'minio';
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS upload_expires_at timestamptz;
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS expected_size_bytes bigint;
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS actual_size_bytes bigint;
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS client_content_type text;
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS detected_content_type text;
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS media_kind text;
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS etag text;
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS width integer;
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS height integer;
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS duration_ms integer;
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS frame_rate numeric;
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS video_codec text;
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS audio_codec text;
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS audio_channels integer;
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS sample_rate integer;
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS metadata_json jsonb;
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS validation_error_code text;
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS validation_error_message text;
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS validated_at timestamptz;
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS available_at timestamptz;
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- =============================================================================
-- 2. Drop and recreate status CHECK to include ingestion states
-- =============================================================================

ALTER TABLE aidilam_app.assets DROP CONSTRAINT IF EXISTS assets_status_check;
ALTER TABLE aidilam_app.assets DROP CONSTRAINT IF EXISTS chk_assets_status;

ALTER TABLE aidilam_app.assets ADD CONSTRAINT assets_status_check
    CHECK (status IN (
        'pending_upload',
        'uploaded',
        'validating',
        'available',
        'rejected',
        'quarantined',
        'deleting',
        'deleted',
        'failed'
    ));

-- Update existing rows with old 'pending' status to new 'pending_upload'
UPDATE aidilam_app.assets SET status = 'pending_upload' WHERE status = 'pending';
-- Update existing rows with old 'processing' status to new 'validating'
UPDATE aidilam_app.assets SET status = 'validating' WHERE status = 'processing';

-- =============================================================================
-- 3. Drop and recreate size_bytes CHECK to allow >= 0 (or NULL)
-- =============================================================================

ALTER TABLE aidilam_app.assets DROP CONSTRAINT IF EXISTS assets_size_bytes_check;
ALTER TABLE aidilam_app.assets DROP CONSTRAINT IF EXISTS chk_assets_size_bytes;

ALTER TABLE aidilam_app.assets ADD CONSTRAINT assets_size_bytes_check
    CHECK (size_bytes IS NULL OR size_bytes >= 0);

-- =============================================================================
-- 4. Add constraints for media dimensions
-- =============================================================================

ALTER TABLE aidilam_app.assets DROP CONSTRAINT IF EXISTS chk_assets_width;
ALTER TABLE aidilam_app.assets ADD CONSTRAINT chk_assets_width
    CHECK (width IS NULL OR width > 0);

ALTER TABLE aidilam_app.assets DROP CONSTRAINT IF EXISTS chk_assets_height;
ALTER TABLE aidilam_app.assets ADD CONSTRAINT chk_assets_height
    CHECK (height IS NULL OR height > 0);

ALTER TABLE aidilam_app.assets DROP CONSTRAINT IF EXISTS chk_assets_duration_ms;
ALTER TABLE aidilam_app.assets ADD CONSTRAINT chk_assets_duration_ms
    CHECK (duration_ms IS NULL OR duration_ms >= 0);

-- =============================================================================
-- 5. Add media_kind CHECK constraint
-- =============================================================================

ALTER TABLE aidilam_app.assets DROP CONSTRAINT IF EXISTS chk_assets_media_kind;
ALTER TABLE aidilam_app.assets ADD CONSTRAINT chk_assets_media_kind
    CHECK (media_kind IS NULL OR media_kind IN (
        'image', 'video', 'audio', 'subtitle', 'document', 'other'
    ));

-- =============================================================================
-- 6. Create asset_upload_sessions table
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.asset_upload_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id uuid NOT NULL REFERENCES aidilam_app.assets(id),
    actor_id text NOT NULL,
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'completed', 'expired', 'revoked')),
    expected_size_bytes bigint,
    expected_content_type text,
    object_key text NOT NULL,
    expires_at timestamptz NOT NULL,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_upload_sessions_asset
    ON aidilam_app.asset_upload_sessions (asset_id);

CREATE INDEX IF NOT EXISTS idx_upload_sessions_status
    ON aidilam_app.asset_upload_sessions (status);

-- =============================================================================
-- 7. Grant permissions to runtime role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON aidilam_app.assets TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE ON aidilam_app.asset_upload_sessions TO aidilam_runtime;

COMMIT;
