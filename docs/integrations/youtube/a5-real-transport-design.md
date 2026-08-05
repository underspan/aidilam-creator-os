# A5.4: Real YouTube Upload Transport Design

## Transport Interface (existing from A4)
```typescript
interface YouTubeUploadTransport {
  createResumableSession(projectId, metadata): Promise<{sessionReference, expiresAt}>
  querySessionProgress(sessionRef): Promise<{uploadedBytes, status}>
  uploadChunk(sessionRef, byteStart, byteEnd, data): Promise<TransportResult>
  finalizeUpload(sessionRef): Promise<{externalVideoId, status}>
  abortSession(sessionRef): Promise<{aborted}>
  healthCheck(): Promise<boolean>
}
```

## Real Transport Implementation Design

### Dependencies (not yet added)
- `googleapis` (Google API Node.js client)
- No additional HTTP library (googleapis handles transport)

### OAuth Token Acquisition
1. Load credential binding from DB (opaque reference)
2. Retrieve refresh token from SecretStore
3. Exchange refresh token for access token (googleapis handles)
4. Cache access token in memory (never persisted)
5. Auto-refresh on 401

### createResumableSession
```
POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable
Headers:
  Authorization: Bearer <access_token>
  Content-Type: application/json; charset=UTF-8
  X-Upload-Content-Type: video/*
  X-Upload-Content-Length: <total_bytes>
Body: { snippet: {title, description, tags}, status: {privacyStatus: "private"} }

Response 200:
  Header Location: <session_uri>  ← stored in SecretStore only
```

### uploadChunk
```
PUT <session_uri>
Headers:
  Content-Range: bytes <start>-<end-1>/<total>
  Content-Length: <chunk_size>
Body: <raw chunk bytes>

Response 308 (Resume Incomplete):
  Header Range: bytes=0-<last_accepted_byte>  ← partial acceptance
Response 200/201 (Final chunk):
  Body: video resource JSON
```

### querySessionProgress
```
PUT <session_uri>
Headers:
  Content-Range: bytes */<total>
  Content-Length: 0

Response 308:
  Header Range: bytes=0-<last_byte>  ← remote progress
Response 200/201:
  Body: video resource (upload already complete)
Response 404:
  Session expired/invalid
```

### Response Classification

| HTTP | Meaning | Action |
|------|---------|--------|
| 200/201 | Upload complete | Finalize, extract videoId |
| 308 | Partial, Range header | Advance local offset |
| 400 | Invalid request | PERMANENT_FAILED |
| 401 | Auth expired | Refresh token, retry once |
| 403 (quotaExceeded) | Quota | QUOTA_EXHAUSTED |
| 403 (forbidden) | Permission | PERMISSION_DENIED |
| 404 | Session gone | SESSION_EXPIRED |
| 429 | Rate limited | RATE_LIMITED, use Retry-After |
| 500/502/503 | Server error | PLATFORM_INTERNAL, exponential backoff |
| Timeout | Network | NETWORK_TRANSIENT, retry |
| ECONNRESET | Connection drop | UPLOAD_INTERRUPTED, resume |

### Session URI Handling
- Received from Location header on session creation
- Stored ONLY in SecretStore (opaque reference in DB)
- Never logged, never in queue, never in audit
- Used for all subsequent PUT requests
- Expires after ~24 hours (not guaranteed)
- Lost URI → SESSION_EXPIRED → create new session

### Retry Behavior
- 401: refresh token, retry immediately (once)
- 429: wait Retry-After seconds
- 5xx: exponential backoff (1s, 2s, 4s, 8s, 16s, max 60s)
- Network errors: retry with backoff
- Max retries per chunk: 5 (configurable)
- Max retries per session: 20 (configurable)

### Cancellation Limitation
- YouTube has no explicit "abort session" API
- Stopping uploads = session expires naturally after ~24h
- abortSession() on real transport: no-op (log only)
- Delete uploaded video: separate API call (gated, requires approval)

## Feature Gate
- `YOUTUBE_REAL_TRANSPORT_ENABLED=true` required
- Falls back to error if gate is false/absent
- Fake transport used in tests regardless of gate

## No implementation performed. No dependencies added. No API calls made.
