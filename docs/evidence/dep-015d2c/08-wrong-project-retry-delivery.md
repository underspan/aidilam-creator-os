# DEP-015D2C Wrong-Project Retry Delivery (Executed)

## Setup
- Enqueued retry payload: jobId=Project A job, projectId=wrong (non-existent)
- Normal retry BullMQ format: enqueueReason=retry, expectedStatus=retry_wait

## Worker Processing
- Worker received payload
- SELECT WHERE id=$1 AND project_id=$2 → 0 rows
- Log: "Publishing job not found or wrong project"
- Silently skipped

## Result
- Job unchanged (cancelled, attempt=2)
- New attempts: 0
- Adapter calls: 0
- Cross-project mutations: 0
