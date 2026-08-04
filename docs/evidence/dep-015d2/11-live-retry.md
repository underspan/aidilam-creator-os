# DEP-015D2 Live Retry

## Retry Exhaustion
- maxAttempts=3, backoffMs=2000
- All 3 attempts returned retryable failure (publish_transient_failure)
- Final: status=failed, error=PUBLISHING_RETRY_EXHAUSTED
- attempts=3, usage=0, reservation=released

## Retry-Then-Success
- maxAttempts=3, backoffMs=8000 (long retry profile)
- Attempts 1-2: retryable_failed (scenario active)
- Scenario cleared before attempt 3
- Attempt 3: succeeded
- Final: status=succeeded, attempts=3, usage=1, reservation=committed
- Published URL: mock://tiktok/{uuid}

## retry_wait Lifecycle
- After retryable failure: job enters retry_wait
- BullMQ delayed item created with backoff delay
- Delayed item fires → worker claims from retry_wait → next attempt
