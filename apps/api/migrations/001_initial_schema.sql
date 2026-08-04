-- Migration: 001_initial_schema
-- Created: 2026-07-24
-- Description: Create initial AIĐiLàm application schema tables

-- Up Migration

-- Users table
CREATE TABLE aidilam_app.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    external_subject text UNIQUE,
    email text,
    display_name text NOT NULL,
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'deleted')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    last_login_at timestamptz
);

CREATE UNIQUE INDEX idx_users_email ON aidilam_app.users (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX idx_users_status ON aidilam_app.users (status);

-- Projects table
CREATE TABLE aidilam_app.projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    name text NOT NULL CHECK (length(name) > 0),
    description text,
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'paused', 'archived')),
    owner_user_id uuid REFERENCES aidilam_app.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz
);

CREATE INDEX idx_projects_status ON aidilam_app.projects (status);
CREATE INDEX idx_projects_owner ON aidilam_app.projects (owner_user_id);

-- Project memberships
CREATE TABLE aidilam_app.project_memberships (
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES aidilam_app.users(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, user_id)
);

-- Jobs table
CREATE TABLE aidilam_app.jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    job_type text NOT NULL,
    status text NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'retry_wait')),
    priority integer NOT NULL DEFAULT 0,
    progress_percent integer NOT NULL DEFAULT 0
        CHECK (progress_percent BETWEEN 0 AND 100),
    input_payload jsonb,
    result_payload jsonb,
    error_code text,
    error_message text,
    attempt_count integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 3,
    scheduled_at timestamptz,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_jobs_project_status ON aidilam_app.jobs (project_id, status);
CREATE INDEX idx_jobs_status_scheduled ON aidilam_app.jobs (status, scheduled_at) WHERE status IN ('queued', 'retry_wait');
CREATE INDEX idx_jobs_type ON aidilam_app.jobs (job_type);

-- Job events
CREATE TABLE aidilam_app.job_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id uuid NOT NULL REFERENCES aidilam_app.jobs(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    payload jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_events_job_created ON aidilam_app.job_events (job_id, created_at);

-- Assets table
CREATE TABLE aidilam_app.assets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    bucket_name text NOT NULL,
    object_key text NOT NULL,
    original_filename text,
    content_type text,
    size_bytes bigint CHECK (size_bytes > 0),
    checksum_sha256 text,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'available', 'processing', 'failed', 'deleted')),
    metadata jsonb,
    created_by uuid REFERENCES aidilam_app.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    UNIQUE (bucket_name, object_key)
);

CREATE INDEX idx_assets_project ON aidilam_app.assets (project_id);
CREATE INDEX idx_assets_status ON aidilam_app.assets (status);

-- Workflows
CREATE TABLE aidilam_app.workflows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    code text NOT NULL,
    name text NOT NULL,
    version integer NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'deprecated', 'archived')),
    definition jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, code, version)
);

-- Workflow executions
CREATE TABLE aidilam_app.workflow_executions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id uuid NOT NULL REFERENCES aidilam_app.workflows(id),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
    input_payload jsonb,
    output_payload jsonb,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_exec_workflow ON aidilam_app.workflow_executions (workflow_id);
CREATE INDEX idx_workflow_exec_project ON aidilam_app.workflow_executions (project_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION aidilam_app.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON aidilam_app.users
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON aidilam_app.projects
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();
CREATE TRIGGER trg_jobs_updated_at BEFORE UPDATE ON aidilam_app.jobs
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();
CREATE TRIGGER trg_assets_updated_at BEFORE UPDATE ON aidilam_app.assets
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();
CREATE TRIGGER trg_workflows_updated_at BEFORE UPDATE ON aidilam_app.workflows
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();
CREATE TRIGGER trg_workflow_exec_updated_at BEFORE UPDATE ON aidilam_app.workflow_executions
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();

-- Grant execute on trigger function to runtime
GRANT EXECUTE ON FUNCTION aidilam_app.set_updated_at() TO aidilam_runtime;
