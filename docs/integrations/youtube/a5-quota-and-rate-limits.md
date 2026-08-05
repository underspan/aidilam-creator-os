# A5.6: Quota and Rate Limits Design

## YouTube Data API v3 Quota Model (as of June 2026)

### Important Disclaimer
Quota values, bucket allocations and costs are subject to change by Google
at any time. All values below must be re-verified in Google Cloud Console
before sandbox execution. Runtime controls must not hardcode Google quota
as permanent truth.

### A. Google Platform Quota (subject to official verification)

#### Video Uploads Bucket
- Since June 1, 2026, `videos.insert` uses a **dedicated Video Uploads quota bucket**
- Default allocation: **100 videos.insert calls per day** (verify in Console)
- Each videos.insert call costs 1 unit in the upload bucket
- Invalid or failed upload requests may still consume quota
- This bucket is separate from the general daily quota

#### General API Quota
- Default general allocation: 10,000 units per day per project
- Applies to non-upload operations (videos.list, channels.list, etc.)
- videos.list (polling): 1 unit per call
- channels.list: 1 unit per call
- videos.delete: 50 units per call
- videos.update: 50 units per call

### B. AIĐiLàm Internal Safety Limit (operational policy)

| Limit | Value | Rationale |
|-------|-------|-----------|
| Daily sandbox uploads | **5** | Conserve quota, controlled testing |
| Max concurrent uploads | **1** | Simplicity during validation |
| Max video size (sandbox) | 500MB | Reduce upload time for testing |

These are AIĐiLàm operational choices, NOT Google platform limits.
The platform may allow more uploads; the sandbox policy constrains them
intentionally for safety and cost control.

### C. Owner-Configurable Runtime Budget

| Parameter | Default | Configurable | Notes |
|-----------|---------|-------------|-------|
| YOUTUBE_DAILY_UPLOAD_LIMIT | 5 | Yes | Internal cap |
| YOUTUBE_CONCURRENT_UPLOADS | 1 | Yes | Internal cap |
| YOUTUBE_MAX_VIDEO_SIZE_MB | 500 | Yes | Internal cap |
| YOUTUBE_POLLING_INTERVAL_MS | 30000 | Yes | Min interval |
| YOUTUBE_MAX_POLLING_DURATION_MS | 14400000 | Yes | 4 hours |
| YOUTUBE_QUOTA_WARNING_PERCENT | 70 | Yes | Alert threshold |
| YOUTUBE_QUOTA_HARD_STOP_PERCENT | 85 | Yes | Block threshold |

### Polling Budget (General Quota)
- videos.list costs 1 unit (general bucket)
- Average polling per upload: 10-20 calls = 10-20 units
- Maximum polling per upload: 200 calls = 200 units (worst case)
- General quota (10,000 units) easily supports polling for 5 uploads/day

### Rate Limiting
- YouTube enforces per-user rate limits (not precisely documented)
- AIĐiLàm self-imposed limits:
  - Max 1 concurrent upload per account
  - Max 1 concurrent upload per project (sandbox)
  - Min 1s between API calls to same account
  - Respect 429 Retry-After headers exactly

## Thresholds (Owner Decisions)

| Threshold | Recommended | Effect |
|-----------|-------------|--------|
| Warning | 70% of daily budget used | Notification to owner |
| Soft limit | 85% of daily budget used | No new uploads started |
| Hard stop | 95% of daily budget used | All non-emergency ops blocked |

Note: These percentages apply to the AIĐiLàm internal budget, not directly
to Google quotas. The internal budget is always <= Google quota.

## Monitoring Metrics
- `youtube_uploads_today` (internal counter)
- `youtube_quota_budget_remaining` (internal budget)
- `youtube_rate_limit_hits`
- `youtube_upload_failed_quota`
- `youtube_polling_calls_today`

## Owner Decisions Required
1. Daily upload limit (recommended: 5 — internal policy)
2. Maximum video size (recommended: 500MB — internal policy)
3. Warning threshold percentage (recommended: 70%)
4. Hard-stop threshold percentage (recommended: 85%)
5. Concurrent upload limit (recommended: 1)

## Implementation-Time Verification Required
- Verify actual upload bucket allocation in Google Cloud Console
- Verify videos.insert cost in the upload bucket
- Verify general quota allocation
- Verify rate-limit behavior through sandbox testing

## No implementation performed. No API calls made.
