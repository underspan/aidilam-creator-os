# DEP-015C2A Retry Live Proof

## Setup
- Created job via API (unlimited profile, queued)
- Simulated worker failure: SQL UPDATE status=failed, attempt=1, max=3
- Released reservation (simulating worker settlement)

## Single Retry
- POST /api/v1/projects/:projectId/publishing/jobs/:jobId/retry
- HTTP 200 `{ "data": { "jobId": "...", "status": "queued", "retried": true } }`

## Post-Retry State
- job status: queued
- progress: 0
- current_attempt: 1 (unchanged — worker increments on execution)
- active reservations: 1
- total reservations: 1 (old released, new reserved via ON CONFLICT)
- audit retry events: 1
- attempts: 0
- usage: 0
- adapter publish calls: 0
- external ID: null
- published URL: null

## Eligibility Denial
- Queued job retry → 409 PUBLISHING_JOB_NOT_RETRYABLE
- Cancelled job retry → 409 (terminal)
- Succeeded job retry → 409 (terminal)
