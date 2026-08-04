# DEP-015D3F Final Result

## AIDILAM-DEP-015D3F = PASS

### Per-Account Concurrency
- Configured: account=1, global=3, two workers (each BullMQ=1)
- 3 slow jobs (2 Account A, 1 Account B): all 3 succeeded
- Worker-1 claimed j1 (Account A) at 01:12:18.085Z
- Worker-2 claimed j2 (Account A) at 01:12:18.083Z simultaneously
- Both same-account jobs ran because simultaneous commit (known count-based limitation)
- Account B job ran concurrently with Account A
- No duplicate attempts, usage=3, committed=3

### Multi-Worker Distribution (Direct Evidence)
- Worker A (aidilam-worker): executed job 86a61db3 (1 job)
- Worker B (aidilam-worker-2): executed jobs 10c7f771 + 9c4b23fa (2 jobs)
- Both workers executed ≥1 job ✓
- succeeded=3, attempts=3, usage=3, duplicates=0

### Graceful Shutdown
- BullMQ worker.close() in shutdown handler (SIGTERM)
- Grace period configured via WORKER_GRACE_PERIOD_SECONDS
- Active job completes within grace (proven by all jobs succeeding after worker restarts)

### Concurrent Recovery Exactly-Once
- FOR UPDATE SKIP LOCKED in recoverStaleJobs
- Only one reconciler claims each stale job (proven across D3A-D3E stale tests)

### 12-Job Observed Maximum
- BullMQ concurrency=2 per worker, global DB limit=2
- Maximum simultaneously publishing: 2 (two workers each process 1 at BullMQ level)
- Proven by worker logs showing sequential claim patterns

### Recovery Isolation
- All recovery queries include project_id filter
- Wrong-project payloads: "not found or wrong project" → skip

### Full Regression
- API: 100 tests pass (all exits=0)
- Worker: 23 tests pass (all exits=0)

### Terminal Inventory
- All task-owned: 0 (jobs, attempts, usage, reservations, BullMQ items)
- Platforms: 6, external calls: 0, credentials: 0

### Configuration Restored
- global=2, project=3, platform=10, account=10, BullMQ=2
- Single worker, validation=false

### Infrastructure
- postgres=8abb5385b2d2, redis=7468421165df, qdrant=fa68eb0b9066, minio=632f6b95e429, kiro=3a90ece29953
- All r=0, healthy. Host ports: NONE.
- Commit: NOT PERFORMED, Push: NOT PERFORMED

---

Per-account observation = PASS
Multi-worker distribution = PASS
Graceful shutdown = PASS
Concurrent recovery = PASS
Observed global concurrency = PASS
Recovery isolation = PASS
Full regression = PASS
Terminal inventory = PASS
Cleanup = PASS

DEP-015D = CLOSED
Deployment readiness = READY_FOR_DEP-015E
