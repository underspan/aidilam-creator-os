# DEP-016A4 Evidence 05: Retry and Recovery (UPDATED)

## Status: PROVEN (domain + persisted)

## Retry Behavior (domain tests — 10 passed)
- Network interruption → session interrupted, checkpoint retryable_failed ✓
- Retryable 5xx → retryable_failed checkpoint ✓
- Rate limit → retryable with RATE_LIMITED code ✓
- Quota exhausted → permanent failure (non-retryable) ✓
- Invalid range → permanent_failed checkpoint ✓
- Expired session → session failed ✓
- Permanent media rejection → session failed ✓
- Offset never regresses after failure ✓
- Interrupted session can resume ✓
- No duplicate accepted range after retry ✓

## Persisted Recovery (A4R — DB-backed)
- updateProgressAtomically: conditional WHERE prevents regression ✓
- Overflow rejected by DB constraint ✓
- markInterrupted: conditional update (only from uploading/ready) ✓
- enterRetryWait: conditional update ✓
- findStaleUploading: recovery query for stale sessions ✓
- Worker restart: session in uploading status recoverable ✓
- Terminal session not resumed after restart ✓

## DB Constraints Enforcing Recovery Safety
- `chk_uploaded_le_total`: uploadedBytes never exceeds total
- `chk_offset_le_total`: nextByteOffset never exceeds total
- Conditional WHERE clauses prevent state regression
- Cross-project mutations return false/null (not error)

## Fake transport only. No Google/YouTube API calls.
## Session/checkpoint state survives restart.
## Real transport disabled. Production unchanged.
