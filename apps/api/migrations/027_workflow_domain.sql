-- Migration 027: Workflow Domain Model
-- AIDILAM-COM-04E1 — Domain + versioning only. No executor.

CREATE TABLE IF NOT EXISTS aidilam_app.workflow_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES aidilam_app.workspaces(id),
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'video',
  workflow_type text NOT NULL DEFAULT 'system' CHECK (workflow_type IN ('system', 'workspace')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived', 'disabled')),
  visibility text NOT NULL DEFAULT 'system' CHECK (visibility IN ('system', 'workspace', 'private')),
  current_version_id uuid,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workflow_defs_workspace ON aidilam_app.workflow_definitions(workspace_id);

CREATE TABLE IF NOT EXISTS aidilam_app.workflow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_definition_id uuid NOT NULL REFERENCES aidilam_app.workflow_definitions(id),
  version_number integer NOT NULL DEFAULT 1,
  schema_version text NOT NULL DEFAULT '1.0',
  configuration_json jsonb NOT NULL DEFAULT '{}',
  checksum_sha256 text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'validated', 'active', 'archived')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_definition_id, version_number)
);

CREATE TABLE IF NOT EXISTS aidilam_app.workflow_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_version_id uuid NOT NULL REFERENCES aidilam_app.workflow_versions(id),
  node_key text NOT NULL,
  node_type text NOT NULL,
  display_name text NOT NULL,
  position_index integer NOT NULL DEFAULT 0,
  config_json jsonb NOT NULL DEFAULT '{}',
  capability text,
  retry_policy_json jsonb,
  timeout_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_version_id, node_key)
);

CREATE TABLE IF NOT EXISTS aidilam_app.workflow_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_version_id uuid NOT NULL REFERENCES aidilam_app.workflow_versions(id),
  from_node_key text NOT NULL,
  to_node_key text NOT NULL,
  edge_type text NOT NULL DEFAULT 'success' CHECK (edge_type IN ('success', 'failure', 'conditional')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_version_id, from_node_key, to_node_key)
);

-- Seed system Video Localization Workflow
INSERT INTO aidilam_app.workflow_definitions (id, name, slug, description, category, workflow_type, status, visibility)
VALUES ('e0000000-0001-4000-a000-000000000001', 'Video Localization Workflow', 'video-localization', 'Source → STT → Translate → TTS → Render → Review', 'video', 'system', 'active', 'system')
ON CONFLICT (id) DO NOTHING;

INSERT INTO aidilam_app.workflow_versions (id, workflow_definition_id, version_number, schema_version, configuration_json, checksum_sha256, status)
VALUES ('e0000000-0001-4000-b000-000000000001', 'e0000000-0001-4000-a000-000000000001', 1, '1.0', '{"nodes":10,"edges":9,"type":"video_localization"}', 'e1v1-canonical-hash', 'active')
ON CONFLICT (workflow_definition_id, version_number) DO NOTHING;

UPDATE aidilam_app.workflow_definitions SET current_version_id = 'e0000000-0001-4000-b000-000000000001' WHERE id = 'e0000000-0001-4000-a000-000000000001';

-- Seed nodes (10 stages)
INSERT INTO aidilam_app.workflow_nodes (workflow_version_id, node_key, node_type, display_name, position_index, capability) VALUES
  ('e0000000-0001-4000-b000-000000000001', 'source', 'source', 'Source', 0, NULL),
  ('e0000000-0001-4000-b000-000000000001', 'analyze', 'analyze', 'Analyze', 1, NULL),
  ('e0000000-0001-4000-b000-000000000001', 'stt', 'stt', 'Speech-to-Text', 2, 'stt'),
  ('e0000000-0001-4000-b000-000000000001', 'translate', 'translate', 'Translation', 3, 'translation'),
  ('e0000000-0001-4000-b000-000000000001', 'tts', 'tts', 'Text-to-Speech', 4, 'tts'),
  ('e0000000-0001-4000-b000-000000000001', 'align', 'align', 'Alignment', 5, NULL),
  ('e0000000-0001-4000-b000-000000000001', 'render', 'render', 'Render', 6, 'render'),
  ('e0000000-0001-4000-b000-000000000001', 'qc', 'qc', 'Quality Check', 7, NULL),
  ('e0000000-0001-4000-b000-000000000001', 'persist', 'persist', 'Persist', 8, NULL),
  ('e0000000-0001-4000-b000-000000000001', 'review', 'review', 'Review', 9, NULL)
ON CONFLICT (workflow_version_id, node_key) DO NOTHING;

-- Seed edges (9 success transitions)
INSERT INTO aidilam_app.workflow_edges (workflow_version_id, from_node_key, to_node_key, edge_type) VALUES
  ('e0000000-0001-4000-b000-000000000001', 'source', 'analyze', 'success'),
  ('e0000000-0001-4000-b000-000000000001', 'analyze', 'stt', 'success'),
  ('e0000000-0001-4000-b000-000000000001', 'stt', 'translate', 'success'),
  ('e0000000-0001-4000-b000-000000000001', 'translate', 'tts', 'success'),
  ('e0000000-0001-4000-b000-000000000001', 'tts', 'align', 'success'),
  ('e0000000-0001-4000-b000-000000000001', 'align', 'render', 'success'),
  ('e0000000-0001-4000-b000-000000000001', 'render', 'qc', 'success'),
  ('e0000000-0001-4000-b000-000000000001', 'qc', 'persist', 'success'),
  ('e0000000-0001-4000-b000-000000000001', 'persist', 'review', 'success')
ON CONFLICT (workflow_version_id, from_node_key, to_node_key) DO NOTHING;

-- Rollback: DROP TABLE aidilam_app.workflow_edges; DROP TABLE aidilam_app.workflow_nodes; DROP TABLE aidilam_app.workflow_versions; DROP TABLE aidilam_app.workflow_definitions;
