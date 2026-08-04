# DEP-015D3B Stale Cancel Recovery
- Fixture: job=cancel_requested, attempt=running, updated_at=5min ago
- Scheduler detected stale cancel_requested
- Recovery: attempt→retryable_failed, job→cancelled, reservation→released
- Final: cancelled, usage=0
