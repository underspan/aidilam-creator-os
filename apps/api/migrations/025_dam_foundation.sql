-- Migration 025: Digital Asset Management Foundation
-- AIDILAM-COM-04D
-- Adds collections, tags, and explicit lineage tracking.

-- Asset collections (workspace-scoped)
CREATE TABLE IF NOT EXISTS aidilam_app.asset_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES aidilam_app.workspaces(id),
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_collections_workspace ON aidilam_app.asset_collections(workspace_id);

-- Collection items
CREATE TABLE IF NOT EXISTS aidilam_app.asset_collection_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES aidilam_app.asset_collections(id),
  asset_id uuid NOT NULL REFERENCES aidilam_app.assets(id),
  added_by text,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (collection_id, asset_id)
);

-- Tags (workspace-scoped)
CREATE TABLE IF NOT EXISTS aidilam_app.asset_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES aidilam_app.workspaces(id),
  name text NOT NULL,
  color text DEFAULT '#6C63FF',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

-- Tag bindings
CREATE TABLE IF NOT EXISTS aidilam_app.asset_tag_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id uuid NOT NULL REFERENCES aidilam_app.asset_tags(id),
  asset_id uuid NOT NULL REFERENCES aidilam_app.assets(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tag_id, asset_id)
);

-- Explicit asset lineage (supplements existing source_asset_id)
CREATE TABLE IF NOT EXISTS aidilam_app.asset_lineage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_asset_id uuid NOT NULL REFERENCES aidilam_app.assets(id),
  child_asset_id uuid NOT NULL REFERENCES aidilam_app.assets(id),
  relationship_type text NOT NULL CHECK (relationship_type IN ('source', 'derived', 'transcript', 'translation', 'tts', 'render', 'thumbnail', 'subtitle')),
  job_id uuid,
  stage text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_asset_id, child_asset_id, relationship_type)
);
CREATE INDEX IF NOT EXISTS idx_lineage_parent ON aidilam_app.asset_lineage(parent_asset_id);
CREATE INDEX IF NOT EXISTS idx_lineage_child ON aidilam_app.asset_lineage(child_asset_id);

-- Rollback: DROP TABLE aidilam_app.asset_lineage; DROP TABLE aidilam_app.asset_tag_bindings; DROP TABLE aidilam_app.asset_tags; DROP TABLE aidilam_app.asset_collection_items; DROP TABLE aidilam_app.asset_collections;
