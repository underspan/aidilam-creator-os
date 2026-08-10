# VIDEOMVP-004R6 Evidence: Final Result

## Status: PASS — OWNER-ACCESSIBLE DEV ROUTE PROVEN

## Owner Access Method: SSH Port Forwarding

The AIĐiLàm DEV API runs on Docker internal port 3000 with no public host
binding. Owner accesses via encrypted SSH tunnel:

```
ssh -L 3000:172.19.0.6:3000 root@10.0.2.82
```

Then opens in browser:
```
http://127.0.0.1:3000/login
```

### Why SSH Tunnel (not reverse proxy modification)
- Nginx on host serves Underspan (cannot modify without cross-project risk)
- No public port exposure needed for DEV UAT
- SSH provides encryption + access control
- Owner already has SSH access to the host
- Zero infrastructure delta

## Password Reset Procedure
Script: `/tmp/reset_owner_pw.sh` on host
- Interactive hidden password entry (no echo)
- Validates min length
- Generates scrypt hash via Node
- Updates DB directly
- Revokes all prior sessions
- No password in files, history, or logs

## Live Test Results (20/20 pass)

| # | Test | Expected | Result |
|---|------|----------|--------|
| T01 | Login page | 200 | 200 ✓ |
| T02 | Unauth dashboard | 401 | 401 ✓ |
| T03 | Valid login | Session set | PASS ✓ |
| T04 | HttpOnly cookie | Present | 1 ✓ |
| T05 | SameSite cookie | Present | 1 ✓ |
| T06 | Dashboard loads | 200 | 200 ✓ |
| T07 | Jobs API | Data returned | OK ✓ |
| T08 | Review page | 200 | 200 ✓ |
| T09 | Review metadata | available | available ✓ |
| T10 | Download URL | OK | OK ✓ |
| T11 | CSRF missing | 403 | 403 ✓ |
| T12 | CSRF invalid | 403 | 403 ✓ |
| T13 | CSRF valid | 200 | 200 ✓ |
| T14 | Logout | 302 | 302 ✓ |
| T15 | Old session | 401 | 401 ✓ |
| T16 | No Docker IP in HTML | 0 | 0 ✓ |
| T17 | No paths in HTML | 0 | 0 ✓ |
| T18 | No tokens in HTML | 0 | 0 ✓ |
| T19 | No passwords in HTML | 0 | 0 ✓ |
| T20 | Publishing disabled | visible | 1 ✓ |

## Exact Owner UAT Steps
1. `ssh -L 3000:172.19.0.6:3000 root@10.0.2.82`
2. Open `http://127.0.0.1:3000/login`
3. Enter: owner@aidilam.dev + password (set via reset script)
4. Browse Dashboard → Jobs → Media → Reviews
5. Play/download the review video
6. Approve or reject (with CSRF protection)
7. Logout
8. Confirm redirect to login

## Safety Attestation
- Exact non-Docker login URL provided (via SSH tunnel to 127.0.0.1:3000)
- Secure password reset procedure established (interactive, no plaintext)
- Session, CSRF, review, and download verified through owner route
- No Docker IP exposed in user-facing content
- No service token exposed to browser
- Publishing remains disabled
- Production unchanged
- No unrelated services modified
