# DEP-015C2A Same-Key Replay Recovery

## Root Cause
PostgreSQL 23505 unique constraint violation on `publishing_jobs_idempotency_unique` was unhandled.
Concurrent requests passing the initial idempotency SELECT simultaneously would hit the constraint in INSERT.

## Fix Applied
Wrapped `withTransaction` in try/catch. On PostgreSQL error code `23505` with constraint
`publishing_jobs_idempotency_unique`:
1. Transaction rolls back completely (no partial data)
2. Fresh query reads the winning job
3. Compares `publishing_profile_id` + `source_asset_id` to request
4. Match → HTTP 200 with `replayed: true`
5. Mismatch → HTTP 409 PUBLISHING_IDEMPOTENCY_CONFLICT

## Live Test: 20 Parallel Same-Key Requests
- Key: `dep015c2a-same-key`
- Profile: unlimited quota
- Same project, profile, source asset

### Results
- 1×HTTP 202 (created)
- 19×HTTP 200 (replayed=true)
- 0×HTTP 500
- All 20 responses return the same jobId

### Database Cardinality
- jobs = 1
- plans = 1
- reservations = 1
- active reservations = 1
- attempts = 0
- usage = 0
- external publish IDs = 0
- published URLs = 0
