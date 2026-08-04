-- Migration: 015_tts_provider_voice_sync_foundation
-- Task: AIDILAM-DEP-013
-- Description: TTS provider registry, voice catalog, profiles, runs, cue results, sync plans
-- Forward-only: no down migration in production

BEGIN;

-- =============================================================================
-- 1. Table: tts_providers
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.tts_providers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    display_name text NOT NULL,
    provider_type text NOT NULL DEFAULT 'cloud',
    supported_languages text[] NOT NULL DEFAULT '{}',
    supported_audio_formats text[] NOT NULL DEFAULT '{wav}',
    supports_streaming boolean NOT NULL DEFAULT false,
    supports_ssml boolean NOT NULL DEFAULT false,
    supports_speaking_rate boolean NOT NULL DEFAULT true,
    supports_pitch boolean NOT NULL DEFAULT true,
    supports_style boolean NOT NULL DEFAULT false,
    supports_voice_cloning boolean NOT NULL DEFAULT false,
    supports_timestamps boolean NOT NULL DEFAULT false,
    supports_per_character_pricing boolean NOT NULL DEFAULT true,
    supports_per_audio_duration_pricing boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT false,
    validation_only boolean NOT NULL DEFAULT false,
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_tts_providers_updated_at BEFORE UPDATE ON aidilam_app.tts_providers
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();

-- =============================================================================
-- 2. Table: tts_voices
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.tts_voices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id uuid NOT NULL REFERENCES aidilam_app.tts_providers(id),
    voice_code text NOT NULL,
    display_name text NOT NULL,
    language text NOT NULL,
    locale text,
    gender text NOT NULL DEFAULT 'neutral',
    style text,
    sample_rate integer NOT NULL DEFAULT 22050,
    supported_formats text[] NOT NULL DEFAULT '{wav}',
    supports_rate boolean NOT NULL DEFAULT true,
    supports_pitch boolean NOT NULL DEFAULT true,
    supports_emotion boolean NOT NULL DEFAULT false,
    validation_only boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(provider_id, voice_code)
);

CREATE TRIGGER trg_tts_voices_updated_at BEFORE UPDATE ON aidilam_app.tts_voices
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();

ALTER TABLE aidilam_app.tts_voices ADD CONSTRAINT tts_voices_gender_check CHECK (gender IN ('male', 'female', 'neutral'));

-- =============================================================================
-- 3. Table: tts_model_configs (pricing and model metadata)
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.tts_model_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id uuid NOT NULL REFERENCES aidilam_app.tts_providers(id),
    code text NOT NULL UNIQUE,
    display_name text NOT NULL,
    cost_per_1k_characters numeric NOT NULL DEFAULT 0,
    cost_per_audio_minute numeric NOT NULL DEFAULT 0,
    minimum_request_charge numeric NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'USD',
    max_characters_per_request integer NOT NULL DEFAULT 5000,
    max_audio_duration_ms integer NOT NULL DEFAULT 600000,
    is_active boolean NOT NULL DEFAULT true,
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_tts_model_configs_updated_at BEFORE UPDATE ON aidilam_app.tts_model_configs
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();

-- =============================================================================
-- 4. Table: tts_profiles (project-scoped TTS configuration)
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.tts_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    provider_id uuid NOT NULL REFERENCES aidilam_app.tts_providers(id),
    model_config_id uuid REFERENCES aidilam_app.tts_model_configs(id),
    voice_id uuid NOT NULL REFERENCES aidilam_app.tts_voices(id),
    name text NOT NULL,
    language text NOT NULL DEFAULT 'vi',
    audio_format text NOT NULL DEFAULT 'wav',
    sample_rate integer NOT NULL DEFAULT 22050,
    speaking_rate numeric NOT NULL DEFAULT 1.0,
    pitch numeric NOT NULL DEFAULT 0.0,
    volume_gain numeric NOT NULL DEFAULT 0.0,
    pause_policy text NOT NULL DEFAULT 'natural',
    synchronization_policy text NOT NULL DEFAULT 'fit_with_rate',
    cost_policy text NOT NULL DEFAULT 'per_character',
    is_default boolean NOT NULL DEFAULT false,
    validation_only boolean NOT NULL DEFAULT false,
    version integer NOT NULL DEFAULT 1,
    configuration_json jsonb NOT NULL DEFAULT '{}',
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tts_profiles_speaking_rate_check CHECK (speaking_rate BETWEEN 0.25 AND 4.0),
    CONSTRAINT tts_profiles_pitch_check CHECK (pitch BETWEEN -20.0 AND 20.0),
    CONSTRAINT tts_profiles_audio_format_check CHECK (audio_format IN ('wav', 'mp3', 'ogg')),
    CONSTRAINT tts_profiles_sync_policy_check CHECK (synchronization_policy IN ('strict_timing', 'fit_with_rate', 'extend_cue', 'shift_following', 'manual_review'))
);

CREATE INDEX idx_tts_profiles_project ON aidilam_app.tts_profiles(project_id);

CREATE TRIGGER trg_tts_profiles_updated_at BEFORE UPDATE ON aidilam_app.tts_profiles
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();

-- =============================================================================
-- 5. Table: tts_budgets (per-project TTS budget)
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.tts_budgets (
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

CREATE TRIGGER trg_tts_budgets_updated_at BEFORE UPDATE ON aidilam_app.tts_budgets
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();

-- =============================================================================
-- 6. Table: tts_budget_reservations
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.tts_budget_reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    tts_run_id uuid NOT NULL,
    currency text NOT NULL DEFAULT 'USD',
    estimated_amount numeric NOT NULL,
    committed_amount numeric,
    status text NOT NULL DEFAULT 'reserved',
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tts_budget_reservations_status_check CHECK (status IN ('reserved', 'committed', 'released')),
    CONSTRAINT tts_budget_reservations_run_unique UNIQUE (tts_run_id)
);

CREATE INDEX idx_tts_budget_reservations_project ON aidilam_app.tts_budget_reservations(project_id, status);

CREATE TRIGGER trg_tts_budget_reservations_updated_at BEFORE UPDATE ON aidilam_app.tts_budget_reservations
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();

-- =============================================================================
-- 7. Table: tts_runs
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.tts_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    subtitle_version_id uuid NOT NULL REFERENCES aidilam_app.subtitle_versions(id),
    profile_id uuid NOT NULL REFERENCES aidilam_app.tts_profiles(id),
    provider_id uuid NOT NULL REFERENCES aidilam_app.tts_providers(id),
    voice_id uuid NOT NULL REFERENCES aidilam_app.tts_voices(id),
    job_id uuid REFERENCES aidilam_app.jobs(id),
    status text NOT NULL DEFAULT 'queued',
    language text NOT NULL DEFAULT 'vi',
    cue_count integer,
    input_character_count integer,
    estimated_audio_ms integer,
    actual_audio_ms integer,
    output_asset_id uuid REFERENCES aidilam_app.assets(id),
    error_code text,
    error_message_safe text,
    idempotency_key text NOT NULL,
    requested_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    completed_at timestamptz,
    cancelled_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tts_runs_status_check CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancel_requested', 'cancelled')),
    CONSTRAINT tts_runs_idempotency_unique UNIQUE (project_id, idempotency_key)
);

CREATE INDEX idx_tts_runs_project ON aidilam_app.tts_runs(project_id);
CREATE INDEX idx_tts_runs_version ON aidilam_app.tts_runs(subtitle_version_id);

CREATE TRIGGER trg_tts_runs_updated_at BEFORE UPDATE ON aidilam_app.tts_runs
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();

-- =============================================================================
-- 8. Table: tts_cue_results
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.tts_cue_results (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tts_run_id uuid NOT NULL REFERENCES aidilam_app.tts_runs(id),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    subtitle_cue_id uuid REFERENCES aidilam_app.subtitle_cues(id),
    cue_index integer NOT NULL,
    text_checksum text,
    audio_asset_id uuid REFERENCES aidilam_app.assets(id),
    original_start_ms integer NOT NULL,
    original_end_ms integer NOT NULL,
    original_duration_ms integer NOT NULL,
    generated_duration_ms integer,
    adjusted_start_ms integer,
    adjusted_end_ms integer,
    sync_action text NOT NULL DEFAULT 'none',
    status text NOT NULL DEFAULT 'pending',
    error_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tts_cue_results_status_check CHECK (status IN ('pending', 'synthesized', 'failed', 'skipped')),
    CONSTRAINT tts_cue_results_sync_action_check CHECK (sync_action IN ('none', 'fit', 'rate_adjusted', 'pause_adjusted', 'extended', 'shifted', 'overflow', 'manual_review')),
    CONSTRAINT tts_cue_results_unique UNIQUE (tts_run_id, cue_index)
);

CREATE INDEX idx_tts_cue_results_run ON aidilam_app.tts_cue_results(tts_run_id);

CREATE TRIGGER trg_tts_cue_results_updated_at BEFORE UPDATE ON aidilam_app.tts_cue_results
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();

-- =============================================================================
-- 9. Table: tts_sync_plans
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.tts_sync_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tts_run_id uuid NOT NULL REFERENCES aidilam_app.tts_runs(id) UNIQUE,
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    strategy text NOT NULL DEFAULT 'fit_with_rate',
    original_total_ms integer NOT NULL DEFAULT 0,
    generated_total_ms integer NOT NULL DEFAULT 0,
    adjusted_total_ms integer NOT NULL DEFAULT 0,
    fit_count integer NOT NULL DEFAULT 0,
    overlap_count integer NOT NULL DEFAULT 0,
    overflow_count integer NOT NULL DEFAULT 0,
    rate_adjustment_count integer NOT NULL DEFAULT 0,
    pause_adjustment_count integer NOT NULL DEFAULT 0,
    manual_review_required boolean NOT NULL DEFAULT false,
    max_rate_used numeric,
    metrics jsonb NOT NULL DEFAULT '{}',
    quality_status text NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tts_sync_plans_strategy_check CHECK (strategy IN ('strict_timing', 'fit_with_rate', 'extend_cue', 'shift_following', 'manual_review')),
    CONSTRAINT tts_sync_plans_quality_status_check CHECK (quality_status IN ('pending', 'passed', 'warning', 'failed', 'manual_review_required'))
);

-- =============================================================================
-- 10. Table: tts_usage_records
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.tts_usage_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    tts_run_id uuid NOT NULL REFERENCES aidilam_app.tts_runs(id) UNIQUE,
    provider_code text NOT NULL,
    model_code text,
    voice_code text NOT NULL,
    operation_type text NOT NULL DEFAULT 'tts',
    input_characters integer NOT NULL DEFAULT 0,
    audio_duration_ms integer NOT NULL DEFAULT 0,
    estimated_cost numeric NOT NULL DEFAULT 0,
    committed_cost numeric,
    currency text NOT NULL DEFAULT 'USD',
    pricing_version text,
    request_count integer NOT NULL DEFAULT 1,
    retry_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tts_usage_records_project ON aidilam_app.tts_usage_records(project_id);
CREATE INDEX idx_tts_usage_records_date ON aidilam_app.tts_usage_records(created_at);

-- =============================================================================
-- 11. Seed data: Providers
-- =============================================================================

INSERT INTO aidilam_app.tts_providers (code, display_name, provider_type, supported_languages, supported_audio_formats, supports_streaming, supports_ssml, supports_speaking_rate, supports_pitch, supports_style, supports_voice_cloning, supports_timestamps, supports_per_character_pricing, supports_per_audio_duration_pricing, is_active, validation_only)
VALUES
  ('mock_deterministic_tts', 'Mock Deterministic TTS', 'local', ARRAY['vi', 'en', 'zh'], ARRAY['wav'], false, false, true, true, false, false, true, true, false, true, false),
  ('elevenlabs', 'ElevenLabs', 'cloud', ARRAY['vi', 'en', 'zh', 'ja', 'ko'], ARRAY['wav', 'mp3', 'ogg'], true, false, true, false, true, true, false, true, true, false, false),
  ('azure_speech', 'Azure Speech', 'cloud', ARRAY['vi', 'en', 'zh', 'ja', 'ko', 'fr', 'de', 'es'], ARRAY['wav', 'mp3', 'ogg'], true, true, true, true, true, false, true, true, true, false, false),
  ('openai_tts', 'OpenAI TTS', 'cloud', ARRAY['vi', 'en', 'zh', 'ja', 'ko', 'fr', 'de', 'es'], ARRAY['wav', 'mp3', 'ogg'], true, false, true, false, false, false, false, true, false, false, false),
  ('google_cloud_tts', 'Google Cloud TTS', 'cloud', ARRAY['vi', 'en', 'zh', 'ja', 'ko', 'fr', 'de', 'es'], ARRAY['wav', 'mp3', 'ogg'], true, true, true, true, false, false, true, true, true, false, false),
  ('local_piper', 'Piper (Local)', 'local', ARRAY['vi', 'en'], ARRAY['wav'], false, false, true, true, false, false, false, true, false, false, false),
  ('local_coqui', 'Coqui TTS (Local)', 'local', ARRAY['vi', 'en'], ARRAY['wav', 'mp3'], false, false, true, true, true, true, false, true, false, false, false);

-- =============================================================================
-- 12. Seed data: Voices for mock provider
-- =============================================================================

INSERT INTO aidilam_app.tts_voices (provider_id, voice_code, display_name, language, locale, gender, style, sample_rate, supported_formats, supports_rate, supports_pitch, supports_emotion, validation_only, is_active)
SELECT p.id, v.voice_code, v.display_name, v.language, v.locale, v.gender, v.style, v.sample_rate, v.formats, v.supports_rate, v.supports_pitch, v.supports_emotion, v.validation_only, v.is_active
FROM aidilam_app.tts_providers p
CROSS JOIN (VALUES
  ('vi-VN-male-01', 'Vietnamese Male Standard', 'vi', 'vi-VN', 'male', NULL, 22050, ARRAY['wav'], true, true, false, false, true),
  ('vi-VN-female-01', 'Vietnamese Female Standard', 'vi', 'vi-VN', 'female', NULL, 22050, ARRAY['wav'], true, true, false, false, true),
  ('vi-VN-male-fast', 'Vietnamese Male Fast (Validation)', 'vi', 'vi-VN', 'male', 'fast', 22050, ARRAY['wav'], true, true, false, true, true),
  ('vi-VN-female-calm', 'Vietnamese Female Calm (Validation)', 'vi', 'vi-VN', 'female', 'calm', 22050, ARRAY['wav'], true, true, false, true, true)
) AS v(voice_code, display_name, language, locale, gender, style, sample_rate, formats, supports_rate, supports_pitch, supports_emotion, validation_only, is_active)
WHERE p.code = 'mock_deterministic_tts';

-- =============================================================================
-- 13. Seed data: Model config for mock provider
-- =============================================================================

INSERT INTO aidilam_app.tts_model_configs (provider_id, code, display_name, cost_per_1k_characters, cost_per_audio_minute, minimum_request_charge, currency, max_characters_per_request, max_audio_duration_ms)
SELECT p.id, 'mock_tts_standard', 'Mock TTS Standard', 0.015, 0, 0.0001, 'USD', 5000, 600000
FROM aidilam_app.tts_providers p WHERE p.code = 'mock_deterministic_tts';

-- =============================================================================
-- 14. Grant permissions to runtime role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.tts_providers TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.tts_voices TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.tts_model_configs TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.tts_profiles TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.tts_budgets TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.tts_budget_reservations TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.tts_runs TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.tts_cue_results TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.tts_sync_plans TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.tts_usage_records TO aidilam_runtime;

COMMIT;
