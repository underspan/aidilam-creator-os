# DEP-015E Capacity and Rate Limit

## Configured Values
- Global concurrency: 2
- Project concurrency: 3
- Platform concurrency: 10
- Account concurrency: 10
- BullMQ worker concurrency: 2

## Enforcement
- pg_advisory_xact_lock in stable order (global→project→platform→account)
- COUNT(*) WHERE status='publishing' under serialized lock
- Capacity released automatically on transaction end (any settlement path)

## Proven Release Paths (D3I-D3K)
- Success → released ✓
- Permanent failure → released ✓
- Retry_wait → released ✓
- Cancellation → released ✓
- Adapter exception → released ✓
- Stale recovery → released ✓
- Capacity leaks: 0

## Rate Limit
- Retryable failures: exponential backoff (baseDelay × 2^attempt)
- BullMQ delayed items for retry scheduling
- No busy-loop requeue (delay=2000ms for concurrency waits)
