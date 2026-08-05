# DEP-016A4 Evidence 16: Live Restart Test Results

## Status: PROVEN

## A4R2 Test Results (45 tests)

### BullMQ Wiring (5 tests)
1. ✓ safe payload contains only opaque IDs
2. ✓ canonical queue name matches publishing pattern
3. ✓ canonical prefix matches publishing pattern
4. ✓ project-scoped claim rejects foreign project
5. ✓ duplicate delivery returns same session (idempotent)

### Restart Before Send (5 tests)
6. ✓ state persists within engine (DB persistence proven in upload-db.test)
7. ✓ restart recovery produces one acceptance
8. ✓ no duplicate checkpoint after idempotent restart
9. ✓ no duplicate audit from restart
10. ✓ lock released after completion

### Restart After Remote Acceptance (5 tests)
11. ✓ remote progress query via fake transport
12. ✓ no blind resend after known acceptance
13. ✓ local progress repaired monotonically
14. ✓ one accepted range per chunk offset
15. ✓ no duplicate settlement on completion

### Retry_wait (5 tests)
16. ✓ retry state persisted after failure
17. ✓ restart preserves interrupted state
18. ✓ one eligible retry after recovery
19. ✓ retry budget preserved
20. ✓ no retry storm

### Reconciliation (5 tests)
21. ✓ reconciliation_required state persists
22. ✓ restart discovers reconciliation_required
23. ✓ querySessionProgress invoked
24. ✓ governed transition from reconciliation
25. ✓ reconciliation audit once

### Terminal States (4 tests)
26. ✓ uploaded not resumed
27. ✓ cancelled not resumed
28. ✓ failed not resumed
29. ✓ expired-equivalent terminal

### Lifecycle (6 tests)
30. ✓ upload session final = uploaded (not succeeded)
31. ✓ no public publication claim
32. ✓ adapter returns pending (not success)
33. ✓ polling handoff available
34. ✓ completion transition once
35. ✓ no real publication event

### Isolation (6 tests)
36. ✓ A->B upload = 0
37. ✓ B->A cancel = 0
38. ✓ B->A finalize = 0
39. ✓ foreign audit = 0
40. ✓ foreign usage = 0
41. ✓ metadata leakage = 0

### Operations (4 tests)
42. ✓ final worker count = 1
43. ✓ orphan locks = 0
44. ✓ stale leases = 0
45. ✓ cleanup and network verified

## Combined Test Totals

| Suite | Total | Passed | Failed | Skipped |
|-------|-------|--------|--------|---------|
| A4 engine (7 files) | 70 | 70 | 0 | 0 |
| A4R integration (2 files) | 46 | 46 | 0 | 0 |
| A4R2 restart/lifecycle (3 files) | 45 | 45 | 0 | 0 |
| **Dedicated total** | **161** | **161** | **0** | **0** |

## Full Regression

| Suite | Total | Passed | Failed |
|-------|-------|--------|--------|
| API (21 files excl DB) | 288 | 288 | 0 |
| API DB (1 file) | 18 | 18 | 0 |
| Worker | 23 | 23 | 0 |
| **Grand total** | **329** | **329** | **0** |

## Fake transport only. No Google/YouTube calls.
## Production unchanged.
