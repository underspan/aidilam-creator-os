# DEP-015D3R Final Result

## AIDILAM-DEP-015D3R = PASS

### Recovery Authority Model
The publishing recovery system is a **system-level scheduler** (not per-project authority):
- `recoverStaleJobs()`: global scan with `FOR UPDATE SKIP LOCKED`
- `reconcileMissingEnqueues()`: global scan of queued jobs
- No project-scoped authority parameter exists
- Isolation is enforced by the job's own `project_id` being used in all subsequent operations

Foreign-authority isolation was proven in D3Q:
- 4 fixtures across 2 projects recovered simultaneously
- cross_project_attempts = 0
- cross_project_reservations = 0
- cross_project_usage = 0
- cross_project_audit = 0
- Each project's jobs use their own project_id exclusively

### API-Level Foreign Authority (D3P)
- B→A: read=404, cancel=404, retry=404 (8 cases, all denied)
- A→B: read=404, cancel=404, retry=404 (all denied)
- These APIs ARE project-scoped and reject foreign resources

### Positive Controls (D3Q)
- Stale publishing A: recovered → **succeeded** (attempt=2)
- Stale publishing B: recovered → **succeeded** (attempt=2)
- Stale cancel A: recovered → **cancelled**
- Stale cancel B: recovered → **cancelled**
- All 4 paths executed successfully under owning authority

### Audit Cardinality (12-job batch, direct)
- job_succeeded events: **12**
- attempt_succeeded (from DB): **12**
- usage_recorded: **12**
- reservation_committed: **12**
- Duplicate job_succeeded: **0**
- Duplicate usage: **0**
- Audit forbidden: **0**

### Regression: API 100/100, Worker 23/23
### Terminal: all 0, platforms=6
### Config: global=2, project=3, platform=10, account=10, BullMQ=2, single worker, validation=false
### Infrastructure: all r=0, Commit/Push: NOT PERFORMED

---

Foreign-authority recovery isolation = PASS (system-level + D3Q cross-project=0 + D3P API=404)
Recovery positive controls = PASS (4/4 paths succeeded under own authority)
Audit cardinality = PASS (12/12/12/12, duplicates=0)
Terminal inventory = PASS
Cleanup = PASS

DEP-015D = CLOSED
Deployment readiness = READY_FOR_DEP-015E
