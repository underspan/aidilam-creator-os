# YouTube Adapter Test Plan

## Test Cases (22)
1. Valid private upload (mock API response)
2. Invalid credential (401)
3. Revoked credential (403 + invalid_grant)
4. Expired access token → successful refresh → retry
5. Quota exhausted (403 quotaExceeded)
6. Rate limited (429 + retry-after)
7. Invalid media (400 invalidVideoFormat)
8. Invalid metadata (400 invalidTitle)
9. Interrupted resumable upload → resume
10. Expired upload session → new session
11. Worker restart during upload → recovery
12. Duplicate enqueue → idempotent
13. Duplicate retry → idempotent
14. Polling → processing complete → success
15. Processing failure → permanent error
16. Cancel before upload → local abort
17. Cancel during upload → stop chunks
18. Delete requiring approval → blocked
19. Cross-project account mismatch → denied
20. Secret redaction in all outputs
21. Audit exactly-once per operation
22. Usage/cost settlement exactly-once

## All tests use mock HTTP responses, not real API calls
