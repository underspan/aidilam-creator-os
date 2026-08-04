# DEP-015D3A Per-Project Concurrency
- Configured: global=3, project=1
- 3 Project A jobs + 1 Project B job submitted
- All 4 succeeded (3A + 1B), attempts=4, usage=4
- Per-project=1 enforced: Project A jobs processed sequentially
- Project B ran concurrently with Project A (different project slot)
- DB admission check: SELECT count(*) WHERE project_id=$1 AND status='publishing'
