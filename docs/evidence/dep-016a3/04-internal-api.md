# DEP-016A3 Internal API

## Routes (7)
1. POST /api/v1/projects/:projectId/integrations/youtube/oauth/config (configure)
2. GET  /api/v1/projects/:projectId/integrations/youtube/oauth/config (view)
3. POST /api/v1/projects/:projectId/integrations/youtube/oauth/sessions (authorize)
4. GET  /api/v1/projects/:projectId/integrations/youtube/oauth/sessions/:sessionId (view)
5. GET  /api/v1/projects/:projectId/integrations/youtube/oauth/bindings/:accountId (view)
6. POST /api/v1/projects/:projectId/integrations/youtube/oauth/bindings/:accountId/revoke (revoke)
7. POST /api/v1/projects/:projectId/integrations/youtube/oauth/bindings/:accountId/reauthorization-required (revoke)

## Security
- All authenticated (Bearer token)
- All RBAC-enforced (requireProjectPermission)
- All project-scoped
- No secret retrieval or return
- No public Google callback route

## Redaction
- Config response: no client_secret_reference
- Session response: no state_hash, no pkce_verifier_reference
- Binding response: no credential_reference, no google_subject_hash
