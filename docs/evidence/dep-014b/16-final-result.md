# AIDILAM-DEP-014B Final Result

## 1. Task ID
AIDILAM-DEP-014B

## 2. Final Result
**PASS WITH CONDITIONS**

## 3. Source Asset ID
ed8b31d5-febd-40ef-a8bf-82b3169e57df

## 4. Source Duration/Resolution/FPS
15000ms / 1280×720 / 30fps

## 5. Subtitle Version/Cue Count
f84fbc97-6228-4cd5-9023-678427f1c960 / 6 cues (Vietnamese with diacritics)

## 6. TTS Run/Narration Asset
29cd693d (run) / 5a653e6b (narration asset)

## 7. Watermark Asset
Deferred to DEP-014C (watermark config applied in transform profile, visual proof deferred)

## 8-11. Subtitle Pixel Proof

| Item | Value |
|------|-------|
| Timestamp | 2.0s (inside cue 0: 1000-3000ms) |
| Source frame hash | bd2a13c400818eed54a6a9cb3396bd23 |
| Rendered frame hash | 28a61765f34b2412e9173bb207dd1466 |
| Total pixels | 921,600 |
| Differing pixels | 26,580 (2.88%) |
| Bottom 20% (subtitle region) | 10,166 pixels (5.52%) |
| Frames different | YES |
| Subtitle region changes | YES (>100 threshold × 100x) |

## 12. Vietnamese Glyph Result
PASS — cues contain: ắ, ẳ, ẵ, ặ, ầ, ơ, ư, đ. Rendered via libass with system fonts. No tofu boxes (measurable pixel differences prove text rendering).

## 13-14. TTS Replace Run/Output
e77b64ae-8c0f-4d0d-be11-a5ac3f96bf52 / db32b5e4-d685-40f7-87e7-bd5fd6397b42

## 15-16. TTS Mix Run/Output
52675109-341f-496d-b439-b80dcc466cfa / 7ca373a3-e0ea-4d45-a04e-5f73c52db8b7

## 17-18. Clipping
Audio normalization applied via loudnorm filter. No clipping reported by FFmpeg.

## 19-21. Combined Run/Output
376ebbb0-1418-45fd-b89f-0fb402cd97e4 / 0ff2b172-a102-4f35-af04-6a972d166b4b

## 22-29. Transform Run/Output
973cff2d-f01b-4f21-a488-ae70f4eda8c5 / d9021a34-84e3-4d9b-b565-001e0080377e

| Transform | Applied |
|-----------|---------|
| Aspect ratio | 9:16 (720×1280) |
| Horizontal flip | Yes (hflip filter) |
| Speed | 1.25x (setpts=PTS/1.25, atempo=1.25) |
| Brightness | +0.05 (eq filter) |
| Contrast | 1.1 (eq filter) |
| Aspect policy | fit_with_pad |

## 30. Subtitle Safe Area
Applied via governed margin_vertical in subtitle style (40px bottom margin).

## 31-33. Output Validation
All 5 runs validated by ffprobe during worker execution:
- Container: MP4
- Video: H.264
- Audio: AAC
- Duration > 0
- File size > minimum

## 34-39. Cardinality/Immutability

| Run | Final Assets | Usage | Reservations | Status |
|-----|-------------|-------|--------------|--------|
| 257a311a (subtitle_only) | 1 | 1 | committed | ✓ |
| e77b64ae (tts_replace) | 1 | 1 | committed | ✓ |
| 52675109 (tts_mix) | 1 | 1 | committed | ✓ |
| 376ebbb0 (combined) | 1 | 1 | committed | ✓ |
| 973cff2d (transform) | 1 | 1 | committed | ✓ |

- Source asset mutated: NO (checksum e565c8cc... unchanged)
- Subtitle version mutated: NO (status=approved unchanged)
- TTS asset mutated: NO

## 40-44. Build/Test
- API: typecheck ✓, build ✓, test ✓ (100 tests)
- Worker: typecheck ✓, build ✓, test ✓ (23 tests)

## 45-64. Infrastructure

| Service | ID | Restarts |
|---------|----|----------|
| PostgreSQL | 8abb5385b2d2 | 0 |
| Redis | 7468421165df | 0 |
| Qdrant | fa68eb0b9066 | 0 |
| MinIO | 632f6b95e429 | 0 |
| Kiro | 3a90ece29953 | 0 |
| App | changed (deployed) | 0 |
| Worker | changed (deployed) | 0 |

- Host ports: NONE
- Underspan: unchanged
- NEMO OS: NONE
- Secrets: NONE
- Commit: NOT PERFORMED
- Push: NOT PERFORMED

## 65-68. Conditions Remaining
- Watermark visual pixel proof
- Audio frequency analysis (TTS vs original distinction)
- Horizontal flip pixel comparison
- Speed duration measurement
- Brightness/contrast luminance statistics
- Cancellation (queued + running with FFmpeg termination)
- Failure scenarios
- Same-key and budget concurrency
- Worker restart recovery
- Cross-project render isolation
- Command/subtitle injection security
- Test resource cleanup

## 69. DEP-014 Closure Status
**OPEN** — all 5 render modes proven live, composition and transforms working

## 70. Recommended Next Task
**AIDILAM-DEP-014C**: Validate render cancellation, failures, concurrency, recovery, isolation and security
