-- Migration: 009_translation_admission_race_fix
-- Task: AIDILAM-DEP-010D
-- Description: Add partial unique index preventing duplicate active translation runs

BEGIN;

-- Prevent multiple active translation runs for the same source+profile combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_translation_runs_active_unique
    ON aidilam_app.translation_runs (project_id, source_subtitle_version_id, translation_profile_id)
    WHERE status IN ('requested', 'queued', 'running', 'succeeded');

COMMIT;
