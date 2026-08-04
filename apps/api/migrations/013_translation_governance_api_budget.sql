-- Migration: 013_translation_governance_api_budget
-- Task: AIDILAM-DEP-012G
-- Description: Translation budget tables and governance API permissions
-- Forward-only: no down migration in production

BEGIN;

-- =============================================================================
-- 1. Table: translation_budgets
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.translation_budgets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id) UNIQUE,
    currency text NOT NULL DEFAULT 'USD',
    per_run_limit numeric,
    daily_limit numeric,
    monthly_limit numeric,
    is_active boolean NOT NULL DEFAULT true,
    version integer NOT NULL DEFAULT 1,
    created_by text,
    updated_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 1b. Add details_json to translation_review_assignments (if missing)
-- =============================================================================

ALTER TABLE aidilam_app.translation_review_assignments
    ADD COLUMN IF NOT EXISTS details_json jsonb;

-- =============================================================================
-- 2. Table: translation_budget_reservations
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.translation_budget_reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    translation_run_id uuid REFERENCES aidilam_app.translation_runs(id) UNIQUE,
    currency text NOT NULL DEFAULT 'USD',
    estimated_amount numeric NOT NULL,
    committed_amount numeric,
    status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'committed', 'released', 'expired', 'cancelled')),
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_translation_budget_reservations_project_status
    ON aidilam_app.translation_budget_reservations (project_id, status);

-- =============================================================================
-- 3. Permissions
-- =============================================================================

INSERT INTO aidilam_app.permissions (code, resource, action, description) VALUES
    ('translations.quality.read', 'translations.quality', 'read', 'View translation quality results'),
    ('translations.review.read', 'translations.review', 'read', 'View translation review assignments'),
    ('translations.usage.read', 'translations.usage', 'read', 'View translation usage records'),
    ('translations.budget.read', 'translations.budget', 'read', 'View translation budget'),
    ('translations.budget.manage', 'translations.budget', 'manage', 'Manage translation budget limits')
ON CONFLICT (code) DO NOTHING;

-- project_editor: quality.read, review.read, usage.read
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'project_editor'
AND p.code IN ('translations.quality.read', 'translations.review.read', 'translations.usage.read')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- project_admin: all governance permissions
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'project_admin'
AND p.code IN ('translations.quality.read', 'translations.review.read', 'translations.usage.read', 'translations.budget.read', 'translations.budget.manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- project_owner: all governance permissions
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'project_owner'
AND p.code IN ('translations.quality.read', 'translations.review.read', 'translations.usage.read', 'translations.budget.read', 'translations.budget.manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- system_admin: all governance permissions
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'system_admin'
AND p.code IN ('translations.quality.read', 'translations.review.read', 'translations.usage.read', 'translations.budget.read', 'translations.budget.manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- 4. Grant permissions to aidilam_runtime
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON aidilam_app.translation_budgets TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE ON aidilam_app.translation_budget_reservations TO aidilam_runtime;

COMMIT;
