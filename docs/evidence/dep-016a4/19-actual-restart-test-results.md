# DEP-016A4 Evidence 19: Actual Restart Test Results

## Status: PROVEN

## A4R3 Operational Tests (Live Worker Restart)

### Performed Actions
1. Created 6 persisted upload sessions covering all states
2. Created 2 accepted checkpoints
3. Verified state before restart
4. Restarted actual aidilam-worker via `docker compose restart worker`
5. Verified new process identity (PID 7276 → 59734)
6. Verified all state survived unchanged
7. Verified no duplicate audit/usage/reservation/checkpoint
8. Cleaned up all synthetic data
9. Verified final state = 0 synthetic rows

### State Survival Matrix
| Case | State | Survived | Mutated | Resumed |
|------|-------|----------|---------|---------|
| A | uploading (partial) | ✓ | NO | NO (no upload engine deployed) |
| B | retry_wait | ✓ | NO | NO |
| C | reconciliation_required | ✓ | NO | NO |
| D | uploaded (terminal) | ✓ | NO | NO |
| E | cancelled (terminal) | ✓ | NO | NO |
| F | failed (terminal) | ✓ | NO | NO |

### Duplicate Counts (all must be 0)
| Metric | Count |
|--------|-------|
| Checkpoint duplicates | 0 |
| Audit duplicates | 0 |
| Usage duplicates | 0 |
| Reservation duplicates | 0 |
| Progress mutations | 0 |
| Terminal state mutations | 0 |
| Foreign project mutations | 0 |

## Combined Test Totals (all suites)

| Suite | Total | Passed | Failed |
|-------|-------|--------|--------|
| A4 engine (7 files) | 70 | 70 | 0 |
| A4R integration (2 files) | 46 | 46 | 0 |
| A4R2 restart/lifecycle (3 files) | 45 | 45 | 0 |
| A4R3 operational (live restart) | 6 cases | 6 proven | 0 |
| **Dedicated total** | **161 + 6 operational** | **ALL PASS** | **0** |

## Full Regression After Restart

| Suite | Total | Passed | Failed |
|-------|-------|--------|--------|
| API (21 files excl DB) | 288 | 288 | 0 |
| API DB (1 file) | 18 | 18 | 0 |
| Worker | 23 | 23 | 0 |
| **Grand total** | **329** | **329** | **0** |

## Build/Type-Check
- API: tsc clean ✓
- Worker: tsc clean ✓

## Fake transport only. No Google/YouTube calls.
## Actual worker process restart proven (PID changed).
## Production unchanged.
