# DEP-015C2A Parallel Retry Safety

## Mechanism
Retry uses `withTransaction` with `SELECT ... FOR UPDATE` on the job row.
First request to acquire the lock transitions failed → queued.
Subsequent requests find status = queued, throw PUBLISHING_JOB_NOT_RETRYABLE.

## Live Test: 20 Parallel Retry Requests
- Single failed job (attempt=1, max=3)
- Active reservations = 0 before test

### Results
- 1×HTTP 200 (accepted, retried=true)
- 19×HTTP 409 PUBLISHING_JOB_NOT_RETRYABLE
- 0×HTTP 500

### Final State
- job status: queued
- active reservations: 1
- duplicate reservations: 0
- total reservations: 1
- audit retry events: 1
