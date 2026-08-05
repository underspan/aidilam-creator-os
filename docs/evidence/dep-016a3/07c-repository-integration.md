# DEP-016A3 Repository Integration

## Module
- Path: apps/api/src/modules/youtube-oauth/infrastructure/repositories.ts
- Classes: 3 (ClientConfig, AuthorizationSession, CredentialBinding)
- Pattern: direct pgPool (matching existing project convention)

## Atomicity
- Session consume: `WHERE status='redirect_ready'` conditional UPDATE
- Only one consumer succeeds (concurrent test proven)
- Binding: ON CONFLICT DO UPDATE (idempotent)
- Revoke: conditional WHERE status='active' (idempotent)

## Security
- All queries include project_id
- Cross-project mutation: 0
- Raw-secret columns: 0
- No token retrieval in repository layer
