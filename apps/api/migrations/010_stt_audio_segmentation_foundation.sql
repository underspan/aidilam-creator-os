-- Migration: 010_stt_audio_segmentation_foundation
-- Task: AIDILAM-DEP-011
-- Description: Speech-to-Text foundation: profiles, transcription runs, segments, words, utterances
-- Forward-only: no down migration in production

BEGIN;

-- =============================================================================
-- 1. Table: stt_profiles
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.stt_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    version integer NOT NULL DEFAULT 1,
    provider_code text NOT NULL,
    source_language text,
    target_language text,
    audio_profile_code text DEFAULT 'stt_audio_prepare_v1',
    segmentation_profile_code text DEFAULT 'stt_segment_30s_v1',
    configuration_json jsonb NOT NULL DEFAULT '{}',
    configuration_hash text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 2. Table: transcription_runs
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.transcription_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    media_asset_id uuid NOT NULL REFERENCES aidilam_app.assets(id),
    audio_asset_id uuid REFERENCES aidilam_app.assets(id),
    stt_profile_id uuid NOT NULL REFERENCES aidilam_app.stt_profiles(id),
    job_id uuid REFERENCES aidilam_app.jobs(id),
    status text NOT NULL DEFAULT 'requested' CHECK (status IN (
        'requested', 'queued', 'preparing_audio', 'segmenting', 'transcribing',
        'assembling', 'succeeded', 'failed', 'cancel_requested', 'cancelled',
        'timed_out', 'dead_letter'
    )),
    source_language text,
    detected_language text,
    provider_code text,
    model_code text,
    input_checksum text,
    configuration_hash text NOT NULL,
    duration_ms integer,
    segment_count integer NOT NULL DEFAULT 0,
    word_count integer NOT NULL DEFAULT 0,
    utterance_count integer NOT NULL DEFAULT 0,
    started_at timestamptz,
    completed_at timestamptz,
    error_code text,
    error_message text,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_transcription_runs_project_media
    ON aidilam_app.transcription_runs (project_id, media_asset_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transcription_runs_active_unique
    ON aidilam_app.transcription_runs (project_id, media_asset_id, stt_profile_id, configuration_hash)
    WHERE status IN ('requested', 'queued', 'preparing_audio', 'segmenting', 'transcribing', 'assembling', 'succeeded');

-- =============================================================================
-- 3. Table: transcription_segments
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.transcription_segments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    transcription_run_id uuid NOT NULL REFERENCES aidilam_app.transcription_runs(id),
    segment_index integer NOT NULL,
    start_ms integer NOT NULL CHECK (start_ms >= 0),
    end_ms integer NOT NULL,
    duration_ms integer NOT NULL,
    audio_asset_id uuid REFERENCES aidilam_app.assets(id),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'ready', 'running', 'succeeded', 'failed', 'cancelled'
    )),
    checksum text,
    text_plain text,
    confidence numeric,
    detected_language text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (transcription_run_id, segment_index),
    CHECK (end_ms > start_ms)
);

-- =============================================================================
-- 4. Table: transcription_words
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.transcription_words (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    transcription_run_id uuid NOT NULL REFERENCES aidilam_app.transcription_runs(id),
    segment_id uuid NOT NULL REFERENCES aidilam_app.transcription_segments(id),
    word_index integer NOT NULL,
    start_ms integer NOT NULL CHECK (start_ms >= 0),
    end_ms integer NOT NULL,
    text_plain text NOT NULL,
    confidence numeric,
    speaker_label text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (segment_id, word_index),
    CHECK (end_ms >= start_ms)
);

CREATE INDEX IF NOT EXISTS idx_transcription_words_run
    ON aidilam_app.transcription_words (transcription_run_id);

-- =============================================================================
-- 5. Table: transcription_utterances
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.transcription_utterances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    transcription_run_id uuid NOT NULL REFERENCES aidilam_app.transcription_runs(id),
    utterance_index integer NOT NULL,
    start_ms integer NOT NULL CHECK (start_ms >= 0),
    end_ms integer NOT NULL,
    text_plain text NOT NULL,
    confidence numeric,
    speaker_label text,
    source_segment_start integer,
    source_segment_end integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (transcription_run_id, utterance_index),
    CHECK (end_ms > start_ms)
);

-- =============================================================================
-- 6. Seed stt_profiles
-- =============================================================================

INSERT INTO aidilam_app.stt_profiles (code, name, provider_code, source_language, target_language, configuration_hash)
VALUES
    ('stt_mock_auto_v1', 'Mock Auto STT', 'mock_deterministic', null, null, md5('{}')),
    ('stt_mock_zh_v1', 'Mock Chinese STT', 'mock_deterministic', 'zh', null, md5('{}')),
    ('stt_mock_en_v1', 'Mock English STT', 'mock_deterministic', 'en', null, md5('{}'))
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- 7. Permissions
-- =============================================================================

INSERT INTO aidilam_app.permissions (code, resource, action, description) VALUES
    ('transcriptions.create', 'transcriptions', 'create', 'Create transcription runs'),
    ('transcriptions.read', 'transcriptions', 'read', 'View transcription runs and results'),
    ('transcriptions.review', 'transcriptions', 'review', 'Review transcription results'),
    ('transcriptions.delete', 'transcriptions', 'delete', 'Delete transcription runs')
ON CONFLICT (code) DO NOTHING;

-- project_editor: create, read
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'project_editor'
AND p.code IN ('transcriptions.create', 'transcriptions.read')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- project_owner: all transcription permissions
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'project_owner'
AND p.code IN ('transcriptions.create', 'transcriptions.read', 'transcriptions.review', 'transcriptions.delete')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- project_admin: all transcription permissions
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'project_admin'
AND p.code IN ('transcriptions.create', 'transcriptions.read', 'transcriptions.review', 'transcriptions.delete')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- system_admin: all transcription permissions
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'system_admin'
AND p.code IN ('transcriptions.create', 'transcriptions.read', 'transcriptions.review', 'transcriptions.delete')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- service_worker: create + read (for worker jobs)
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'service_worker'
AND p.code IN ('transcriptions.create', 'transcriptions.read')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- project_viewer: read only
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'project_viewer'
AND p.code IN ('transcriptions.read')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- 8. Grant permissions to aidilam_runtime
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON aidilam_app.stt_profiles TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE ON aidilam_app.transcription_runs TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE ON aidilam_app.transcription_segments TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE ON aidilam_app.transcription_words TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE ON aidilam_app.transcription_utterances TO aidilam_runtime;

COMMIT;
