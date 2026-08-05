# A5.5: Processing-Status Polling Design

## YouTube Video Processing States

| YouTube Status | Meaning | AIĐiLàm Mapping |
|---------------|---------|-----------------|
| uploaded | File received, not processed | attempt: running, job: polling |
| processing | Transcoding in progress | attempt: running, job: polling |
| processed | Ready for viewing | attempt: succeeded, job: succeeded |
| failed | Processing failed | attempt: permanent_failed, job: failed |
| rejected | Policy violation | attempt: permanent_failed, job: failed |
| deleted | Video removed | attempt: permanent_failed, job: failed |
| not found (404) | Video ID invalid | reconciliation_required |

## Polling Contract

### API Call
```
GET https://www.googleapis.com/youtube/v3/videos
  ?part=status,processingDetails
  &id=<videoId>
Headers: Authorization: Bearer <access_token>
```

### Response Fields
- `status.uploadStatus`: uploaded | processed | deleted | failed | rejected
- `status.privacyStatus`: private | unlisted | public
- `processingDetails.processingStatus`: processing | succeeded | failed | terminated
- `processingDetails.processingProgress.timeLeftMs`: estimated time

## Polling Parameters

| Parameter | Recommended | Configurable |
|-----------|-------------|-------------|
| Initial delay after upload | 30s | Yes |
| Polling interval | 30s | Yes |
| Backoff multiplier | 1.5x after 10 polls | Yes |
| Maximum interval | 300s (5 min) | Yes |
| Maximum polling window | 4 hours | Yes |
| Maximum polls | 200 | Yes |
| Quota cost per poll | 1 unit from general bucket (verify) | — |

## Lifecycle Integration

```
Upload session: uploaded
        ↓
Publishing job: status=publishing, stage=polling
Publishing attempt: status=running
        ↓ (poll loop)
YouTube: processing → processed
        ↓
Publishing attempt: status=succeeded
Publishing job: status=succeeded
Reservation: committed
Usage: recorded
Audit: publishing_job_succeeded
```

## Recovery After Worker Restart
- Polling state derived from: job.status=publishing + job.stage=polling
- Resume from last poll timestamp
- No duplicate settlement (existing ON CONFLICT DO NOTHING)
- Stale polling: recovery scheduler detects jobs in polling > threshold

## Terminal Transitions (exactly once)
- processed → succeeded (only transition to final success)
- failed/rejected/deleted → permanent_failed
- polling timeout → failed with POLLING_TIMEOUT code
- cancel during polling → cancelled (attempt + job)

## Quota Budget for Polling
- videos.list costs 1 unit from the general API quota bucket (verify at implementation time)
- Average polling per upload: 10-20 calls
- Maximum polling per upload: 200 calls (worst case)
- Budget check before each poll (AIĐiLàm internal limit)

## Owner Decisions Required
1. Maximum polling window (recommended: 4 hours)
2. Maximum polls per upload (recommended: 200)
3. Polling interval (recommended: 30s initial)
4. Quota budget allocation for polling

## No implementation performed. No API calls made.
