# DEP-015D2A Cancel vs Retry Promotion
- Worker claim checks: status must be 'queued' or 'retry_wait'
- Cancelled job: status='cancelled' → worker skips (not claimable)
- No delayed retry item can revive a cancelled job
- Proven: retry_wait cancellation test showed immediate cancel → no further attempts
