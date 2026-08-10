# Publishing Operations Runbook

## Architecture Overview
- Queue: `aidilam-publishing` (BullMQ, prefix `aidilam:queue`)
- Worker: `aidilam-worker` (single instance, concurrency=2)
- DB: PostgreSQL `aidilam_app` schema
- Storage: MinIO `aidilam-private` bucket

## Job Lifecycle
`queued → publishing → succeeded/failed/cancelled`

## Attempt Lifecycle
`running → succeeded/retryable_failed/permanent_failed/cancelled`

## Reservation Lifecycle
`reserved → committed/released`

## Concurrency
- Global: 2 simultaneous publishing jobs
- Project: 3 per project
- Platform: 10 per platform
- Account: 10 per account

## Retry
- Max attempts: 3
- Backoff: exponential (5s base, 2x multiplier)
- Exhaustion: job → failed, reservation released

## Polling
- Interval: governed by adapter
- Timeout: platform-specific
- Recovery: stale poll detected after threshold

## Cancellation
- Request sets `cancel_requested`
- Worker invokes `adapter.cancel` if supported
- Terminal: `cancelled`, reservation released

## Recovery
- Stale publishing threshold: 120s
- Stale poll threshold: 120s
- Recovery scheduler: every 30s
- Uses `FOR UPDATE SKIP LOCKED`

## Inspection Commands

### Jobs
```sql
SELECT id, project_id, status, current_stage, current_attempt, error_code
FROM aidilam_app.publishing_jobs WHERE status NOT IN ('succeeded','failed','cancelled')
ORDER BY updated_at;
```

### Attempts
```sql
SELECT id, publishing_job_id, status, attempt_number, error_code
FROM aidilam_app.publishing_attempts WHERE status='running';
```

### Reservations
```sql
SELECT id, publishing_job_id, status
FROM aidilam_app.publishing_quota_reservations WHERE status='reserved';
```

### BullMQ
```bash
docker exec aidilam-redis redis-cli -a $REDIS_PW --no-auth-warning keys 'aidilam:queue:*publishing*' | wc -l
```

## Diagnosing Issues

### Stuck Job
1. Check `updated_at` against stale threshold
2. Check worker health
3. Check attempt status
4. Recovery scheduler should auto-recover after threshold

### Retry Exhaustion
1. Check `current_attempt >= max_attempts`
2. Review `error_code` history in attempts
3. Check platform adapter status

### Polling Timeout
1. Check `external_publish_id` exists
2. Verify adapter poll support
3. Check platform availability

### Concurrency Saturation
```sql
SELECT count(*) FROM aidilam_app.publishing_jobs WHERE status='publishing';
```

## Safe Recovery
- Recovery scheduler handles stale jobs automatically
- Manual: Use `reconcileMissingEnqueues()` for orphaned queued jobs
- Never manually UPDATE status without proper state machine transitions

## Cleanup
- Only delete resources with test prefixes
- Never delete active/terminal production jobs
- Check cross-project isolation before any bulk operation

## WARNING
- Do NOT touch resources belonging to other projects
- Do NOT manually set jobs to `succeeded` without proper settlement
- Do NOT delete reservations without checking settlement state
