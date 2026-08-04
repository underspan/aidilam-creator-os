# DEP-015D1 Queue Contract

## Queue
- Name: aidilam-publishing
- Prefix: aidilam:pub
- Concurrency: 1
- Attempts: 1 (no auto-retry in D1)

## Payload
- jobId, projectId, enqueueReason, expectedStatus, queueVersion
- No credentials, tokens, plans, captions, paths, URLs

## Deterministic Job ID
- Format: pub-{jobId}
- Duplicate enqueue: no-op (BullMQ rejects duplicate IDs)

## Enqueue Trigger
- API job-create: enqueue if status=queued (fire-and-forget)
- API retry: enqueue after transition to queued
- Scheduler promotion: enqueue after scheduled→queued
