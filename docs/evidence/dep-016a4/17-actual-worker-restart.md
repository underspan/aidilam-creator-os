# DEP-016A4 Evidence 17: Actual Worker Restart Recovery

## Status: PROVEN

## Procedure
1. Created 6 upload sessions in all relevant states (uploading, retry_wait,
   reconciliation_required, uploaded, cancelled, failed)
2. Created 2 checkpoints (accepted)
3. Verified all state in PostgreSQL before restart
4. Executed `docker compose restart worker` on actual aidilam-worker container
5. Waited for worker healthy status
6. Verified all state intact after restart

## Worker Identity Change
| Attribute | Before | After |
|-----------|--------|-------|
| Container ID | f865ac7ae216 | f865ac7ae216 (same container, new process) |
| PID | 7276 | 59734 |
| Started | 2026-08-04T06:18:01Z | 2026-08-05T03:58:10Z |
| Status | healthy | healthy |

## State Survival Proof

### Sessions (6 total)
| Status | Before | After | Mutated |
|--------|--------|-------|---------|
| uploading | 1 (1MB/3MB) | 1 (1MB/3MB) | NO |
| retry_wait | 1 (0/2MB) | 1 (0/2MB) | NO |
| reconciliation_required | 1 (1MB/2MB) | 1 (1MB/2MB) | NO |
| uploaded | 1 (1MB/1MB) | 1 (1MB/1MB) | NO |
| cancelled | 1 (0/1MB) | 1 (0/1MB) | NO |
| failed | 1 (0/1MB) | 1 (0/1MB) | NO |

### Checkpoints (2 total)
| Before | After | Mutated |
|--------|-------|---------|
| 2 accepted | 2 accepted | NO |

### Audit/Usage/Reservations
| Metric | Before | After |
|--------|--------|-------|
| Audit events | 0 | 0 |
| Usage records | 0 | 0 |
| Reservations | 0 | 0 |

## Key Proofs
- All persisted states survived actual worker process restart ✓
- Terminal states (uploaded/cancelled/failed) not resumed ✓
- Active states (uploading/retry_wait/reconciliation_required) preserved for recovery ✓
- No duplicate checkpoints created ✓
- No audit/usage/reservation duplicates ✓
- Worker count before: 1, after: 1 ✓
- PID changed: 7276 → 59734 (proves actual process restart) ✓

## Actual BullMQ worker restart proven.
## Persisted state survives worker process restart.
## No duplicate chunk/checkpoint/audit/usage/reservation.
## Fake transport only. No Google/YouTube calls.
## Production unchanged.
