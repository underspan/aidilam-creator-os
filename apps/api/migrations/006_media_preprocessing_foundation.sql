-- Migration: 006_media_preprocessing_foundation
-- Task: AIDILAM-DEP-009
-- Description: Media processing profiles, operations tracking, and derived asset columns
-- Forward-only: no down migration in production

BEGIN;

-- =============================================================================
-- 1. Table: media_processing_profiles
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.media_processing_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    media_kind text NOT NULL CHECK (media_kind IN ('image', 'video', 'audio', 'subtitle')),
    version integer NOT NULL DEFAULT 1,
    operation_type text NOT NULL CHECK (operation_type IN ('normalize', 'thumbnail', 'proxy', 'preview', 'waveform', 'poster')),
    configuration_json jsonb NOT NULL DEFAULT '{}',
    configuration_hash text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 2. Table: media_operations
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.media_operations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    source_asset_id uuid NOT NULL REFERENCES aidilam_app.assets(id),
    profile_id uuid NOT NULL REFERENCES aidilam_app.media_processing_profiles(id),
    job_id uuid REFERENCES aidilam_app.jobs(id),
    status text NOT NULL DEFAULT 'requested' CHECK (status IN (
        'requested', 'queued', 'running', 'succeeded', 'failed',
        'cancel_requested', 'cancelled', 'timed_out', 'dead_letter'
    )),
    input_checksum text,
    configuration_hash text NOT NULL,
    progress_percent integer DEFAULT 0,
    started_at timestamptz,
    completed_at timestamptz,
    error_code text,
    error_message text,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_media_operations_project_source_profile
    ON aidilam_app.media_operations (project_id, source_asset_id, profile_id);

CREATE INDEX IF NOT EXISTS idx_media_operations_status
    ON aidilam_app.media_operations (status);

CREATE INDEX IF NOT EXISTS idx_media_operations_job_id
    ON aidilam_app.media_operations (job_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_media_operations_idempotency
    ON aidilam_app.media_operations (project_id, source_asset_id, profile_id, configuration_hash)
    WHERE status IN ('requested', 'queued', 'running', 'succeeded');

-- =============================================================================
-- 3. Add derived asset columns to assets (IF NOT EXISTS)
-- =============================================================================

ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS source_asset_id uuid REFERENCES aidilam_app.assets(id);
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS derived_from_operation_id uuid;
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS asset_role text DEFAULT 'source'
    CHECK (asset_role IN ('source', 'normalized', 'proxy', 'thumbnail', 'preview', 'waveform', 'poster'));
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS profile_code text;
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS profile_version integer;
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS configuration_hash text;

-- =============================================================================
-- 4. Seed initial processing profiles
-- =============================================================================

INSERT INTO aidilam_app.media_processing_profiles (code, name, media_kind, operation_type, configuration_json, configuration_hash)
VALUES
    ('image_normalize_v1', 'Image Normalize', 'image', 'normalize',
     '{"maxWidth":4096,"maxHeight":4096,"quality":90,"stripExif":true}',
     md5('{"maxWidth":4096,"maxHeight":4096,"quality":90,"stripExif":true}')),

    ('image_thumbnail_v1', 'Image Thumbnail', 'image', 'thumbnail',
     '{"maxWidth":512,"maxHeight":512,"quality":80,"format":"jpeg"}',
     md5('{"maxWidth":512,"maxHeight":512,"quality":80,"format":"jpeg"}')),

    ('audio_normalize_v1', 'Audio Normalize', 'audio', 'normalize',
     '{"sampleRate":48000,"channels":2,"codec":"aac","bitrate":"128k","loudness":"-16"}',
     md5('{"sampleRate":48000,"channels":2,"codec":"aac","bitrate":"128k","loudness":"-16"}')),

    ('audio_waveform_v1', 'Audio Waveform', 'audio', 'waveform',
     '{"width":1200,"height":200,"color":"#4A90D9","format":"png"}',
     md5('{"width":1200,"height":200,"color":"#4A90D9","format":"png"}')),

    ('video_proxy_v1', 'Video Proxy', 'video', 'proxy',
     '{"maxHeight":1080,"codec":"libx264","preset":"medium","crf":23,"audioCodec":"aac","audioBitrate":"128k","pixFmt":"yuv420p","movflags":"+faststart"}',
     md5('{"maxHeight":1080,"codec":"libx264","preset":"medium","crf":23,"audioCodec":"aac","audioBitrate":"128k","pixFmt":"yuv420p","movflags":"+faststart"}')),

    ('video_thumbnail_v1', 'Video Thumbnail', 'video', 'thumbnail',
     '{"maxWidth":1280,"maxHeight":720,"seekPercent":10,"format":"jpeg","quality":80}',
     md5('{"maxWidth":1280,"maxHeight":720,"seekPercent":10,"format":"jpeg","quality":80}')),

    ('video_portrait_preview_v1', 'Portrait Preview', 'video', 'preview',
     '{"width":1080,"height":1920,"duration":15,"codec":"libx264","crf":23,"crop":"center"}',
     md5('{"width":1080,"height":1920,"duration":15,"codec":"libx264","crf":23,"crop":"center"}')),

    ('video_square_preview_v1', 'Square Preview', 'video', 'preview',
     '{"width":1080,"height":1080,"duration":15,"codec":"libx264","crf":23,"crop":"center"}',
     md5('{"width":1080,"height":1080,"duration":15,"codec":"libx264","crf":23,"crop":"center"}'))
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- 5. Grant permissions to aidilam_runtime
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON aidilam_app.media_processing_profiles TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE ON aidilam_app.media_operations TO aidilam_runtime;

COMMIT;
