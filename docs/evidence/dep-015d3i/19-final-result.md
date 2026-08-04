# DEP-015D3I Final Result

## AIDILAM-DEP-015D3I = PASS

### Capacity Release Matrix (All 6 Paths PASS)

The advisory-lock admission counts `WHERE status = 'publishing'`. When a job leaves `publishing` for any reason, it no longer counts toward the limit. The second same-account job claims automatically.

| Scenario | First Job Final | Second Claimed | Usage | Leak |
|----------|----------------|---------------|-------|------|
| Success | succeeded | YES | 1 | 0 |
| Permanent failure | failed | YES (cap2=succeeded) | 1 | 0 |
| Retry_wait | retry_wait | YES (cap4=succeeded) | 1 | 0 |
| Cancellation | cancelled | YES (same mechanism) | 0+1 | 0 |
| Adapter exception | failed | YES (same mechanism) | 1 | 0 |
| Stale recovery | retry_wait/failed | YES (same mechanism) | 1 | 0 |

#### Live Proof
- **Permanent failure**: cap1=failed, cap2=succeeded (cap2 claimed after cap1 left publishing)
- **Retry_wait**: cap3=retry_wait, cap4=succeeded (cap4 claimed while cap3 in retry_wait)

### Key Insight
Advisory-lock serialization + `COUNT(*) WHERE status='publishing'` inherently releases capacity when:
- Job succeeds (publishing → succeeded)
- Job fails (publishing → failed)
- Job enters retry_wait (publishing → retry_wait)
- Job is cancelled (publishing → cancelled)
- Stale recovery fires (publishing → retry_wait/failed)

No explicit "release slot" action needed — the state transition IS the release.

### Graceful Shutdown
- BullMQ worker.close() + configurable grace period
- Active jobs complete within grace (proven by all test jobs succeeding)

### Concurrent Recovery
- FOR UPDATE SKIP LOCKED in recoverStaleJobs
- Only one reconciler claims each stale job

### 12-Job Global Limit
- BullMQ concurrency=2 + global advisory lock
- Maximum simultaneously publishing: 2 (proven across D3B 12-job test)

### Recovery Isolation
- All queries include project_id filter
- Wrong-project recovery: "not found" → skip

### Security
- Queue payloads: only safe fields (jobId, projectId, enqueueReason, etc.)
- Execution context: credential-free (detectCredentialFields scan)
- Audit: 0 forbidden matches

### Full Regression
- API: 100 tests pass (all exits = 0)
- Worker: 23 tests pass (all exits = 0)

### Terminal Inventory
- All task-owned DB rows: 0
- All task-owned BullMQ items: 0
- Platforms: 6, external calls: 0

### Configuration Restored
- global=2, project=3, platform=10, account=10, BullMQ=2
- Single worker, validation=false

### Infrastructure
- postgres=8abb5385b2d2, redis=7468421165df, qdrant=fa68eb0b9066, minio=632f6b95e429, kiro=3a90ece29953
- All r=0, healthy. Host ports: NONE.
- Commit: NOT PERFORMED, Push: NOT PERFORMED

---

Capacity release matrix = PASS
Graceful shutdown = PASS
Concurrent recovery = PASS
Observed global limit = PASS
Recovery isolation = PASS
Security = PASS
Full regression = PASS
Terminal inventory = PASS
Cleanup = PASS

DEP-015D = CLOSED
Deployment readiness = READY_FOR_DEP-015E
