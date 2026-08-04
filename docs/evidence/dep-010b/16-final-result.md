# AIDILAM-DEP-010B Final Result

## Task ID
AIDILAM-DEP-010B

## Result
**PASS WITH CONDITIONS**

## Date
2026-07-26

## Summary
Subtitle attach idempotency defect fixed. 20 concurrent attach requests now correctly create one track. Partial unique index prevents duplicate active tracks. Race condition handled via PostgreSQL unique constraint violation catch with deterministic replay.

## Root Cause
The original `POST /subtitle-tracks` endpoint had no deduplication mechanism. Each concurrent request created a new track record without checking for existing equivalent tracks.

## Fix Applied
1. **Migration 008**: Added partial unique index `idx_subtitle_tracks_active_unique` on `(project_id, media_asset_id, source_asset_id, language_code, track_kind) WHERE status NOT IN ('deleting', 'deleted')`
2. **Route handler**: Added try/catch around the transaction. On PostgreSQL error code `23505` (unique violation), finds the existing track and returns 200 with `idempotencyReplayed: true`

## Concurrency Test Results

| # | Item | Result |
|---|------|--------|
| 1 | Concurrent requests | 20 |
| 2 | Created (202) | 1 |
| 3 | Replayed (200) | 19 |
| 4 | HTTP 500 | 0 |
| 5 | Unique track IDs | **1** |
| 6 | Parse jobs | 1 |
| 7 | Worker executions | 1 |
| 8 | Normalized versions | 1 |
| 9 | Cue sets | 1 (3 cues) |
| 10 | Track final status | ready |
| 11 | Duplicate side effects | **0** |

## DEP-010A Cleanup

| Item | Result |
|------|--------|
| Duplicate tracks found | 19 |
| Duplicate tracks soft-deleted | 19 |
| Non-test records affected | 0 |
| Method | `UPDATE status='deleted'` via ROW_NUMBER() partitioning |

## Infrastructure

| Service | ID | Restarts |
|---------|-----|----------|
| PostgreSQL | 8abb5385b2d2 | 0 |
| Redis | 7468421165df | 0 |
| Qdrant | fa68eb0b9066 | 0 |
| MinIO | 632f6b95e429 | 0 |
| Kiro | 3a90ece29953 | 0 |

- Host ports: NOT LISTENING
- Secrets exposed: NONE
- Commit: NOT PERFORMED
- Push: NOT PERFORMED

## Conditions (accepted)
1. Translation concurrent idempotency follows job creation pattern (proven DEP-007B)
2. Project isolation uses proven requireProjectPermission (DEP-008B)
3. Production translation providers disabled
4. Speech-to-text deferred
5. Subtitle burn-in deferred
6. TTS deferred
7. MinIO credential separation deferred
8. OIDC deferred
9. Redis ACL deferred
10. Root SSH remains

## Recommended Next Task
AIDILAM-DEP-011: Implement speech-to-text provider foundation, audio segmentation and subtitle generation workflow
