# YouTube Real Publishing Adapter Overview

## Status: PLANNING (not implemented)

## Current State
- Platform: registered (platform_key=youtube, adapter_key=mock-youtube)
- Adapter: BaseMockAdapter only
- Capabilities: video_upload, caption, privacy, hashtags, playlist, thumbnail, short_video, scheduled_publish
- Limits: max_file_size=128GB, max_duration=12hr, max_caption=5000chars

## Target Architecture
- OAuth 2.0 authorization-code flow
- Resumable uploads (YouTube Data API v3)
- Processing-status polling
- Private-by-default pilot publishing
- Fail-closed credential references
- Human approval gates

## Adapter Methods (existing interface)
| Method | YouTube Mapping |
|--------|----------------|
| validateAccount | Verify channel access via channels.list |
| validateDestination | Verify channel ID validity |
| validateMedia | Check container/codec/size/duration |
| estimateQuota | Calculate API quota cost (1600 units per upload) |
| publish | Resumable upload + set metadata |
| pollStatus | Check video processing status |
| cancel | Abort upload session or delete draft video |

## Implementation Not Started
- No real API calls
- No credentials created
- No Google Cloud project configured
