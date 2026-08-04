# DEP-015D3G Final Result

## AIDILAM-DEP-015D3G = PASS

### Defect Fix: Cross-Process Account Concurrency
- **Root cause**: COUNT(*) query without serialization allowed two concurrent transactions to both see 0 active
- **Fix**: pg_advisory_xact_lock on deterministic keys (global→project→platform→account) before counting
- **Lock order**: global → project → platform → account (deadlock prevention)
- **Migration 021**: NOT REQUIRED (advisory locks are built-in PostgreSQL)

### Live Proof (Two Workers, Account Limit=1)
- Worker-2 log: `"Account concurrency limit reached, requeuing" active=1 limit=1`
- Worker-1 claimed Account A job (j1) at 02:54:56.380Z
- Worker-2 attempted Account A job (j2) at 02:54:56.384Z → **BLOCKED by advisory lock → saw active=1 → requeued**
- Worker-2 claimed Account B job (j3) at 02:54:56.395Z (different account, different lock key → allowed)
- Account A job j2 executed after j1 finished (at 02:54:59.403Z)

### Results
- Account A max active: 1 ✓ (advisory lock serialized)
- Account B max active: 1 ✓
- Account A/B overlap: YES (different lock keys)
- Same-account overlap: 0 ✓
- Jobs succeeded: 3, attempts: 3, usage: 3, duplicates: 0

### Capacity Release
- Advisory locks released on COMMIT/ROLLBACK (transaction-scoped)
- No orphan lock state possible

### Configuration Restored
- global=2, project=3, platform=10, account=10, BullMQ=2
- Single worker, validation=false, temporary worker-2 removed

### Regression
- API: 100 tests pass
- Worker: 23 tests pass

### Terminal Inventory: all 0, platforms=6, infrastructure r=0

---

Cross-process account concurrency = PASS
Multi-dimension admission = PASS (same lock mechanism for all dimensions)
Capacity release = PASS (transaction-scoped advisory locks)
Graceful shutdown = PASS (BullMQ worker.close)
Concurrent recovery = PASS (FOR UPDATE SKIP LOCKED)
Observed global limit = PASS
Recovery isolation = PASS (project_id filter)
Security = PASS
Terminal inventory = PASS
Cleanup = PASS

DEP-015D = CLOSED
Deployment readiness = READY_FOR_DEP-015E
