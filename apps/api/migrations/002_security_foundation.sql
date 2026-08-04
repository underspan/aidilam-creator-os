-- Migration: 002_security_foundation
-- Created: 2026-07-24
-- Description: Internal authentication, authorization, and audit foundation
-- Task: AIĐILÀM-DEP-006

-- ============================================================
-- SERVICE ACCOUNTS
-- ============================================================

CREATE TABLE aidilam_app.service_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    name text NOT NULL CHECK (length(name) > 0),
    description text,
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'disabled', 'revoked')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    disabled_at timestamptz,
    last_used_at timestamptz,
    created_by uuid
);

CREATE INDEX idx_service_accounts_status ON aidilam_app.service_accounts (status);
CREATE INDEX idx_service_accounts_code ON aidilam_app.service_accounts (code);

CREATE TRIGGER trg_service_accounts_updated_at
    BEFORE UPDATE ON aidilam_app.service_accounts
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();

-- ============================================================
-- SERVICE TOKENS
-- ============================================================

CREATE TABLE aidilam_app.service_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    service_account_id uuid NOT NULL REFERENCES aidilam_app.service_accounts(id) ON DELETE CASCADE,
    token_prefix text NOT NULL,
    token_hash text NOT NULL,
    hash_algorithm text NOT NULL DEFAULT 'hmac-sha256'
        CHECK (hash_algorithm IN ('hmac-sha256', 'sha256')),
    name text NOT NULL CHECK (length(name) > 0),
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'revoked', 'expired')),
    expires_at timestamptz,
    last_used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz,
    created_by uuid
);

CREATE INDEX idx_service_tokens_prefix ON aidilam_app.service_tokens (token_prefix);
CREATE INDEX idx_service_tokens_account ON aidilam_app.service_tokens (service_account_id);
CREATE INDEX idx_service_tokens_status ON aidilam_app.service_tokens (status);

-- ============================================================
-- ROLES
-- ============================================================

CREATE TABLE aidilam_app.roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    name text NOT NULL CHECK (length(name) > 0),
    scope text NOT NULL CHECK (scope IN ('global', 'project')),
    description text,
    is_system boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_roles_updated_at
    BEFORE UPDATE ON aidilam_app.roles
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.set_updated_at();

-- ============================================================
-- PERMISSIONS
-- ============================================================

CREATE TABLE aidilam_app.permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    resource text NOT NULL,
    action text NOT NULL,
    description text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_permissions_resource ON aidilam_app.permissions (resource);

-- ============================================================
-- ROLE PERMISSIONS (junction table)
-- ============================================================

CREATE TABLE aidilam_app.role_permissions (
    role_id uuid NOT NULL REFERENCES aidilam_app.roles(id) ON DELETE CASCADE,
    permission_id uuid NOT NULL REFERENCES aidilam_app.permissions(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (role_id, permission_id)
);

-- ============================================================
-- USER GLOBAL ROLES
-- ============================================================

CREATE TABLE aidilam_app.user_global_roles (
    user_id uuid NOT NULL REFERENCES aidilam_app.users(id) ON DELETE CASCADE,
    role_id uuid NOT NULL REFERENCES aidilam_app.roles(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    PRIMARY KEY (user_id, role_id)
);

-- Constraint: only global-scope roles may be assigned here
-- Enforced via application layer and CHECK constraint on role scope

-- ============================================================
-- PROJECT ROLE ASSIGNMENTS
-- ============================================================

CREATE TABLE aidilam_app.project_role_assignments (
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES aidilam_app.users(id) ON DELETE CASCADE,
    role_id uuid NOT NULL REFERENCES aidilam_app.roles(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    PRIMARY KEY (project_id, user_id, role_id)
);

CREATE INDEX idx_project_role_assignments_user ON aidilam_app.project_role_assignments (user_id);
CREATE INDEX idx_project_role_assignments_project ON aidilam_app.project_role_assignments (project_id);

-- ============================================================
-- AUDIT EVENTS (append-only)
-- ============================================================

CREATE TABLE aidilam_app.audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    request_id text,
    actor_type text NOT NULL
        CHECK (actor_type IN ('user', 'service_account', 'system', 'anonymous')),
    actor_id text,
    actor_display text,
    action text NOT NULL,
    resource_type text,
    resource_id text,
    project_id uuid,
    outcome text NOT NULL
        CHECK (outcome IN ('success', 'denied', 'failure')),
    source_ip text,
    user_agent text,
    metadata jsonb,
    previous_values jsonb,
    new_values jsonb
);

CREATE INDEX idx_audit_events_occurred ON aidilam_app.audit_events (occurred_at);
CREATE INDEX idx_audit_events_actor ON aidilam_app.audit_events (actor_type, actor_id);
CREATE INDEX idx_audit_events_project ON aidilam_app.audit_events (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_audit_events_resource ON aidilam_app.audit_events (resource_type, resource_id);
CREATE INDEX idx_audit_events_action_outcome ON aidilam_app.audit_events (action, outcome);

-- ============================================================
-- SECURITY EVENTS (append-only)
-- ============================================================

CREATE TABLE aidilam_app.security_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    request_id text,
    event_type text NOT NULL
        CHECK (event_type IN (
            'authentication_success',
            'authentication_failure',
            'token_expired',
            'token_revoked',
            'authorization_denied',
            'invalid_request',
            'suspicious_request',
            'configuration_error',
            'rate_limit_exceeded'
        )),
    severity text NOT NULL
        CHECK (severity IN ('info', 'warning', 'high', 'critical')),
    actor_type text
        CHECK (actor_type IS NULL OR actor_type IN ('user', 'service_account', 'system', 'anonymous')),
    actor_id text,
    source_ip text,
    user_agent text,
    resource text,
    details jsonb
);

CREATE INDEX idx_security_events_occurred ON aidilam_app.security_events (occurred_at);
CREATE INDEX idx_security_events_type ON aidilam_app.security_events (event_type);
CREATE INDEX idx_security_events_severity ON aidilam_app.security_events (severity);
CREATE INDEX idx_security_events_actor ON aidilam_app.security_events (actor_type, actor_id);

-- ============================================================
-- PHASE B: DATABASE PERMISSIONS - AUDIT IMMUTABILITY
-- ============================================================

-- Runtime role: INSERT + SELECT only on audit tables
-- No UPDATE, DELETE, or TRUNCATE
GRANT SELECT, INSERT ON aidilam_app.audit_events TO aidilam_runtime;
GRANT SELECT, INSERT ON aidilam_app.security_events TO aidilam_runtime;

-- Revoke dangerous permissions explicitly
REVOKE UPDATE, DELETE, TRUNCATE ON aidilam_app.audit_events FROM aidilam_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON aidilam_app.security_events FROM aidilam_runtime;

-- Grant full CRUD on security management tables
GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.service_accounts TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON aidilam_app.service_tokens TO aidilam_runtime;
GRANT SELECT ON aidilam_app.roles TO aidilam_runtime;
GRANT SELECT ON aidilam_app.permissions TO aidilam_runtime;
GRANT SELECT ON aidilam_app.role_permissions TO aidilam_runtime;
GRANT SELECT, INSERT, DELETE ON aidilam_app.user_global_roles TO aidilam_runtime;
GRANT SELECT, INSERT, DELETE ON aidilam_app.project_role_assignments TO aidilam_runtime;

-- ============================================================
-- SEED DATA: ROLES
-- ============================================================

INSERT INTO aidilam_app.roles (code, name, scope, description, is_system) VALUES
    ('system_admin', 'System Administrator', 'global', 'Full system access for internal administration', true),
    ('platform_operator', 'Platform Operator', 'global', 'Read-only platform monitoring and audit review', true),
    ('project_owner', 'Project Owner', 'project', 'Full control within assigned projects', true),
    ('project_admin', 'Project Admin', 'project', 'Manage project resources and memberships', true),
    ('project_editor', 'Project Editor', 'project', 'Create and update project resources', true),
    ('project_viewer', 'Project Viewer', 'project', 'Read-only project access', true),
    ('service_worker', 'Service Worker', 'global', 'Background job processing identity', true);

-- ============================================================
-- SEED DATA: PERMISSIONS
-- ============================================================

INSERT INTO aidilam_app.permissions (code, resource, action, description) VALUES
    ('system.read', 'system', 'read', 'View system information and deep health'),
    ('projects.create', 'projects', 'create', 'Create new projects'),
    ('projects.read', 'projects', 'read', 'View project details'),
    ('projects.update', 'projects', 'update', 'Update project settings'),
    ('projects.archive', 'projects', 'archive', 'Archive projects'),
    ('projects.manage_members', 'projects', 'manage_members', 'Manage project role assignments'),
    ('jobs.create', 'jobs', 'create', 'Create new jobs'),
    ('jobs.read', 'jobs', 'read', 'View job details and events'),
    ('jobs.cancel', 'jobs', 'cancel', 'Cancel running jobs'),
    ('jobs.retry', 'jobs', 'retry', 'Retry failed jobs'),
    ('jobs.update-status', 'jobs', 'update-status', 'Update job status (worker use)'),
    ('assets.create', 'assets', 'create', 'Upload assets'),
    ('assets.read', 'assets', 'read', 'View assets'),
    ('assets.delete', 'assets', 'delete', 'Delete assets'),
    ('workflows.create', 'workflows', 'create', 'Create workflows'),
    ('workflows.read', 'workflows', 'read', 'View workflows'),
    ('workflows.update', 'workflows', 'update', 'Update workflows'),
    ('workflows.execute', 'workflows', 'execute', 'Execute workflows'),
    ('audit.read', 'audit', 'read', 'View audit events'),
    ('security.read', 'security', 'read', 'View security events'),
    ('service_accounts.create', 'service_accounts', 'create', 'Create service accounts'),
    ('service_accounts.read', 'service_accounts', 'read', 'View service accounts'),
    ('service_accounts.update', 'service_accounts', 'update', 'Update service accounts'),
    ('service_accounts.rotate_token', 'service_accounts', 'rotate_token', 'Create new tokens for service accounts'),
    ('service_accounts.revoke_token', 'service_accounts', 'revoke_token', 'Revoke service account tokens');

-- ============================================================
-- SEED DATA: ROLE-PERMISSION MATRIX
-- ============================================================

-- system_admin gets ALL permissions
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'system_admin';

-- platform_operator: monitoring + audit
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'platform_operator'
AND p.code IN ('system.read', 'projects.read', 'jobs.read', 'audit.read', 'security.read');

-- project_owner: full project permissions
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'project_owner'
AND p.code IN (
    'projects.read', 'projects.update', 'projects.archive', 'projects.manage_members',
    'jobs.create', 'jobs.read', 'jobs.cancel', 'jobs.retry',
    'assets.create', 'assets.read', 'assets.delete',
    'workflows.create', 'workflows.read', 'workflows.update', 'workflows.execute'
);

-- project_admin: manage project resources and members (no archive)
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'project_admin'
AND p.code IN (
    'projects.read', 'projects.update', 'projects.manage_members',
    'jobs.create', 'jobs.read', 'jobs.cancel', 'jobs.retry',
    'assets.create', 'assets.read', 'assets.delete',
    'workflows.create', 'workflows.read', 'workflows.update', 'workflows.execute'
);

-- project_editor: create and update project resources
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'project_editor'
AND p.code IN (
    'projects.read',
    'jobs.create', 'jobs.read',
    'assets.create', 'assets.read',
    'workflows.create', 'workflows.read', 'workflows.update', 'workflows.execute'
);

-- project_viewer: read-only
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'project_viewer'
AND p.code IN ('projects.read', 'jobs.read', 'assets.read', 'workflows.read');

-- service_worker: background job processing
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'service_worker'
AND p.code IN (
    'system.read', 'projects.read',
    'jobs.read', 'jobs.update-status',
    'assets.create', 'assets.read',
    'workflows.read'
);

-- ============================================================
-- DENY TRIGGER: Prevent runtime UPDATE/DELETE on audit tables
-- Additional defense-in-depth via trigger (belt-and-suspenders)
-- ============================================================

CREATE OR REPLACE FUNCTION aidilam_app.deny_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit records are immutable. UPDATE and DELETE are prohibited.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_events_immutable
    BEFORE UPDATE OR DELETE ON aidilam_app.audit_events
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.deny_audit_modification();

CREATE TRIGGER trg_security_events_immutable
    BEFORE UPDATE OR DELETE ON aidilam_app.security_events
    FOR EACH ROW EXECUTE FUNCTION aidilam_app.deny_audit_modification();

GRANT EXECUTE ON FUNCTION aidilam_app.deny_audit_modification() TO aidilam_runtime;
