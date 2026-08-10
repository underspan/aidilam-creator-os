# VIDEOMVP-002 Evidence 10: Final Result (CORRECTED)

## Status: PASS — ONE REAL VIETNAMESE VIDEO CREATED

## Provider Classification (Corrected)

| Stage | Provider | Type | Network |
|-------|----------|------|---------|
| STT | faster-whisper (tiny, CPU) | Real local inference | None |
| Translation | Human-governed | Manual verified | None |
| TTS | edge-tts (vi-VN-HoaiMyNeural) | Real online service (free) | Microsoft servers |
| Render | FFmpeg 6.1.1 | Real local | None |

**External network calls: 2** (TTS segment synthesis to Microsoft Edge servers)
**Paid credentials used: 0**
**Mock providers used: 0**

## Persistent Storage
- Backend: MinIO (aidilam-private bucket)
- Asset ID: 49ec7c0d-d6e4-4582-9f29-c1d61dc0a49b
- Object key: projects/.../assets/.../source/video-mvp-002-review.mp4
- Status: available
- Checksum verified: ✓ (original = stored = downloaded)

## Output Specification
- Resolution: 1080×1920 (9:16 portrait)
- Video: H.264, yuv420p, faststart
- Audio: AAC, 48kHz, mono
- Duration: 10.37s
- File size: 196,908 bytes
- Subtitles: Burned-in Vietnamese + SRT + VTT sidecars
- Thumbnail: JPG (23,580 bytes)

## Access Control
- Authorized download: ✓ (200, checksum match)
- Unauthenticated: ✓ (401 denied)
- Foreign project: ✓ (404 denied)
- Raw path leakage: 0

## QC: PASS (9/9 checks)
- file_exists ✓, duration ✓, resolution ✓, video_codec ✓
- pix_fmt ✓, audio_codec ✓, audio_present ✓, srt_exists ✓, thumbnail ✓

## Safety Attestation
- Real local STT used (faster-whisper)
- Human-governed translation used (not automated)
- edge-tts online service used (free, no owner credential)
- No owner-provided TTS credential used
- One persistent 1080×1920 MP4 review package created
- Owner approval still pending
- No social-platform upload performed
- Publishing remains disabled
- Production unchanged
