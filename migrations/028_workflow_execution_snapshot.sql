-- Migration 028: Workflow Execution Snapshot + State Machine
-- AIDILAM-COM-04E2
-- Creates immutable execution snapshots, execution state, and node state tables.

-- === WORKFLOW EXECUTION SNAPSHOTS (immutable) ===
CREATE TABLE IF NOT EXISTS aidilam_app.wf_execution_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES aidilam_app.workspaces(id),
  project_id UUID NOT NULL REFERENCES aidilam_app.projects(id),
  workflow_definition_id UUID NOT NULL,
  workflow_version_id UUID NOT NULL REFERENCES aidilam_app.workflow_versions(id),
  workflow_version_number INTEGER NOT NULL,
  workflow_checksum TEXT NOT NULL,
  template_id UUID,
  template_version_id UUID,
  template_checksum TEXT,
  input_asset_id UUID,
  input_asset_version_id UUID,
  input_asset_checksum TEXT,
  effective_config_json JSONB NOT NULL DEFAULT '{}',
  effective_config_checksum TEXT NOT NULL,
  provider_policy_json JSONB NOT NULL DEFAULT '{}',
  provider_policy_checksum TEXT NOT NULL,
  runtime_policy_json JSONB NOT NULL DEFAULT '{"maxRetries":3,"timeoutSeconds":3600,"cancelPolicy":"immediate"}',
  snapshot_json JSONB NOT NULL,
  snapshot_checksum_sha256 TEXT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT '1.0',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key TEXT,
  CONSTRAINT wf_snapshots_checksum_len CHECK (length(snapshot_checksum_sha256) = 64),
  CONSTRAINT wf_snapshots_wf_checksum_len CHECK (length(workflow_checksum) = 64)
);

CREATE INDEX IF NOT EXISTS idx_wf_snapshots_workspace ON aidilam_app.wf_execution_snapshots(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wf_snapshots_project ON aidilam_app.wf_execution_snapshots(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wf_snapshots_idempotency ON aidilam_app.wf_execution_snapshots(workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- === WORKFLOW EXECUTIONS (state machine) ===
CREATE TABLE IF NOT EXISTS aidilam_app.wf_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES aidilam_app.wf_execution_snapshots(id),
  workspace_id UUID NOT NULL REFERENCES aidilam_app.workspaces(id),
  project_id UUID NOT NULL REFERENCES aidilam_app.projects(id),
  execution_mode TEXT NOT NULL DEFAULT 'dry_run',
  status TEXT NOT NULL DEFAULT 'prepared',
  current_node_key TEXT,
  progress_percent INTEGER NOT NULL DEFAULT 0,
  attempt INTEGER NOT NULL DEFAULT 1,
  state_version INTEGER NOT NULL DEFAULT 1,
  cancel_requested_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  failure_code TEXT,
  failure_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wf_exec_mode_check CHECK (execution_mode IN ('dry_run')),
  CONSTRAINT wf_exec_status_check CHECK (status IN ('prepared', 'running', 'cancel_requested', 'succeeded', 'failed', 'cancelled')),
  CONSTRAINT wf_exec_progress_check CHECK (progress_percent >= 0 AND progress_percent <= 100)
);

CREATE INDEX IF NOT EXISTS idx_wf_exec_workspace ON aidilam_app.wf_executions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wf_exec_project ON aidilam_app.wf_executions(project_id);
CREATE INDEX IF NOT EXISTS idx_wf_exec_snapshot ON aidilam_app.wf_executions(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_wf_exec_status ON aidilam_app.wf_executions(status) WHERE status IN ('running', 'cancel_requested');

-- === WORKFLOW NODE EXECUTIONS (per-node state) ===
CREATE TABLE IF NOT EXISTS aidilam_app.wf_node_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES aidilam_app.wf_executions(id),
  node_key TEXT NOT NULL,
  node_type TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt INTEGER NOT NULL DEFAULT 1,
  state_version INTEGER NOT NULL DEFAULT 1,
  progress_percent INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_code TEXT,
  input_reference_json JSONB,
  output_reference_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wf_node_status_check CHECK (status IN ('pending', 'ready', 'running', 'succeeded', 'failed', 'skipped', 'cancelled')),
  CONSTRAINT wf_node_progress_check CHECK (progress_percent >= 0 AND progress_percent <= 100)
);

CREATE INDEX IF NOT EXISTS idx_wf_node_exec_execution ON aidilam_app.wf_node_executions(execution_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wf_node_exec_unique ON aidilam_app.wf_node_executions(execution_id, node_key);

-- === EXECUTION AUDIT EVENTS ===
CREATE TABLE IF NOT EXISTS aidilam_app.wf_execution_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES aidilam_app.wf_executions(id),
  event_type TEXT NOT NULL,
  node_key TEXT,
  actor_id UUID,
  detail_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wf_audit_execution ON aidilam_app.wf_execution_audit(execution_id);
CREATE INDEX IF NOT EXISTS idx_wf_audit_type ON aidilam_app.wf_execution_audit(event_type);
