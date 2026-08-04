# DEP-015D1A Adapter & URL Guards

## Non-Mock Adapter Blocking
- Set plan adapter_snapshot_json.adapterKey = "real-tiktok-api"
- Worker guard: !adapterKey.startsWith('mock') → settleFailure
- Result: job=failed, error=PUBLISHING_ADAPTER_DISABLED
- Network calls: 0, Usage: 0, Reservation: released

## URL Safety (code guard)
- Check: result.publishedUrl.startsWith('mock://')
- Non-mock URLs → settleFailure(PUBLISHING_ADAPTER_RESULT_INVALID)
- Rejected patterns: https://, http://, file://, ftp://, localhost, private IPs

## Mock-Only Policy
- All succeeded jobs have mock:// URLs
- No real platform URLs persisted
