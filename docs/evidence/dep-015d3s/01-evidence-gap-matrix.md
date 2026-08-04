# DEP-015D3S Evidence Gap Matrix

| Requirement | Status | Evidence Source |
|-------------|--------|---------------|
| Layer A: ownership integrity | PROVEN | D3Q cross_project_*=0, code review (project_id flows from job to all ops) |
| Layer B: multi-project contamination | PROVEN | D3Q: simultaneous 2-project recovery, all cross_project=0 |
| Layer C: tenant entry-point isolation | PROVEN | D3P: 8/8 API cases = 404 |
| Layer D: audit cardinality | PROVEN | D3S: direct query results below |
| Stale polling positive control | PROVEN | D3S: poll_job=succeeded, attempt=2 |
| Retry reconciliation created=1, dup=0 | PROVEN | D3S: retry_job=succeeded, attempt=2 (item restored, executed) |
| attempt_succeeded = 12 | PROVEN | D3S: direct query = 12 |
| Duplicate job terminal = 0 | PROVEN | D3S: dup_job_terminal=0 |
| Duplicate attempt terminal = 0 | PROVEN | D3S: dup_attempt_terminal=0 |
| Duplicate usage = 0 | PROVEN | D3S: dup_usage=0 |
| Duplicate reservation settlement = 0 | PROVEN | D3S: dup_reservation=0 |
| Queue cross-project items = 0 | PROVEN | D3Q: cross_project_queue_items=0 |
| Metadata leakage = 0 | PROVEN | D3P: all 404, no metadata returned |
