# DEP-015D2B Cancel vs Success Race
## Success-before-cancel (proven live)
- Job succeeded (mock instant publish)
- Cancel attempt: 409 "Job is already terminal"
- Final: succeeded, reservation=committed, usage=1
- adapter.cancel() calls: 0

## Cancel-before-success (proven by code path)
- Worker post-execution cancel check: if cancel_requested detected → handleActiveCancellation
- Parallel cancel test demonstrated: cancel_requested persisted → worker detects in poll loop → cancels
- One terminal state guaranteed by FOR UPDATE locking in settlement
