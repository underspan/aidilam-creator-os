# DEP-015D2C Retry Promotion Before Cancel

## Mechanism
- If delayed retry fires and worker claims first: retry_wait → publishing
- Cancel then goes through active cancellation path (publishing → cancel_requested)
- Worker detects cancel_requested → handleActiveCancellation → cancelled
- One eventual terminal state

## Code Guarantee
- Worker claim: checks status in (queued, retry_wait)
- If cancelled before claim: worker skips ("not in claimable state")
- Log confirmed: "not in claimable state, skipping" for cancelled jobs
