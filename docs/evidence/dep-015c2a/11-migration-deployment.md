# DEP-015C2A Migration & Deployment

## Migration 018
- NOT REQUIRED
- Existing schema (017) already has:
  - `publishing_jobs_idempotency_unique` constraint
  - `publishing_quota_reservations` table with status, project_id, publishing_job_id
  - `publishing_profiles.quota_policy_json` for per-profile quota configuration
  - Advisory locking is built-in PostgreSQL (no schema change needed)

## Deployment
- Service: aidilam-app (rebuilt and deployed)
- Worker: not redeployed (no publishing worker changes needed)
- Method: docker compose build + up -d
- Authorization: I_CONFIRM_DEPLOY_AIDILAM_PUBLISHING_CONCURRENCY_RETRY_FIXES
- Result: healthy within 20 seconds

## Code Changes
- File: `/opt/aidilam/apps/api/src/modules/publishing/api/job-routes.ts`
- Changes:
  1. Added try/catch around withTransaction for 23505 recovery
  2. Added pg_advisory_xact_lock for quota admission
  3. Added quota admission check (reserved + committed vs daily limit)
  4. Rewrote retry endpoint with FOR UPDATE row lock + withTransaction
  5. Added quota check in retry path
