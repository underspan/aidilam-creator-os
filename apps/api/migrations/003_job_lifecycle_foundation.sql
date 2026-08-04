-- Migration: 003_job_lifecycle_foundation
-- Task: AIDILAM-DEP-007
-- Description: Add job lifecycle columns, expanded status states, constraints, and indexes
-- Applied to: aidilam_app.jobs
-- Forward-only: no down migration in production

BEGIN;

-- =============================================================================
-- 1. Add new columns (IF NOT EXISTS for safety)
-- =============================================================================

ALTER TABLE aidilam_app.jobs ADD COLUMN IF NOT EXISTS queue_name text;
ALTER TABLE aidilam_app.jobs ADD COLUMN IF NOT EXISTS queue_job_id text;
ALTER TABLE aidilam_app.jobs ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE aidilam_app.jobs ADD COLUMN IF NOT EXISTS worker_id text;
ALTER TABLE aidilam_app.jobs ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
ALTER TABLE aidilam_app.jobs ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;
ALTER TABLE aidilam_app.jobs ADD COLUMN IF NOT EXISTS timeout_seconds integer DEFAULT 300;
ALTER TABLE aidilam_app.jobs ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz;
ALTER TABLE aidilam_app.jobs ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;
ALTER TABLE aidilam_app.jobs ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE aidilam_app.jobs ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- =============================================================================
-- 2. Replace status CHECK constraint to include new states
-- =============================================================================

-- Drop the existing status check constraint.
-- The constraint name may vary; try the most common conventions.
ALTER TABLE aidilam_app.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE aidilam_app.jobs DROP CONSTRAINT IF EXISTS chk_jobs_status;

-- Recreate with expanded status values
ALTER TABLE aidilam_app.jobs ADD CONSTRAINT jobs_status_check
    CHECK (status IN (
        'queued',
        'claimed',
        'running',
        'succeeded',
        'failed',
        'cancelled',
        'cancel_requested',
        'retry_wait',
        'timed_out',
        'dead_letter'
    ));

-- =============================================================================
-- 3. Add constraints
-- =============================================================================

-- timeout_seconds must be between 10 and 86400 when not null
ALTER TABLE aidilam_app.jobs DROP CONSTRAINT IF EXISTS chk_jobs_timeout_seconds;
ALTER TABLE aidilam_app.jobs ADD CONSTRAINT chk_jobs_timeout_seconds
    CHECK (timeout_seconds IS NULL OR (timeout_seconds BETWEEN 10 AND 86400));

-- =============================================================================
-- 4. Add indexes
-- =============================================================================

-- Unique partial index on idempotency_key (also serves as the constraint)
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_idempotency
    ON aidilam_app.jobs (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Partial index on worker_id for active worker lookups
CREATE INDEX IF NOT EXISTS idx_jobs_worker
    ON aidilam_app.jobs (worker_id)
    WHERE worker_id IS NOT NULL;

-- Partial index on lease_expires_at for lease expiry scans
CREATE INDEX IF NOT EXISTS idx_jobs_lease
    ON aidilam_app.jobs (lease_expires_at)
    WHERE status IN ('claimed', 'running');

-- Composite index on queue_name and status for queue dispatching
CREATE INDEX IF NOT EXISTS idx_jobs_queue
    ON aidilam_app.jobs (queue_name, status);

-- =============================================================================
-- 5. Grant permissions to runtime role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON aidilam_app.jobs TO aidilam_runtime;

COMMIT;
