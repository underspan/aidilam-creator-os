# DEP-015D2 Live Cancellation

## Retry-Wait Cancellation
- Job in retry_wait (after retryable failure, 8s backoff)
- Cancel API called: retry_wait → cancelled
- Reservation: released
- Usage: 0
- Delayed retry item: cancelled job will not be claimed by worker

## Active Publishing Cancellation (cancel_requested)
- Cancel API now supports publishing state
- publishing → cancel_requested
- Worker detects cancel_requested before/after adapter execution
- Calls adapter.cancel() once
- Settles: attempt=cancelled, job=cancelled, reservation=released

## Cancel Endpoint Updates
- scheduled/queued/retry_wait → cancelled (immediate)
- publishing → cancel_requested (worker handles)
- cancel_requested → 409 (already requested)
- terminal states → 409
