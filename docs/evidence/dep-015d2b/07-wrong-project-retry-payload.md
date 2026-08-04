# DEP-015D2B Wrong-Project Retry Payload
- Enqueued: jobId=Project B job, projectId=Project A
- Worker: SELECT WHERE id=$1 AND project_id=$2 → 0 rows
- Log: "Publishing job not found or wrong project"
- Result: B job unchanged (succeeded, attempt=1)
- New attempts: 0, adapter calls: 0
