# A5.1: Google Cloud and OAuth Owner Setup Design

## Recommended Project Structure

### Sandbox/Development
- Project name: `aidilam-youtube-sandbox`
- Purpose: OAuth development, test uploads, quota testing
- Owner: Platform owner (personal Google account)
- Billing: Platform owner credit card or trial credits
- API enabled: YouTube Data API v3
- OAuth consent: External / Testing mode
- Test users: Owner + 1 backup
- Quota: Default allocation (verify in Console before use)

### Production (future, separate)
- Project name: `aidilam-youtube-production`
- Purpose: Real publishing operations
- Owner: Platform owner
- Billing: Dedicated billing account
- API enabled: YouTube Data API v3
- OAuth consent: External / Published (requires verification)
- Quota: Elevated if needed

### Why Separate Projects
- Credential isolation (sandbox secret ≠ production secret)
- Independent quota (sandbox usage doesn't eat production budget)
- Independent consent screen (testing vs verified)
- Safe rotation without production impact
- Independent billing visibility

## Ownership Matrix

| Role | Sandbox | Production |
|------|---------|------------|
| Project owner | Platform owner | Platform owner |
| Billing owner | Platform owner | Platform owner |
| Technical admin | Platform owner | Platform owner |
| Emergency revocation | Platform owner | Platform owner |
| API enablement | Platform owner | Platform owner |
| Quota management | Platform owner | Platform owner |
| Credential rotation | System (automated) | System (automated) |
| Incident response | Platform owner | Platform owner |

## Actions Required (Owner)
1. Create Google Cloud project `aidilam-youtube-sandbox`
2. Enable YouTube Data API v3
3. Configure OAuth consent screen (External/Testing)
4. Create OAuth client (Web application type)
5. Note client_id (safe to share)
6. Store client_secret in approved SecretStore
7. Add authorized redirect URI

## Not Created During This Phase
- No Google Cloud project exists yet
- No OAuth client exists yet
- No API calls possible
