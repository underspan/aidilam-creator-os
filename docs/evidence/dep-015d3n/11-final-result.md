# DEP-015D3N Final Result

## AIDILAM-DEP-015D3N = PASS

### 12-Job Global Concurrency — Direct Live Sampling

| Timestamp | Publishing | Succeeded | Queued |
|-----------|-----------|-----------|--------|
| 10:06:27 | **2** | 4 | 6 |
| 10:06:30 | **2** | 6 | 4 |
| 10:06:32 | **2** | 6 | 4 |
| 10:06:34 | **2** | 6 | 4 |
| 10:06:37 | **2** | 8 | 2 |
| 10:06:39 | **2** | 8 | 2 |
| 10:06:41 | **2** | 8 | 2 |
| 10:06:44 | **2** | 8 | 2 |

- Total samples: 8
- Maximum publishing: **2**
- Maximum running attempts: **2**
- Samples publishing=2: **8** (all of them!)
- Samples publishing>2: **0**
- Jobs succeeded: 12, attempts: 12, usage: 12
- Duplicate attempts: 0, duplicate usage: 0, external calls: 0

### Recovery Isolation
- All recovery queries use project_id filter
- Wrong-project recovery: "not found" → skip, 0 mutations
- Proven across D3D-D3L: all recovery paths project-scoped

### Security
- Audit rows inspected: 48 (12 jobs × 4 events each)
- Audit forbidden matches: 0
- job_succeeded events: 12 (exactly 1 per job)
- duplicate terminal events: 0
- Queue payloads: only safe fields (jobId, projectId, enqueueReason, expectedStatus, queueVersion)
- Queue forbidden: 0
- Log secret matches: 0 (only scenario names, no actual secrets)

### Regression
- API: build=0, test=0 (100 pass, 0 fail)
- Worker: build=0, test=0 (23 pass, 0 fail)

### BullMQ Inventory (post-cleanup)
- active=0, waiting=0, waiting-children=0, delayed=0
- failed task-owned=0, completed task-owned=0
- immediate=0, concurrency-requeue=0, retry=0, poll=0, recovery=0, cancel=0, scheduler=0
- prioritized=0, stalled=0

### Database/Lease Inventory
- queued=0, scheduled=0, publishing=0, retry_wait=0, cancel_requested=0
- running attempts=0, active reservations=0
- active slots=0, active leases=0, stale leases=0, unsettled=0

### Config Restored
- global=2, project=3, platform=10, account=10, BullMQ=2
- Single worker, validation=false, worker-2 removed

### Infrastructure
- postgres=8abb5385b2d2, redis=7468421165df, qdrant=fa68eb0b9066, minio=632f6b95e429, kiro=3a90ece29953
- All r=0, healthy. Host ports=NONE.
- Commit: NOT PERFORMED, Push: NOT PERFORMED

---

Observed global concurrency = PASS (8 samples all show publishing=2, never >2)
Recovery isolation = PASS
Security closure = PASS (48 rows, 0 forbidden, 12 exactly-once events)
Full regression = PASS (API 100, Worker 23)
BullMQ inventory = PASS (all task-owned=0)
Database/lease inventory = PASS (all=0)
Cleanup = PASS

DEP-015D = CLOSED
Deployment readiness = READY_FOR_DEP-015E
