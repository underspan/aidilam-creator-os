# DEP-016A3 Persistence Test Results (A3.1R2)

## Session Tests: 11/11 PASS
- T1: session create = PASS
- T2: stateHash stored (not raw) = PASS
- T3: active unexpired lookup = PASS
- T4: expired session excluded = PASS
- T5: first consume succeeds = PASS
- T6: second consume rejected = PASS (0 rows, atomic WHERE status='redirect_ready')
- T7: wrong-project consume = PASS (0 mutation)
- T8: stale session expiry = PASS
- T9: concurrent consume = PASS (only 1 wins, conditional UPDATE)
- T10: final consumed count correct = PASS
- T11: cleanup complete = PASS

## Client Config Tests (from A3.1R): 5/5 PASS
- T1: create = PASS
- T2: references only = PASS
- T3: enabled lookup = PASS
- T4: disabled excluded = PASS
- T5: foreign-project read = PASS (0 rows)

## Binding Tests (from A3.1R): 7/7 PASS
- T13: credential reference only = PASS
- T14: active lookup project-scoped = PASS
- T16: revoke succeeds = PASS
- T17: repeated revoke idempotent = PASS
- T18: wrong-project revoke = PASS (0 mutation)
- T19: no raw-secret columns = PASS
- T20: cleanup = PASS

## Totals
- DB-backed persistence tests: 23/23 PASS
- API regression: 123/123 PASS
- Worker regression: 23/23 PASS
- Build: PASS (tsc clean after rowCount fix)
