# A5.10: Implementation Backlog

## Sequenced Tasks

### A5.1 — Google Cloud Owner Setup
- **Objective**: Owner creates Google Cloud project and OAuth client
- **Source files**: None (manual Google Cloud Console)
- **Dependencies**: Owner decisions #1-#6
- **Owner action**: Create project, enable API, configure consent, create credentials
- **External**: Google Cloud Console
- **Tests**: Verify client_id format, store in config
- **Rollback**: Delete project
- **Evidence**: Screenshot of consent screen config (redacted)
- **Commit**: Config reference only (no secrets)

### A5.2 — Production SecretStore Implementation
- **Objective**: Implement EncryptedPgSecretStore
- **Source files**: `infrastructure/encrypted-pg-secret-store.ts`, migration 020
- **Dependencies**: Owner decision #12, encryption key delivery
- **Owner action**: Provide encryption key via Docker secret
- **External**: None
- **Tests**: encrypt/decrypt roundtrip, rotation, fail-closed, key-missing
- **Rollback**: Drop table, revert to FakeSecretStore
- **Evidence**: Test results, no real secrets shown
- **Commit**: Independent (no OAuth dependency)

### A5.3 — Real OAuth Transport and Callback
- **Objective**: Implement real token exchange, refresh, callback route
- **Source files**: `domain/real-oauth-transport.ts`, callback route extension
- **Dependencies**: A5.1 (credentials exist), A5.2 (SecretStore ready)
- **Owner action**: Approve redirect URI, set DNS
- **External**: Google OAuth endpoints
- **Tests**: Mock HTTP responses for exchange/refresh, PKCE validation
- **Rollback**: Disable gate, remove callback route registration
- **Evidence**: Mock test results, no real tokens
- **Commit**: Gate-disabled by default

### A5.4 — Real YouTube Upload Transport
- **Objective**: Implement RealYouTubeUploadTransport
- **Source files**: `infrastructure/real-youtube-upload-transport.ts`
- **Dependencies**: A5.3 (OAuth works), googleapis dependency
- **Owner action**: Approve dependency addition
- **External**: googleapis npm package
- **Tests**: Mock HTTP responses for all 13 scenarios
- **Rollback**: Remove transport, gate remains false
- **Evidence**: Mock test results, response classification
- **Commit**: Gate-disabled by default

### A5.5 — Processing-Status Polling
- **Objective**: Implement real videos.list polling loop
- **Source files**: Extend publishing worker polling stage
- **Dependencies**: A5.4 (upload works), videoId available
- **Owner action**: Approve polling budget
- **External**: YouTube Data API
- **Tests**: Mock poll responses, timeout, terminal transitions
- **Rollback**: Disable polling, manual status check
- **Evidence**: State transition proof
- **Commit**: Integrated with existing polling loop

### A5.6 — Sandbox Validation Gate
- **Objective**: Implement sandbox execution gate with all preconditions
- **Source files**: `domain/sandbox-gate.ts`, API route for approval
- **Dependencies**: A5.1-A5.5 all implemented
- **Owner action**: Designate test channel, approve media
- **External**: Test YouTube channel exists
- **Tests**: Gate blocks without approval, passes with all conditions
- **Rollback**: Gate=false blocks all real uploads
- **Evidence**: Gate logic test results
- **Commit**: Gate-disabled by default

### A5.7 — Quota, Monitoring, Rollback Controls
- **Objective**: Implement quota tracking, alerts, rollback procedures
- **Source files**: `infrastructure/quota-tracker.ts`, monitoring metrics
- **Dependencies**: Owner decisions #15-#21
- **Owner action**: Set thresholds
- **External**: None
- **Tests**: Budget enforcement, threshold alerts
- **Rollback**: Hard-stop threshold blocks operations
- **Evidence**: Budget calculation proof
- **Commit**: Independent (works with fake transport too)

### A5.8 — Owner-Approved Sandbox UAT
- **Objective**: Execute first real YouTube upload
- **Source files**: None (operational execution)
- **Dependencies**: ALL A5.1-A5.7 complete, owner approval
- **Owner action**: APPROVE first upload, execute gate approval
- **External**: YouTube Data API (REAL)
- **Tests**: Operational test cases from sandbox test plan
- **Rollback**: Manual delete, disable gates
- **Evidence**: YouTube Studio screenshot, DB state, audit log
- **Commit**: Evidence documents only

## Task Dependency Graph
```
A5.1 (Owner: GCP) ──┐
                     ├── A5.3 (OAuth) ── A5.4 (Transport) ── A5.5 (Polling)
A5.2 (SecretStore) ──┘                                              │
                                                                     ▼
A5.7 (Quota) ────────────────────────────── A5.6 (Gate) ── A5.8 (UAT)
```

## No implementation performed. This is a sequencing plan only.
