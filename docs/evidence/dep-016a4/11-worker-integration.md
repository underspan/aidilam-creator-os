# DEP-016A4 Evidence 11: Worker Integration

## Status: PROVEN

## Reused Publishing Contracts
- PublishingAdapter interface: unchanged
- Job lifecycle (11 statuses): unchanged
- Attempt lifecycle: unchanged
- retry_wait: reused
- Advisory locks: reusable (same pattern)
- Audit insert pattern: extended (10 new event types)
- Reservation/usage settlement: pattern reused (ON CONFLICT DO NOTHING)
- BullMQ payload rules: enforced (opaque IDs only)
- Feature gates: extended (+3 gates)

## Queue Payload Contract
Permitted fields only:
- projectId (UUID)
- publishingJobId (UUID)
- publishingAttemptId (UUID)
- uploadSessionId (UUID)
- idempotencyKey (string)

Prohibited:
- No media contents
- No tokens/bearer
- No session URI
- No credential material

## Worker Integration Proofs
- Queue claim success ✓
- Duplicate delivery idempotent ✓
- Cancelled session not processed ✓
- Foreign project payload rejected ✓
- Retry_wait on retryable failure ✓
- Budget exhaustion → terminal ✓
- Lock release on all paths (success/fail) ✓

## Publishing Lifecycle Handoff
- Upload start uses governed attempt ✓
- Uploaded ≠ publicly published ✓
- Completed upload → 'uploaded' (not 'succeeded') ✓
- Final publication deferred to polling (DEP-016A5) ✓
- No parallel lifecycle introduced ✓
- Exactly one terminal transition per session ✓

## Fake transport only. No Google/YouTube API calls.
## Persistence and worker integration proven.
## Session/checkpoint state survives restart.
## Real transport disabled. Real adapter disabled.
## Production unchanged.
