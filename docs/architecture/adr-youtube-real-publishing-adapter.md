# ADR: YouTube Real Publishing Adapter

## Status: PROPOSED (awaiting owner decisions)

## Context
DEP-015 validated the six-platform publishing foundation using mock adapters.
YouTube is selected as the first platform for real adapter implementation.

## Decision
YouTube real publishing uses:
- Owner-authorized OAuth 2.0 (authorization code flow)
- Resumable uploads via YouTube Data API v3
- Fail-closed credential references (vault-backed)
- Human approval gates for public visibility and delete operations
- Private-by-default pilot publishing
- Processing-status polling for completion
- Exponential backoff for transient errors

## Alternatives Considered
- Service account: rejected (not standard for channel uploads)
- Browser automation: rejected (fragile, insecure)
- Cookie import: rejected (security violation)
- API key only: rejected (insufficient for uploads)

## Consequences
- Requires Google Cloud project (owner creates)
- Requires OAuth consent screen (owner configures)
- First pilot uploads are private until owner explicitly approves
- Delete operations blocked without owner approval
- Credential rotation requires owner action
- Quota limits are platform-imposed (1600 units per upload, 10000 daily default)

## Rollback
- Disable YouTube adapter_key
- Set platform status='disabled'
- No published content affected (private pilot)
