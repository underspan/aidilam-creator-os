-- Migration: 008_subtitle_attach_idempotency
-- Task: AIDILAM-DEP-010B
-- Description: Add unique constraint to prevent duplicate active subtitle tracks

BEGIN;

-- Partial unique index: one active track per (project, media, source, language, kind)
-- Excludes deleted tracks to allow re-attachment after deletion
CREATE UNIQUE INDEX IF NOT EXISTS idx_subtitle_tracks_active_unique
    ON aidilam_app.subtitle_tracks (project_id, media_asset_id, source_asset_id, language_code, track_kind)
    WHERE status NOT IN ('deleting', 'deleted');

COMMIT;
