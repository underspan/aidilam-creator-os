-- Migration: 007_subtitle_timeline_foundation
-- Task: AIDILAM-DEP-010
-- Description: Subtitle tracks, versions, cues, translation profiles, translation runs
-- Forward-only: no down migration in production

BEGIN;

-- =============================================================================
-- 1. Table: subtitle_tracks
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.subtitle_tracks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    media_asset_id uuid NOT NULL REFERENCES aidilam_app.assets(id),
    source_asset_id uuid NOT NULL REFERENCES aidilam_app.assets(id),
    language_code text NOT NULL,
    language_name text,
    track_kind text NOT NULL CHECK (track_kind IN ('original', 'translated', 'manual', 'generated')),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'parsing', 'ready', 'invalid', 'draft',
        'reviewed', 'approved', 'rejected', 'deleting', 'deleted'
    )),
    source_format text,
    is_default boolean DEFAULT false,
    is_forced boolean DEFAULT false,
    cue_count integer DEFAULT 0,
    duration_ms integer,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_subtitle_tracks_project_media
    ON aidilam_app.subtitle_tracks (project_id, media_asset_id);

-- =============================================================================
-- 2. Table: subtitle_versions
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.subtitle_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subtitle_track_id uuid NOT NULL REFERENCES aidilam_app.subtitle_tracks(id),
    version_number integer NOT NULL,
    parent_version_id uuid,
    version_type text NOT NULL CHECK (version_type IN (
        'original', 'normalized', 'translated', 'manual_edit', 'review_revision'
    )),
    language_code text NOT NULL,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'processing', 'ready', 'reviewed', 'approved',
        'rejected', 'superseded', 'failed'
    )),
    source_provider text,
    source_model text,
    translation_profile_id uuid,
    content_checksum text,
    cue_count integer DEFAULT 0,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    approved_by text,
    approved_at timestamptz,
    UNIQUE (subtitle_track_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_subtitle_versions_track
    ON aidilam_app.subtitle_versions (subtitle_track_id);

-- =============================================================================
-- 3. Table: subtitle_cues
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.subtitle_cues (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subtitle_version_id uuid NOT NULL REFERENCES aidilam_app.subtitle_versions(id),
    cue_index integer NOT NULL,
    start_ms integer NOT NULL CHECK (start_ms >= 0),
    end_ms integer NOT NULL,
    duration_ms integer NOT NULL,
    text_plain text NOT NULL,
    text_format text,
    speaker_label text,
    position_json jsonb,
    style_json jsonb,
    source_cue_identifier text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (end_ms > start_ms),
    CHECK (duration_ms = end_ms - start_ms),
    UNIQUE (subtitle_version_id, cue_index)
);

CREATE INDEX IF NOT EXISTS idx_subtitle_cues_version_start
    ON aidilam_app.subtitle_cues (subtitle_version_id, start_ms);

-- =============================================================================
-- 4. Table: translation_profiles
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.translation_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    version integer NOT NULL DEFAULT 1,
    source_language text NOT NULL,
    target_language text NOT NULL,
    provider_code text NOT NULL,
    model_config_id uuid,
    prompt_template_id uuid,
    configuration_json jsonb NOT NULL DEFAULT '{}',
    configuration_hash text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 5. Table: translation_runs
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.translation_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    source_subtitle_version_id uuid NOT NULL REFERENCES aidilam_app.subtitle_versions(id),
    target_subtitle_version_id uuid REFERENCES aidilam_app.subtitle_versions(id),
    translation_profile_id uuid NOT NULL REFERENCES aidilam_app.translation_profiles(id),
    job_id uuid REFERENCES aidilam_app.jobs(id),
    status text NOT NULL DEFAULT 'requested' CHECK (status IN (
        'requested', 'queued', 'running', 'succeeded', 'failed',
        'cancel_requested', 'cancelled', 'timed_out', 'dead_letter'
    )),
    provider_code text,
    model_code text,
    input_checksum text,
    configuration_hash text,
    started_at timestamptz,
    completed_at timestamptz,
    error_code text,
    error_message text,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_translation_runs_project_source
    ON aidilam_app.translation_runs (project_id, source_subtitle_version_id);

-- =============================================================================
-- 6. Seed translation_profiles
-- =============================================================================

INSERT INTO aidilam_app.translation_profiles (code, name, source_language, target_language, provider_code, configuration_json, configuration_hash)
VALUES
    ('subtitle_zh_to_vi_v1', 'Chinese to Vietnamese', 'zh', 'vi', 'mock_deterministic',
     '{}', md5('{}')),
    ('subtitle_en_to_vi_v1', 'English to Vietnamese', 'en', 'vi', 'mock_deterministic',
     '{}', md5('{}'))
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- 7. Permissions
-- =============================================================================

INSERT INTO aidilam_app.permissions (code, resource, action, description) VALUES
    ('subtitles.create', 'subtitles', 'create', 'Create subtitle tracks'),
    ('subtitles.read', 'subtitles', 'read', 'View subtitle tracks and cues'),
    ('subtitles.edit', 'subtitles', 'edit', 'Edit subtitle cues'),
    ('subtitles.delete', 'subtitles', 'delete', 'Delete subtitle tracks'),
    ('subtitles.review', 'subtitles', 'review', 'Review subtitle versions'),
    ('subtitles.approve', 'subtitles', 'approve', 'Approve subtitle versions'),
    ('subtitles.translate', 'subtitles', 'translate', 'Request subtitle translation')
ON CONFLICT (code) DO NOTHING;

-- project_editor: create, read, edit, translate
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'project_editor'
AND p.code IN ('subtitles.create', 'subtitles.read', 'subtitles.edit', 'subtitles.translate')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- project_owner: all subtitle permissions
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'project_owner'
AND p.code IN ('subtitles.create', 'subtitles.read', 'subtitles.edit', 'subtitles.delete', 'subtitles.review', 'subtitles.approve', 'subtitles.translate')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- project_admin: all subtitle permissions
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'project_admin'
AND p.code IN ('subtitles.create', 'subtitles.read', 'subtitles.edit', 'subtitles.delete', 'subtitles.review', 'subtitles.approve', 'subtitles.translate')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- system_admin gets all new permissions automatically (already has CROSS JOIN)
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'system_admin'
AND p.code IN ('subtitles.create', 'subtitles.read', 'subtitles.edit', 'subtitles.delete', 'subtitles.review', 'subtitles.approve', 'subtitles.translate')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- service_worker: read + create (for translation jobs)
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'service_worker'
AND p.code IN ('subtitles.read', 'subtitles.create')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- project_viewer: read only
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'project_viewer'
AND p.code IN ('subtitles.read')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- 8. Grant permissions to aidilam_runtime
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON aidilam_app.subtitle_tracks TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE ON aidilam_app.subtitle_versions TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE ON aidilam_app.subtitle_cues TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE ON aidilam_app.translation_profiles TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE ON aidilam_app.translation_runs TO aidilam_runtime;

COMMIT;
