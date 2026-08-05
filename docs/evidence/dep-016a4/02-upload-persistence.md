# DEP-016A4 Evidence 02: Upload Persistence (UPDATED)

## Status: PROVEN AGAINST LIVE DEV DATABASE

## Migration 019
- File: `apps/api/migrations/019_youtube_upload_engine.sql`
- Applied to DEV database: ✓
- Tables created: youtube_upload_sessions, youtube_upload_checkpoints
- Table count before: 74, after: 76 (+2 exactly)
- Indexes: 11 (including PKs and partials)
- Raw-secret columns: 0
- Only `upload_session_secret_reference` (opaque vault ref)
- Runtime user (aidilam_runtime) can query and mutate: ✓
- Rerun is idempotent (IF NOT EXISTS): ✓

## DB-Backed Repositories
- UploadSessionRepository: 12 methods
- UploadCheckpointRepository: 8 methods
- All operations project-scoped
- Atomic conditional updates (WHERE status IN ...)
- uploadedBytes monotonic (constraint + conditional WHERE)
- nextByteOffset monotonic (constraint + conditional WHERE)
- Overflow rejected (uploaded_bytes + N <= total_bytes)
- Cross-project mutation: 0 (WHERE project_id = $2)

## Live DB Test Results (18 tests)
- Migration tables exist ✓
- Indexes exist (≥9) ✓
- No raw-secret columns ✓
- Session create idempotent ✓
- Same-key replay ✓
- Different-payload conflict ✓
- findByProjectAndId ✓
- Cross-project find returns null ✓
- Progress advances monotonically ✓
- Overflow rejected ✓
- Cancel transitions correctly ✓
- Foreign-project cancel returns false ✓
- Checkpoint create/mark/list ✓

## Cleanup
- All synthetic rows deleted in afterAll
- 0 upload sessions remaining post-test
- Production unchanged

## Fake transport only. No Google/YouTube API calls.
## Real transport disabled. Real adapter disabled.
## Production unchanged.
