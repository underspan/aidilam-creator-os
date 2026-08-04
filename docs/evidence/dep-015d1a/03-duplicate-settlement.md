# DEP-015D1A Duplicate Settlement

## Success Settlement Idempotency
- Job: succeeded (via API create → worker execute)
- attempts=1, usage=1, reservation=committed
- Worker idempotency: claim checks status=queued; if non-queued → skip
- Settlement guard: checks job.status=publishing before acting
- Re-delivery: no-op (status=succeeded ≠ queued)

## Failure Settlement Idempotency
- Job: failed (publish_permanent_failure)
- attempts=1, usage=0, reservation=released
- Settlement guard: checks status in ['publishing','queued']
- Re-running settlement: ROLLBACK (status=failed ≠ publishing)
- No duplicate audit events
