# DEP-015D3B Stale Polling Recovery
- Fixture: job=publishing, stage=polling, updated_at=5min ago
- Scheduler detected (threshold=120s)
- Recovery: attempt→retryable_failed, job→retry_wait, retry enqueued
- Retry succeeded: final status=succeeded, attempt=2
- Duplicate publish: 0
