-- Migration 029: Shadow Execution Infrastructure
-- AIDILAM-COM-04E3

-- Extend execution_mode to allow 'shadow' (still forbid 'canonical')
ALTER TABLE aidilam_app.wf_executions DROP CONSTRAINT IF EXISTS wf_exec_mode_check;
ALTER TABLE aidilam_app.wf_executions ADD CONSTRAINT wf_exec_mode_check CHECK (execution_mode IN ('dry_run', 'shadow'));

-- === SHADOW ARTIFACTS ===
CREATE TABLE IF NOT EXISTS aidilam_app.wf_shadow_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES aidilam_app.workspaces(id),
  project_id UUID NOT NULL REFERENCES aidilam_app.projects(id),
  execution_id UUID NOT NULL REFERENCES aidilam_app.wf_executions(id),
  node_execution_id UUID REFERENCES aidilam_app.wf_node_executions(id),
  node_key TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  storage_binding TEXT NOT NULL,
  checksum_sha256 TEXT,
  size_bytes BIGINT,
  mime_type TEXT,
  metadata_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  CONSTRAINT wf_shadow_art_type_check CHECK (artifact_type IN ('source_copy','transcript','translation','audio_tts','aligned_audio','rendered_video','qc_report','shadow_evidence'))
);

CREATE INDEX IF NOT EXISTS idx_wf_shadow_art_exec ON aidilam_app.wf_shadow_artifacts(execution_id);
CREATE INDEX IF NOT EXISTS idx_wf_shadow_art_ws ON aidilam_app.wf_shadow_artifacts(workspace_id);

-- === SHADOW PAIRS (legacy ↔ shadow) ===
CREATE TABLE IF NOT EXISTS aidilam_app.wf_shadow_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES aidilam_app.workspaces(id),
  project_id UUID NOT NULL REFERENCES aidilam_app.projects(id),
  legacy_job_id UUID NOT NULL REFERENCES aidilam_app.jobs(id),
  shadow_execution_id UUID NOT NULL REFERENCES aidilam_app.wf_executions(id),
  input_asset_version_id UUID,
  workflow_version_id UUID,
  template_version_id UUID,
  effective_config_checksum TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wf_pair_status_check CHECK (status IN ('pending','comparing','pass','fail','inconclusive'))
);

CREATE INDEX IF NOT EXISTS idx_wf_pairs_ws ON aidilam_app.wf_shadow_pairs(workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wf_pairs_unique ON aidilam_app.wf_shadow_pairs(legacy_job_id, shadow_execution_id);

-- === SHADOW COMPARISONS ===
CREATE TABLE IF NOT EXISTS aidilam_app.wf_shadow_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_id UUID NOT NULL REFERENCES aidilam_app.wf_shadow_pairs(id),
  dimension TEXT NOT NULL,
  metric TEXT NOT NULL,
  legacy_value TEXT,
  shadow_value TEXT,
  result TEXT NOT NULL DEFAULT 'pending',
  tolerance TEXT,
  detail_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wf_comp_result_check CHECK (result IN ('pass','fail','inconclusive','pending','skip'))
);

CREATE INDEX IF NOT EXISTS idx_wf_comp_pair ON aidilam_app.wf_shadow_comparisons(pair_id);

-- === SHADOW PROVIDER CALLS LOG ===
CREATE TABLE IF NOT EXISTS aidilam_app.wf_shadow_provider_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES aidilam_app.wf_executions(id),
  node_key TEXT NOT NULL,
  capability TEXT NOT NULL,
  provider_definition_id UUID,
  provider_code TEXT,
  attempt INTEGER NOT NULL DEFAULT 1,
  duration_ms INTEGER,
  result TEXT NOT NULL,
  detail_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wf_prov_calls_exec ON aidilam_app.wf_shadow_provider_calls(execution_id);
