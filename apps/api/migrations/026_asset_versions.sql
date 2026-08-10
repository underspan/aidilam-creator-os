-- Migration 026: Asset Versions (immutable)
CREATE TABLE IF NOT EXISTS aidilam_app.asset_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES aidilam_app.assets(id),
  version_number integer NOT NULL DEFAULT 1,
  storage_reference text NOT NULL,
  checksum_sha256 text,
  size_bytes bigint,
  mime_type text,
  metadata_json jsonb DEFAULT '{}',
  created_by_job_id uuid,
  review_state text DEFAULT 'pending',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_asset_versions_asset ON aidilam_app.asset_versions(asset_id);

-- Add current_version_id to assets
ALTER TABLE aidilam_app.assets ADD COLUMN IF NOT EXISTS current_version_id uuid REFERENCES aidilam_app.asset_versions(id);

-- Backfill: create v1 for all existing 'available' assets
INSERT INTO aidilam_app.asset_versions (asset_id, version_number, storage_reference, checksum_sha256, size_bytes, mime_type, created_at)
SELECT id, 1, object_key, checksum_sha256, size_bytes, content_type, created_at
FROM aidilam_app.assets WHERE status = 'available'
ON CONFLICT (asset_id, version_number) DO NOTHING;

-- Update current_version_id pointers
UPDATE aidilam_app.assets a SET current_version_id = av.id
FROM aidilam_app.asset_versions av
WHERE av.asset_id = a.id AND av.version_number = 1 AND a.current_version_id IS NULL;
