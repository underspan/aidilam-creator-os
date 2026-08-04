# DEP-015D1 Worker Claim

## Transition
- queued → publishing (SELECT ... FOR UPDATE)
- Creates attempt (status=running, attempt_number=current+1)
- Sets current_stage='executing', progress=0

## Idempotency
- If status ≠ queued: ROLLBACK + skip (no-op)
- Succeeded/failed/cancelled jobs: silently skipped
- Duplicate worker: blocked by FOR UPDATE

## Audit
- publishing_attempt_started event with attemptId, attemptNumber
