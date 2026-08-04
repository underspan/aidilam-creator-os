# DEP-015D2B Cancel vs Retry Promotion
## Cancel-before-promotion
- retry_wait cancellation: proven in D2 (retry_wait → cancelled, released)
- Worker claim checks: if status != 'queued' and status != 'retry_wait' → skip
- Cancelled job (status='cancelled') → worker skips → no new attempt

## Promotion-before-cancel
- If delayed retry fires and worker claims (retry_wait → publishing) first
- Cancel then goes through active cancellation path (publishing → cancel_requested)
- One eventual terminal state

## Delayed retry items
- Cancelled job: delayed BullMQ item fires, worker sees status=cancelled → no-op
- No revived attempts, no orphan items
