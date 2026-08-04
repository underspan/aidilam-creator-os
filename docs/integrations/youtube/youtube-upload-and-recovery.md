# YouTube Resumable Upload and Recovery

## Upload Flow
1. Create resumable upload session (POST with metadata)
2. Receive session URI
3. Upload file in chunks (configurable chunk size, e.g., 10MB)
4. Checkpoint after each successful chunk
5. On completion: receive video resource with processing status

## Recovery
- Worker restart: resume from last checkpoint using stored session URI
- Network interrupt: retry current chunk with range header
- Session expired (typically 24hr): create new session, restart upload
- Duplicate prevention: use same session URI = idempotent

## Cancellation
- Before upload starts: cancel job locally, no API call needed
- During upload: stop sending chunks, optionally delete video resource
- After upload: delete video resource (requires explicit approval policy)

## Checkpoint Persistence
- Session URI stored in attempt metadata (not in queue payload)
- Last successful byte offset stored
- Checksum of uploaded portion tracked
- Recovery reads checkpoint from DB, not from queue
