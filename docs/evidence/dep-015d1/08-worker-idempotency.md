# DEP-015D1 Worker Idempotency

## Duplicate Delivery
- Worker checks job.status at claim time
- If status ≠ queued → ROLLBACK + return (no execution)
- Already-succeeded job: silently skipped

## Live Proof
- Success job (attempts=1, usage=1)
- After attempted re-enqueue: attempts=1, usage=1, status=succeeded
- No duplicate adapter calls
- No duplicate usage records

## Duplicate Settlement Guard
- Usage: ON CONFLICT (publishing_job_id) DO NOTHING
- Reservation: only updates status='reserved' rows
