# DEP-015D3B Stale Retry Recovery
- Fixture: job=retry_wait, updated_at=2min ago, BullMQ item absent
- Scheduler reconciliation: found missing, enqueued retry item
- Retry executed: final status=succeeded, attempt=2
- Duplicate items: 0
