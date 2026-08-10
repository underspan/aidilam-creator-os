# VIDEOMVP-002 Evidence 12: Persistent Review Package

## Storage Backend
- **MinIO** (aidilam-private bucket)
- Object key: `projects/8232faa5-84ac-49d7-8ed4-42ee2f576d1b/assets/49ec7c0d-d6e4-4582-9f29-c1d61dc0a49b/source/video-mvp-002-review.mp4`
- Asset ID: `49ec7c0d-d6e4-4582-9f29-c1d61dc0a49b`
- Project ID: `8232faa5-84ac-49d7-8ed4-42ee2f576d1b`
- Asset status: `available`
- Content-Type: `video/mp4`

## Checksum Verification
- Original (temp): `0ec292a89316d9c845d4a6806629260569d0988998c1794183ec3ba843278e49`
- Persistent (MinIO): `0ec292a89316d9c845d4a6806629260569d0988998c1794183ec3ba843278e49`
- Downloaded verify: `0ec292a89316d9c845d4a6806629260569d0988998c1794183ec3ba843278e49`
- **Match: ✓**

## Package Contents (13 files in /tmp, MP4 in MinIO)

| File | Size | Purpose |
|------|------|---------|
| final_vietnamese_9x16.mp4 | 196,908 | Final video (in MinIO) |
| thumbnail.jpg | 23,580 | Preview frame |
| contact_01-04.jpg | ~2-3 KB each | Timeline frames |
| subtitles.srt | 251 | Vietnamese SRT |
| subtitles.vtt | 255 | Vietnamese VTT |
| transcript.json | 453 | Chinese transcription |
| translation.json | 901 | Chinese→Vietnamese mapping |
| metadata.json | 4,338 | ffprobe output |
| qc_report.json | 818 | QC results |
| MANIFEST.md | 1,032 | Provider disclosure |

## Access Control Verified
- Authorized download: **200 OK, checksum matches** ✓
- Unauthenticated: **401 Denied** ✓
- Foreign project: **404 Not Found** ✓
- Raw filesystem path exposed: **NO** ✓

## Persistent storage confirmed. Checksum integrity verified.
## Owner download available via authenticated API.
