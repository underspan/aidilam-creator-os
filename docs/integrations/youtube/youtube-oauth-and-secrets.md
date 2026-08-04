# YouTube OAuth and Secret Management

## Authentication Model
- OAuth 2.0 Authorization Code Flow
- Owner-authorized channel access only
- No password-based login
- No browser profile scraping
- No service-account assumption for channel uploads

## Required Scopes
- `https://www.googleapis.com/auth/youtube.upload` (upload videos)
- `https://www.googleapis.com/auth/youtube` (manage channel, optional)
- `https://www.googleapis.com/auth/youtube.readonly` (read channel info)

## Secret Classification
| Item | Type | Storage | Queue-safe | Audit-safe | Log-safe |
|------|------|---------|-----------|-----------|---------|
| Client ID | public identifier | config/env | yes | yes | yes |
| Client secret | secret | vault reference | NO | NO | NO |
| Refresh token | secret | vault reference | NO | NO | NO |
| Access token | ephemeral secret | memory only | NO | NO | NO |
| Channel ID | public identifier | DB field | yes | yes | yes |
| Upload session URI | operational sensitive | DB field (encrypted) | NO | NO | NO |

## Token Lifecycle
1. Owner authorizes via OAuth consent screen
2. Authorization code exchanged for refresh+access tokens
3. Refresh token stored in approved secret store (vault reference in DB)
4. Access token refreshed on demand (short-lived, ~1hr)
5. Revocation: owner-initiated or automatic on failure

## Fail-Closed Behavior
- Missing credential reference → account status 'error'
- Invalid refresh token → PUBLISHING_AUTH_REVOKED (permanent)
- Expired access token → automatic refresh (retryable)
- Refresh failure → PUBLISHING_AUTH_EXPIRED (retryable once, then permanent)
