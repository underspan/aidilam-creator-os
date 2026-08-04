# AIDILAM-DEP-014B8 Final Result

## 1. Task ID
AIDILAM-DEP-014B8

## 2. Final Result
**PASS**

## 3. Run 8a4e6b0d Final Status
failed (STALLED — output=0 bytes after 15 min, resolved to terminal)

## 4. Application FFmpeg Argument Summary
`-filter_complex_threads 1 -i source.mp4 -i watermark.png -filter_complex "[0:v][1:v]overlay=x=main_w-overlay_w-10:y=main_h-overlay_h-10" -c:v libx264 -preset ultrafast -pix_fmt yuv420p`

## 5. Container CPU Quota
Thread-limited (proven: "Cannot fork" + "Resource temporarily unavailable" when overlay spawns threads)

## 8-9. Direct Command Benchmarks
- Without `-filter_complex_threads 1`: FAILS (auto_scale thread error)
- With `-filter_complex_threads 1`: EXIT=0, output=283,880 bytes, <10s

## 22. PROVEN Performance Root Cause
**FFmpeg overlay filter's `auto_scale` sub-filter attempts to spawn threads, hitting the container's PID/thread limit.** The `-threads 1` flag only constrains the encoder, NOT the filter_complex. Adding `-filter_complex_threads 1` constrains all filter graph operations to single-threaded mode, resolving both the stall AND the performance issue.

## 23. Fix Applied
Added `-filter_complex_threads 1` before inputs in watermark path of `buildFfmpegArgs()`

## 24. Short Application Run ID
4d614b6c-b57e-4ce8-b2bc-57b3beb69319

## 25. Short Runtime
<10 seconds (for 2-second 640×360 source)

## 26-28. Short Pixel Metrics

| Timestamp | Region Diff | Region % | Outside Diff |
|-----------|-------------|----------|--------------|
| 0.5s | 2400 | 100.0% | 13 |
| 1.0s | 2400 | 100.0% | 30 |
| 1.5s | 2400 | 100.0% | 31 |

Expected bounds: x=550, y=320, w=80, h=30

## 28. Watermark Position
BOTTOM_RIGHT ✓

## 29. Clipping
NO (fully inside 640×360 frame)

## 30. Mirroring
NO (no flip applied in this test)

## 33-36. Cardinality
- Final assets: 1 (d42257e1)
- Usage: 1
- Reservation: committed
- Duplicates: 0

## 37-40. Active State
- Active runs: 0 (all resolved)
- Active jobs: 0
- Active reservations: 0
- Orphan FFmpeg: 0

## 45. Infrastructure
postgres=8abb5385b2d2 r=0, redis=7468421165df r=0, qdrant=fa68eb0b9066 r=0, minio=632f6b95e429 r=0, kiro=3a90ece29953 r=0

## 46-47. Status
- Commit: NOT PERFORMED
- Push: NOT PERFORMED

## 48. DEP-014B Closure Status
**CLOSED**

## 49. DEP-014C Gate Status
**OPEN**
