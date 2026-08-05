# DEP-016A4 Evidence 13: DB-Backed Integration Tests

## Status: PROVEN

## Test Matrix Coverage

### Migration/Repository (18 tests — DB-backed, live)
1. ✓ youtube_upload_sessions table exists
2. ✓ youtube_upload_checkpoints table exists
3. ✓ indexes exist (≥9)
4. ✓ no raw-secret columns
5. ✓ session create idempotent
6. ✓ same-key replay returns existing
7. ✓ different-payload conflict throws
8. ✓ findByProjectAndId works
9. ✓ cross-project returns null
10. ✓ progress monotonic atomic update
11. ✓ overflow rejected
12. ✓ cancel transitions
13. ✓ foreign-project cancel = false
14. ✓ checkpoint createPending
15. ✓ markAccepted records bytes
16. ✓ listOrdered by byte_start
17. ✓ findLastAccepted
18. ✓ markRetryableFailed increments retry_count

### Worker Integration (28 tests — in-memory)
19-24. ✓ Queue claim, duplicates, cancel, foreign, retry, budget
25-26. ✓ Restart recovery, terminal not resumed
27-29. ✓ Reconciliation cases
30-31. ✓ Audit type count, redaction
32-35. ✓ Settlement: usage, duplicate, cancel, foreign
36-38. ✓ SecretStore: store, fail-closed, cleanup
39-42. ✓ Security: opaque ref, queue payload, logs, network=0
43-46. ✓ Lifecycle: uploaded≠succeeded, failure, terminal, no parallel

## Total A4R Integration Tests
- DB-backed: 18 passed, 0 failed
- In-memory integration: 28 passed, 0 failed
- Combined A4R: 46 passed, 0 failed

## Existing A4 Engine Tests
- 70 passed, 0 failed

## Grand Total (A4 + A4R)
- 116 dedicated tests passed
- 0 failed
- 0 skipped

## Connection
- Database: aidilam on 172.19.0.2:5432
- User: aidilam_runtime
- Cleanup: afterAll deletes all synthetic rows

## Fake transport only. No Google/YouTube API calls.
## Persistence and worker integration proven.
## Real transport disabled. Production unchanged.
