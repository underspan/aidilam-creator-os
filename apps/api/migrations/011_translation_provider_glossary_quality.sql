-- Migration: 011_translation_provider_glossary_quality
-- Task: AIDILAM-DEP-012
-- Description: Translation provider governance, glossaries, quality checks, review assignments, usage tracking
-- Forward-only: no down migration in production

BEGIN;

-- =============================================================================
-- 1. Table: translation_providers
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.translation_providers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    provider_type text NOT NULL CHECK (provider_type IN ('external_api', 'local_api', 'mock')),
    base_url_reference text,
    credential_reference text,
    is_external boolean NOT NULL DEFAULT true,
    is_active boolean NOT NULL DEFAULT false,
    capabilities_json jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 2. Table: translation_model_configs
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.translation_model_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id uuid NOT NULL REFERENCES aidilam_app.translation_providers(id),
    code text NOT NULL UNIQUE,
    model_identifier text NOT NULL,
    version integer NOT NULL DEFAULT 1,
    configuration_json jsonb NOT NULL DEFAULT '{}',
    configuration_hash text NOT NULL,
    context_limit integer NOT NULL DEFAULT 4096,
    max_output_tokens integer NOT NULL DEFAULT 2048,
    cost_input_per_million numeric NOT NULL DEFAULT 0,
    cost_output_per_million numeric NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'USD',
    is_active boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 3. Table: translation_sensitivity_policies
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.translation_sensitivity_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    level integer NOT NULL,
    allowed_provider_types text[] NOT NULL,
    allowed_provider_codes text[],
    description text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 4. Table: translation_routing_profiles
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.translation_routing_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    version integer NOT NULL DEFAULT 1,
    primary_model_config_id uuid REFERENCES aidilam_app.translation_model_configs(id),
    fallback_model_config_ids uuid[],
    sensitivity_policy_id uuid REFERENCES aidilam_app.translation_sensitivity_policies(id),
    cost_ceiling_per_run numeric,
    retry_policy_json jsonb NOT NULL DEFAULT '{"maxRetries":2,"backoffMs":1000}',
    timeout_ms integer NOT NULL DEFAULT 60000,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 5. Table: translation_glossaries
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.translation_glossaries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    code text NOT NULL,
    name text NOT NULL,
    description text,
    source_language text NOT NULL,
    target_language text NOT NULL,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'approved', 'retired')),
    version integer NOT NULL DEFAULT 1,
    is_default boolean NOT NULL DEFAULT false,
    created_by text,
    approved_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    approved_at timestamptz,
    UNIQUE (project_id, code)
);

-- =============================================================================
-- 6. Table: translation_glossary_entries
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.translation_glossary_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    glossary_id uuid NOT NULL REFERENCES aidilam_app.translation_glossaries(id),
    source_term text NOT NULL,
    target_term text NOT NULL,
    case_sensitive boolean NOT NULL DEFAULT false,
    match_mode text NOT NULL DEFAULT 'exact' CHECK (match_mode IN ('exact', 'case_insensitive', 'whole_word', 'phrase')),
    notes text,
    priority integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (glossary_id, source_term)
);

-- =============================================================================
-- 7. Table: translation_memory_entries
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.translation_memory_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    source_language text NOT NULL,
    target_language text NOT NULL,
    source_text_hash text NOT NULL,
    source_text_normalized text NOT NULL,
    target_text text NOT NULL,
    provider_code text,
    model_code text,
    glossary_version integer,
    quality_score numeric,
    review_status text NOT NULL DEFAULT 'machine' CHECK (review_status IN ('machine', 'reviewed', 'approved', 'rejected')),
    approved_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_translation_memory_lookup
    ON aidilam_app.translation_memory_entries (project_id, source_language, target_language, source_text_hash);

-- =============================================================================
-- 8. Table: translation_quality_results
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.translation_quality_results (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    translation_run_id uuid NOT NULL REFERENCES aidilam_app.translation_runs(id),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'passed', 'warning', 'failed', 'manual_review_required')),
    cue_alignment_score numeric,
    empty_translation_count integer NOT NULL DEFAULT 0,
    source_copy_count integer NOT NULL DEFAULT 0,
    glossary_violations integer NOT NULL DEFAULT 0,
    timing_violations integer NOT NULL DEFAULT 0,
    length_ratio_warnings integer NOT NULL DEFAULT 0,
    details_json jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 9. Table: translation_review_assignments
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.translation_review_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    subtitle_version_id uuid NOT NULL REFERENCES aidilam_app.subtitle_versions(id),
    translation_run_id uuid REFERENCES aidilam_app.translation_runs(id),
    assigned_to text,
    status text NOT NULL DEFAULT 'unassigned' CHECK (status IN ('unassigned', 'assigned', 'in_review', 'changes_requested', 'approved', 'rejected')),
    priority integer NOT NULL DEFAULT 0,
    due_at timestamptz,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 10. Table: translation_usage_records
-- =============================================================================

CREATE TABLE IF NOT EXISTS aidilam_app.translation_usage_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES aidilam_app.projects(id),
    translation_run_id uuid NOT NULL REFERENCES aidilam_app.translation_runs(id),
    provider_code text NOT NULL,
    model_code text NOT NULL,
    input_units integer NOT NULL DEFAULT 0,
    output_units integer NOT NULL DEFAULT 0,
    estimated_cost numeric NOT NULL DEFAULT 0,
    actual_cost numeric,
    currency text NOT NULL DEFAULT 'USD',
    request_count integer NOT NULL DEFAULT 1,
    retry_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 11. Seed: translation_providers
-- =============================================================================

INSERT INTO aidilam_app.translation_providers (code, name, provider_type, is_external, is_active, capabilities_json) VALUES
    ('mock_deterministic', 'Mock Deterministic (Testing)', 'mock', false, true, '{"languages":["*"],"batch":true}'),
    ('gemini', 'Google Gemini', 'external_api', true, false, '{"languages":["zh","vi","en"],"batch":true}'),
    ('azure_openai', 'Azure OpenAI', 'external_api', true, false, '{"languages":["zh","vi","en"],"batch":true}'),
    ('openai', 'OpenAI', 'external_api', true, false, '{"languages":["zh","vi","en"],"batch":true}'),
    ('local_model', 'Local Model', 'local_api', false, false, '{"languages":["zh","vi"],"batch":true}')
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- 12. Seed: translation_sensitivity_policies
-- =============================================================================

INSERT INTO aidilam_app.translation_sensitivity_policies (code, name, level, allowed_provider_types, allowed_provider_codes, description) VALUES
    ('public', 'Public Content', 1, ARRAY['external_api','local_api','mock'], NULL, 'Content safe for any provider type'),
    ('internal', 'Internal Content', 2, ARRAY['external_api','local_api','mock'], NULL, 'Internal content — all provider types allowed with audit'),
    ('restricted', 'Restricted Content', 3, ARRAY['local_api','mock'], NULL, 'Restricted content — local or mock providers only'),
    ('confidential', 'Confidential Content', 4, ARRAY['mock'], NULL, 'Confidential content — mock provider only until local model is available')
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- 13. Seed: translation_model_configs (mock_default)
-- =============================================================================

INSERT INTO aidilam_app.translation_model_configs (provider_id, code, model_identifier, version, configuration_json, configuration_hash, context_limit, max_output_tokens, cost_input_per_million, cost_output_per_million, currency, is_active)
SELECT
    p.id,
    'mock_default',
    'mock-v1',
    1,
    '{}',
    md5('{}'),
    4096,
    2048,
    0,
    0,
    'USD',
    true
FROM aidilam_app.translation_providers p
WHERE p.code = 'mock_deterministic'
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- 14. Permissions
-- =============================================================================

INSERT INTO aidilam_app.permissions (code, resource, action, description) VALUES
    ('translations.glossary.create', 'translations.glossary', 'create', 'Create translation glossaries'),
    ('translations.glossary.read', 'translations.glossary', 'read', 'View translation glossaries'),
    ('translations.glossary.edit', 'translations.glossary', 'edit', 'Edit translation glossaries'),
    ('translations.glossary.approve', 'translations.glossary', 'approve', 'Approve translation glossaries'),
    ('translations.review.assign', 'translations.review', 'assign', 'Assign translation reviews'),
    ('translations.review.perform', 'translations.review', 'perform', 'Perform translation reviews')
ON CONFLICT (code) DO NOTHING;

-- project_viewer: glossary.read
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'project_viewer'
AND p.code IN ('translations.glossary.read')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- project_editor: glossary.create, glossary.read, glossary.edit
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'project_editor'
AND p.code IN ('translations.glossary.create', 'translations.glossary.read', 'translations.glossary.edit')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- project_admin: all glossary + review permissions
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'project_admin'
AND p.code IN ('translations.glossary.create', 'translations.glossary.read', 'translations.glossary.edit', 'translations.glossary.approve', 'translations.review.assign', 'translations.review.perform')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- project_owner: all glossary + review permissions
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'project_owner'
AND p.code IN ('translations.glossary.create', 'translations.glossary.read', 'translations.glossary.edit', 'translations.glossary.approve', 'translations.review.assign', 'translations.review.perform')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- system_admin: all new permissions
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'system_admin'
AND p.code IN ('translations.glossary.create', 'translations.glossary.read', 'translations.glossary.edit', 'translations.glossary.approve', 'translations.review.assign', 'translations.review.perform')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- service_worker: glossary.read for loading glossary terms during translation
INSERT INTO aidilam_app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM aidilam_app.roles r
CROSS JOIN aidilam_app.permissions p
WHERE r.code = 'service_worker'
AND p.code IN ('translations.glossary.read')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- 15. Grant permissions to aidilam_runtime
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON aidilam_app.translation_providers TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE ON aidilam_app.translation_model_configs TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE ON aidilam_app.translation_sensitivity_policies TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE ON aidilam_app.translation_routing_profiles TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE ON aidilam_app.translation_glossaries TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE ON aidilam_app.translation_glossary_entries TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE ON aidilam_app.translation_memory_entries TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE ON aidilam_app.translation_quality_results TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE ON aidilam_app.translation_review_assignments TO aidilam_runtime;
GRANT SELECT, INSERT, UPDATE ON aidilam_app.translation_usage_records TO aidilam_runtime;

COMMIT;
