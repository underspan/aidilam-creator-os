# COM-04E1R2 Evidence 05: Ordinary Users

## User A
- Email: user-a@test.dev
- Role in DB: editor
- Workspace: a0000000-0000-4000-a000-000000000001 (Workspace A only)
- system_admin column: DOES NOT EXIST (admin determined by role='owner' in workspace_members)
- Is owner in any workspace: NO
- Login: POST /login with real scrypt-hashed password → session cookie + CSRF

## User B
- Email: user-b@test.dev
- Role in DB: editor
- Workspace: b0000000-0000-4000-a000-000000000002 (Workspace B only)
- Is owner in any workspace: NO
- Login: Independent session, independent CSRF token

## Owner (NOT USED for isolation proof)
- Email: owner@aidilam.dev
- Role: owner in both workspaces
- Used only for password reset after deploys

## Test Method
- Both users login via POST /login with Content-Type: application/json
- Server returns Set-Cookie: aidilam_session=... and Set-Cookie: aidilam_csrf=...
- All subsequent requests use cookie-based session auth
- No Bearer token used in isolation tests
- No owner session used for isolation proof
