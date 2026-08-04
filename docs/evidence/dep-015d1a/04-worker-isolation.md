# DEP-015D1A Worker Isolation

## Wrong-Project Payload
- Enqueued: jobId=Project A, projectId=Project B
- Worker: SELECT WHERE id=$1 AND project_id=$2 → 0 rows
- Result: silently skipped (logged warning)
- Job A: remains queued, 0 attempts
- Adapter calls: 0

## Code-Level Guards
- All worker queries include project_id filter
- Plan load: WHERE p.project_id=$2
- Asset load: WHERE id=$1 AND project_id=$2
- Foreign resources: not accessible
- Cross-project mutations: 0
