# A5.2: OAuth Consent and Scopes Design

## Consent Screen Model

### Recommended: External / Testing
- Allows non-Workspace Google accounts
- Limited to 100 test users during testing
- No Google verification required initially
- Can upgrade to Published later

### Why External (not Internal)
- AIĐiLàm is self-hosted, not a Google Workspace app
- Owner may use personal Google account
- YouTube channels are personal, not organizational

### Consent Screen Configuration
| Field | Value |
|-------|-------|
| App name | AIĐiLàm Creator OS (Development) |
| User support email | (Owner decision required) |
| Developer contact email | (Owner decision required) |
| Authorized domains | (Owner decision: e.g., aidilam.com) |
| Privacy policy URL | Required for published apps (deferred) |
| Terms of service URL | Optional during testing |
| Logo | Optional |

## Required Scopes (MVP)

| Scope | Purpose | Classification |
|-------|---------|---------------|
| `youtube.upload` | Upload videos | **Required for MVP** |
| `youtube.readonly` | Read channel info, video status | **Required for MVP** |

## Deferred Scopes

| Scope | Purpose | Classification |
|-------|---------|---------------|
| `youtube` | Full channel management | Deferred (unnecessary for upload) |
| `youtube.force-ssl` | Deprecated alias | Prohibited |
| `youtubepartner` | Partner content | Prohibited |

## Prohibited Scopes
- `youtube.force-ssl` (deprecated)
- `youtubepartner` (not applicable)
- Any Gmail, Drive, or Calendar scope
- Any scope not directly needed for video upload + status read

## Scope Implications
- `youtube.upload`: Sensitive scope — requires OAuth consent verification for published apps
- `youtube.readonly`: Not sensitive — standard verification sufficient
- During Testing mode: no verification needed regardless of scope

## Verification Requirements
- Testing mode: no verification needed (up to 100 test users)
- Published mode: may require Google verification (depends on scopes and Google policy at time)
- Verification timeline: typically 2-6 weeks (subject to change)
- Required for: removal of "unverified" warning, >100 users
- Exact requirements must be re-verified against official Google policy at implementation time
- Do not move to Published without owner approval and policy revalidation

## Least Privilege Principle
- Request only upload + readonly
- No delete scope (delete operations blocked by application gate)
- No full management scope (not needed for upload workflow)
- Scope expansion requires explicit owner approval + new ADR

## Owner Decisions Required
1. Support email address
2. Developer contact email
3. Authorized domain(s)
4. Accept Testing mode limitation (100 users max initially)
