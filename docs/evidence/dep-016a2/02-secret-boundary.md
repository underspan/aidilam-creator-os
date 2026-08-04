# DEP-016A2 Secret Boundary

## Classification
- Authorization code: NEVER PERSISTED (ephemeral in callback)
- Raw OAuth state: NEVER PERSISTED (only hash stored)
- PKCE verifier: SECRET STORE ONLY (deleted after use)
- Client secret: VAULT REFERENCE ONLY
- Access token: MEMORY ONLY (never persisted)
- Refresh token: SECRET STORE ONLY (credential reference in DB)

## Test Evidence
- Binding serialization contains no raw token (test #23)
- Secret store unavailable → fail-closed (test #15)
- PKCE verifier deleted after exchange (oauth-service.ts line ~130)
