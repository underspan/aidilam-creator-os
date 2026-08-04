# DEP-015D1 Scheduler

## Mechanism
- setInterval(10000ms) in worker process
- SQL: UPDATE ... WHERE status='scheduled' AND scheduled_at<=now() ... FOR UPDATE SKIP LOCKED
- Batch size: 50
- Ordering: scheduled_at ASC

## Live Proof
- Created scheduled job (2026-08-10)
- Shifted scheduled_at to past
- Scheduler promoted within 12s
- Audit event: publishing_scheduled_job_promoted
- Worker executed: succeeded

## Safety
- SKIP LOCKED: no duplicate promotion from parallel schedulers
- Bounded batch: 50 max per cycle
- Only scheduled→queued (not cancelled or other states)
