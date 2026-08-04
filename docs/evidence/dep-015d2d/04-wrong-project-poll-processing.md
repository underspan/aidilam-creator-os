# DEP-015D2D Wrong-Project Poll Processing (Executed)

## Setup
- Job in succeeded state (Project A)
- Enqueued BullMQ item: jobId=Project A, projectId=wrong (non-existent)

## Worker Processing
- Received payload with wrong projectId
- SELECT WHERE id=$1 AND project_id=$2 → 0 rows
- Log: "Publishing job not found or wrong project"
- Silently skipped

## Result
- pollStatus calls: 0
- Job unchanged (succeeded)
- Adapter calls: 0
- Cross-project mutations: 0
- Metadata leakage: NONE
