# VIDEOMVP-004R5 Evidence: Final Result

## Status: PASS — LIVE CSRF ENFORCED, OWNER UAT READY

## CSRF Enforcement Proven

| Test | Expected | Actual |
|------|----------|--------|
| Approve without CSRF | 403 CSRF_REQUIRED | 403 ✓ |
| Approve with invalid CSRF | 403 CSRF_INVALID | 403 ✓ |
| Approve with valid CSRF | 200 | 200 ✓ |
| Reject without CSRF | 403 | 403 ✓ |
| Reject with valid CSRF | 200 | 200 ✓ |
| Logout without CSRF | 403 | 403 ✓ |
| Logout with valid CSRF | 302 | 302 ✓ |
| Cross-session CSRF | 403 | 403 ✓ |
| New session CSRF works | 200 | 200 ✓ |
| Bearer auth bypasses CSRF | No CSRF check | ACCESS_DENIED from RBAC (not CSRF) ✓ |

## Full Browser E2E Flow
1. Login with email+password → cookies set ✓
2. Dashboard loads (200) ✓
3. Jobs API returns 6 jobs ✓
4. Review page loads (200) ✓
5. Download URL obtained ✓
6. Logout invalidates session (302) ✓
7. Old session rejected (401) ✓

## Exact DEV URL
- Login: `http://172.19.0.6:3000/login`
- Dashboard: `http://172.19.0.6:3000/api/v1/projects/8232faa5-84ac-49d7-8ed4-42ee2f576d1b/dashboard/ui`
- Accessibility: Docker internal network only (workspace container or host)
- Protocol: HTTP (internal; HTTPS requires nginx proxy config)

## Owner Credential Method
- Email: owner@aidilam.dev
- Password set via secure one-time SQL (adaptive scrypt hash)
- Password never in Git, logs, or evidence
- Reset method: `node -e` generates hash → SQL UPDATE via psql

## Mutation Routes and CSRF Coverage
| Route | Method | CSRF Required |
|-------|--------|---------------|
| POST /login | POST | Exempt (sets token) |
| POST /logout | POST | Required ✓ |
| POST .../approve | POST | Required ✓ |
| POST .../reject | POST | Required ✓ |
| POST .../download-url | POST | Required ✓ |
| All other POST/PUT/DELETE | varies | Required ✓ |
| GET requests | GET | Not required (safe) ✓ |
| Bearer-authenticated | any | Bypassed ✓ |

**Unprotected cookie-authenticated mutation routes: 0**

## Safety Attestation
- Live CSRF enforced on all cookie-authenticated mutations
- Exact owner login URL provided (internal network)
- Secure credential procedure established
- No password in evidence/logs/Git
- No service token in browser
- Publishing remains disabled
- Production unchanged
