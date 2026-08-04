-- Migration: 016_render_pipeline_foundation
-- Task: AIDILAM-DEP-014
-- Description: Render profiles, subtitle styles, render runs, plans, usage, budgets
-- Forward-only: no down migration in production

BEGIN;

-- =============================================================================
-- 1. Table: subtitle_styles
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.subtitle_styles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid REFERENCES aidilam_app.projects(id),
    name text NOT NULL,
    font_family text NOT NULL DEFAULT 'Arial',
    font_size integer NOT NULL DEFAULT 24,
    font_weight text NOT NULL DEFAULT 'normal',
    primary_color text NOT NULL DEFAULT '&H00FFFFFF',
    outline_color text NOT NULL DEFAULT '&H00000000',
    outline_width numeric NOT NULL DEFAULT 2,
    shadow numeric NOT NULL DEFAULT 1,
    alignment integer NOT NULL DEFAULT 2,
    margin_left integer NOT NULL DEFAULT 20,
    margin_right integer NOT NULL DEFAULT 20,
    margin_vertical integer NOT NULL DEFAULT 40,
    background_enabled boolean NOT NULL DEFAULT false,
    background_color text NOT NULL DEFAULT '&H80000000',
    max_lines integer NOT NULL DEFAULT 2,
    safe_area_percent integer NOT NULL DEFAULT 90,
    validation_only boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_subtitle_styles_project ON aidilam_app.subtitle_styles(project_id);
CREATE TRIGGER trg_subtitle_styles_updated_at BEFORE UPDATE ON aidilam_app.subtitle_styles
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();

-- =============================================================================
-- 2. Table: render_profiles
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.render_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    name text NOT NULL,
    mode text NOT NULL DEFAULT 'subtitle_only',
    video_codec text NOT NULL DEFAULT 'libx264',
    audio_codec text NOT NULL DEFAULT 'aac',
    container_format text NOT NULL DEFAULT 'mp4',
    width integer,
    height integer,
    aspect_ratio text,
    frame_rate numeric,
    video_bitrate text,
    audio_bitrate text DEFAULT '128k',
    audio_sample_rate integer NOT NULL DEFAULT 48000,
    audio_channels integer NOT NULL DEFAULT 2,
    subtitle_style_id uuid REFERENCES aidilam_app.subtitle_styles(id),
    original_audio_policy text NOT NULL DEFAULT 'preserve',
    original_audio_gain numeric NOT NULL DEFAULT 1.0,
    tts_audio_gain numeric NOT NULL DEFAULT 1.0,
    normalization_policy text NOT NULL DEFAULT 'loudnorm',
    video_transform_config jsonb NOT NULL DEFAULT '{}',
    watermark_config jsonb NOT NULL DEFAULT '{}',
    output_naming_policy text NOT NULL DEFAULT 'auto',
    validation_only boolean NOT NULL DEFAULT false,
    is_default boolean NOT NULL DEFAULT false,
    version integer NOT NULL DEFAULT 1,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT render_profiles_mode_check CHECK (mode IN ('subtitle_only', 'tts_replace_audio', 'tts_mix_audio', 'video_transform_only', 'subtitle_and_tts')),
    CONSTRAINT render_profiles_audio_policy_check CHECK (original_audio_policy IN ('preserve', 'mute', 'remove', 'mix')),
    CONSTRAINT render_profiles_container_check CHECK (container_format IN ('mp4', 'mkv', 'webm'))
);

CREATE INDEX idx_render_profiles_project ON aidilam_app.render_profiles(project_id);
CREATE TRIGGER trg_render_profiles_updated_at BEFORE UPDATE ON aidilam_app.render_profiles
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();

-- =============================================================================
-- 3. Table: render_budgets
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.render_budgets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id) UNIQUE,
    currency text NOT NULL DEFAULT 'USD',
    per_run_limit numeric,
    daily_limit numeric,
    monthly_limit numeric,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_render_budgets_updated_at BEFORE UPDATE ON aidilam_app.render_budgets
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();

-- =============================================================================
-- 4. Table: render_budget_reservations
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.render_budget_reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    render_run_id uuid NOT NULL,
    currency text NOT NULL DEFAULT 'USD',
    estimated_amount numeric NOT NULL,
    committed_amount numeric,
    status text NOT NULL DEFAULT 'reserved',
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 minutes'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT render_budget_reservations_status_check CHECK (status IN ('reserved', 'committed', 'released')),
    CONSTRAINT render_budget_reservations_run_unique UNIQUE (render_run_id)
);

CREATE INDEX idx_render_budget_reservations_project ON aidilam_app.render_budget_reservations(project_id, status);
CREATE TRIGGER trg_render_budget_reservations_updated_at BEFORE UPDATE ON aidilam_app.render_budget_reservations
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();

-- =============================================================================
-- 5. Table: render_runs
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.render_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    source_video_asset_id uuid NOT NULL REFERENCES aidilam_app.assets(id),
    subtitle_version_id uuid REFERENCES aidilam_app.subtitle_versions(id),
    tts_run_id uuid,
    tts_narration_asset_id uuid REFERENCES aidilam_app.assets(id),
    render_profile_id uuid NOT NULL REFERENCES aidilam_app.render_profiles(id),
    job_id uuid REFERENCES aidilam_app.jobs(id),
    status text NOT NULL DEFAULT 'queued',
    progress_percent integer NOT NULL DEFAULT 0,
    current_stage text,
    estimated_duration_ms integer,
    actual_duration_ms integer,
    estimated_cost numeric,
    committed_cost numeric,
    currency text NOT NULL DEFAULT 'USD',
    output_asset_id uuid REFERENCES aidilam_app.assets(id),
    preview_asset_id uuid REFERENCES aidilam_app.assets(id),
    error_code text,
    error_message_safe text,
    idempotency_key text NOT NULL,
    requested_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    completed_at timestamptz,
    cancel_requested_at timestamptz,
    cancelled_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT render_runs_status_check CHECK (status IN ('queued', 'planning', 'running', 'validating', 'succeeded', 'failed', 'cancel_requested', 'cancelled', 'manual_review_required')),
    CONSTRAINT render_runs_idempotency_unique UNIQUE (project_id, idempotency_key)
);

CREATE INDEX idx_render_runs_project ON aidilam_app.render_runs(project_id);
CREATE TRIGGER trg_render_runs_updated_at BEFORE UPDATE ON aidilam_app.render_runs
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();

-- =============================================================================
-- 6. Table: render_plans
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.render_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    render_run_id uuid NOT NULL REFERENCES aidilam_app.render_runs(id) UNIQUE,
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    source_video_metadata jsonb NOT NULL DEFAULT '{}',
    subtitle_metadata jsonb NOT NULL DEFAULT '{}',
    tts_metadata jsonb NOT NULL DEFAULT '{}',
    output_spec jsonb NOT NULL DEFAULT '{}',
    filter_graph_safe text,
    audio_plan jsonb NOT NULL DEFAULT '{}',
    video_plan jsonb NOT NULL DEFAULT '{}',
    estimated_work_units numeric NOT NULL DEFAULT 0,
    validation_warnings text[],
    checksum text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 7. Table: render_usage_records
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.render_usage_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    render_run_id uuid NOT NULL REFERENCES aidilam_app.render_runs(id) UNIQUE,
    operation_type text NOT NULL DEFAULT 'render',
    source_duration_ms integer NOT NULL DEFAULT 0,
    output_duration_ms integer NOT NULL DEFAULT 0,
    source_resolution text,
    output_resolution text,
    frames_processed integer NOT NULL DEFAULT 0,
    audio_duration_ms integer NOT NULL DEFAULT 0,
    subtitle_cue_count integer NOT NULL DEFAULT 0,
    ffmpeg_execution_seconds numeric NOT NULL DEFAULT 0,
    output_bytes bigint NOT NULL DEFAULT 0,
    retry_count integer NOT NULL DEFAULT 0,
    estimated_cost numeric NOT NULL DEFAULT 0,
    committed_cost numeric,
    currency text NOT NULL DEFAULT 'USD',
    pricing_version text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_render_usage_records_project ON aidilam_app.render_usage_records(project_id);

-- =============================================================================
-- 8. Seed: Global subtitle styles
-- =============================================================================

INSERT INTO aidilam_app.subtitle_styles (project_id, name, font_family, font_size, primary_color, outline_color, outline_width, alignment, margin_vertical, max_lines)
VALUES
  (NULL, 'default-bottom', 'Arial', 24, '&H00FFFFFF', '&H00000000', 2, 2, 40, 2),
  (NULL, 'high-contrast-bottom', 'Arial', 28, '&H0000FFFF', '&H00000000', 3, 2, 50, 2),
  (NULL, 'mobile-large', 'Arial', 36, '&H00FFFFFF', '&H00000000', 3, 2, 60, 2);

-- =============================================================================
-- 9. Permissions
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.subtitle_styles TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.render_profiles TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.render_budgets TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.render_budget_reservations TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.render_runs TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.render_plans TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.render_usage_records TO aidilam_runtime;

COMMIT;
