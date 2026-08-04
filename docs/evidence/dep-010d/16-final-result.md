# AIDILAM-DEP-010D Final Result

## Task ID
AIDILAM-DEP-010D

## Result
**PASS**

## Date
2026-07-26

## Summary
Translation admission race fixed. 20 concurrent requests produce exactly 1 translation run, 1 target version, 1 job. Zero HTTP 500 errors. Advisory lock + domain unique constraint enforce strict single execution.

## Root Cause
The `MAX(version_number) + 1` SELECT inside the transaction did NOT acquire a row lock. Two concurrent transactions could compute different next-version values (e.g., 2 and 3) and both succeed, creating parallel translation runs. The existing unique constraint on `(subtitle_track_id, version_number)` only caught same-value conflicts.

## Fix Applied

1. **Advisory lock**: `pg_advisory_xact_lock(hash(trackId + profileId))` at the start of the transaction serializes all concurrent translation requests for the same source+profile combination.

2. **Existing-run check**: After acquiring the lock, checks for an existing active translation run. If found, returns it immediately (idempotent replay).

3. **Domain unique index** (migration 009): Partial unique index on `translation_runs (project_id, source_subtitle_version_id, translation_profile_id) WHERE status IN ('requested','queued','running','succeeded')` — belt-and-suspenders defense.

## Live 20-Way Concurrent Translation

| # | Item | Result |
|---|------|--------|
| 1 | Concurrent requests | 20 |
| 2 | HTTP 202 (created) | **1** |
| 3 | HTTP 200 (replayed) | **19** |
| 4 | HTTP 500 (errors) | **0** |
| 5 | Unique translation-run IDs | **1** |
| 6 | Translation runs created | **1** |
| 7 | Target versions created | **1** |
| 8 | Jobs created | **1** |
| 9 | Queue admissions | **1** |
| 10 | Worker executions | **1** |
| 11 | Provider executions | **1** |
| 12 | Translated cue sets | **1** |
| 13 | Duplicate side effects | **0** |

## DEP-010C Duplicate Cleanup

| Item | Result |
|------|--------|
| Duplicate runs found | 3 |
| Runs cancelled | 3 |
| Non-test records affected | 0 |

## Migration
009_translation_admission_race_fix.sql applied (partial unique index on translation_runs)

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

1. Production translation providers disabled
2. Speech-to-text deferred
3. Subtitle burn-in deferred
4. TTS deferred
5. MinIO credential separation deferred
6. OIDC deferred
7. Redis ACL deferred
8. Root SSH remains

## Recommended Next Task
AIDILAM-DEP-011: Implement speech-to-text provider foundation, audio segmentation and subtitle generation workflow
