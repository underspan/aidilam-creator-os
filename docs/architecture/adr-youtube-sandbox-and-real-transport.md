# ADR: YouTube Sandbox and Real Transport Architecture

## Status: PROPOSED (awaiting owner review)

## Context
DEP-016A4 proved the resumable upload engine with fake transport. To proceed
to real YouTube integration, we need architectural decisions about transport
selection, credential management, and sandbox boundaries.

## Decision

### Transport Selection at Runtime
- Feature gate `YOUTUBE_REAL_TRANSPORT_ENABLED` determines transport
- Gate absent/false → FakeYouTubeUploadTransport (fail-closed)
- Gate true + valid credentials + sandbox gate → RealYouTubeUploadTransport
- No fallback from real to fake at runtime (explicit, not automatic)

### Credential Flow
```
Owner → Google OAuth consent → authorization code
  → Token exchange (server-side) → refresh token
  → SecretStore (encrypted PG) → opaque reference in DB
  → Access token refresh on demand → memory only (never persisted)
```

### Privacy Enforcement
- Sandbox: ONLY private uploads (code-enforced, not configurable)
- Future: unlisted requires separate gate + owner approval
- Public: requires ADR amendment + production verification

### Sandbox Boundary
- Separate Google Cloud project from production
- Separate OAuth client credentials
- Separate quota budget
- Manual execution gate (owner approval per upload)
- No batch, no scheduling, no unattended operation

### Adapter Integration
- YouTubeRealAdapter.publish() → creates upload session → returns { pending: true }
- Worker enters polling stage (existing lifecycle)
- Polling → videos.list until processed/failed
- Final settlement only after platform confirms

## Consequences
- First real upload blocked until all 28 owner decisions resolved
- No accidental public exposure (private enforced)
- No credential leakage (SecretStore boundary)
- No quota surprise (budget tracking + hard-stop)
- Clean rollback: disable gate = zero real operations

## Alternatives Considered
- Service account upload: rejected (doesn't support channel-specific upload)
- Direct API key: rejected (OAuth required for upload)
- Shared project for DEV/PROD: rejected (credential isolation risk)

## No credentials created. No API calls made. Design only.
