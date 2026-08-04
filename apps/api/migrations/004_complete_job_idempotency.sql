-- Migration: 004_complete_job_idempotency
-- Task: AIDILAM-DEP-007A
-- Description: Add dedicated idempotency_records table for canonical request fingerprinting
-- Forward-only: no down migration in production

BEGIN;

-- ============================================================
-- Idempotency Records Table
-- ============================================================

CREATE TABLE IF NOT EXISTS aidilam_app.idempotency_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id text NOT NULL,
    project_id uuid NOT NULL,
    operation text NOT NULL DEFAULT 'job.create',
    idempotency_key text NOT NULL,
    request_fingerprint text NOT NULL,
    resource_type text NOT NULL DEFAULT 'job',
    resource_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
    CONSTRAINT uq_idempotency_scope UNIQUE (actor_id, project_id, operation, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires
    ON aidilam_app.idempotency_records (expires_at)
    WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_idempotency_resource
    ON aidilam_app.idempotency_records (resource_type, resource_id);

-- Grant permissions to runtime role
GRANT SELECT, INSERT ON aidilam_app.idempotency_records TO aidilam_runtime;

COMMIT;
