# VIDEOMVP-004R2 Evidence 01: Authentication Model

## Architecture Assessment

### Current Canonical Auth System
- Mode: `service_token` (Bearer token validation)
- Mechanism: `Authorization: Bearer <token>` header
- Token format: HMAC-verified with pepper
- No login route exists
- No session/cookie mechanism exists
- No CSRF handling exists
- No user login form exists
- Future mode: `future_oidc` (placeholder, not implemented)

### Why No Browser Login Flow Exists
The AIĐiLàm API was designed as a **service-to-service API**:
- The Tauri desktop app communicates via IPC (not HTTP)
- The worker communicates via internal service tokens
- Admin access uses bearer tokens (CLI/API tools)
- No public-facing web application exists in this repository

### Implications for Browser Dashboard
A browser-based dashboard has limited options within this architecture:
1. **Prompt for bearer token** — current approach (MVP-004R)
2. **Add cookie/session login** — would be a NEW auth system (prohibited)
3. **Integrate OIDC** — future_oidc mode exists but is not implemented

### Chosen Approach: Secure Token Prompt
Given the constraints (no new auth system, no token in URL), the implementation:
- Prompts user for bearer token on page load
- Stores in `sessionStorage` (tab lifetime only)
- Sends via `Authorization` header on all API calls
- Strips any accidental `?token=` from URL via `history.replaceState`
- Token never in localStorage, never in static HTML

### Security Properties
- Token not in URL ✓
- Token not in localStorage ✓
- Token not in rendered HTML source ✓
- Token not in server logs (sent via header) ✓
- Token not in referrer (Referrer-Policy: no-referrer) ✓
- Token cleared on tab close (sessionStorage) ✓
- Security headers applied ✓

### Limitation Acknowledged
- Token IS accessible to page JavaScript (via sessionStorage)
- This is inherent to any SPA/browser-based token auth without HttpOnly cookies
- Mitigation: Content-Security-Policy restricts script sources to 'self'
- Mitigation: sessionStorage isolated per origin
- True HttpOnly cookie auth requires implementing the `future_oidc` mode

### Honest Status
- Manual bearer-token entry: **REQUIRED** (no other auth mechanism exists)
- sessionStorage usage: **PRESENT** (for tab-lifetime persistence)
- Token in URL: **REMOVED** ✓
- Token in localStorage: **REMOVED** ✓
- Canonical login flow: **DOES NOT EXIST** (API is service-token only)

## Recommendation
The dashboard authentication is as secure as architecturally possible without
implementing a new auth system. The `future_oidc` mode should be implemented
when a proper browser login flow is needed. This is a design limitation, not
a security vulnerability — the API was never designed for browser-based login.
