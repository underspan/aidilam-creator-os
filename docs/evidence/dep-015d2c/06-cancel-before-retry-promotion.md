# DEP-015D2C Cancel Before Retry Promotion (Executed)

## Setup
- Job with publish_transient_failure + 8s backoff
- First attempt: retryable_failed → retry_wait
- Delayed retry item scheduled (8s delay)

## Cancel During Retry Wait
- Cancel API: 200 → cancelled, reservation=released
- Wait past original retry time (12s)

## Final State
- status: cancelled (not revived)
- attempts: 2 (unchanged from before cancel)
- total_attempts: 2
- usage: 0
- reservation: released
- Delayed retry item: consumed as no-op (worker sees cancelled → skip)
