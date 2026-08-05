# A5.8: Rollback and Incident Plan

## Rollback Scenarios

### OAuth Callback Failure
- Symptom: Callback receives error or invalid state
- Action: Log error, mark session as failed, no token stored
- Risk: None (no secret persisted)
- Recovery: Owner re-initiates authorization

### Token Exchange Failure
- Symptom: Code exchange returns error
- Action: Mark session expired, audit failure
- Risk: None (no refresh token obtained)
- Recovery: Owner re-authorizes

### Wrong Account Authorized
- Symptom: Channel ID doesn't match expected
- Action: Revoke binding, delete stored credential
- Risk: Low (private upload only)
- Recovery: Re-authorize correct account

### Upload Session Failure
- Symptom: Session creation returns error
- Action: Mark session failed, release reservation
- Risk: None (no bytes uploaded)
- Recovery: Retry with new session

### Upload Accepted But Processing Fails
- Symptom: YouTube reports processing_failed
- Action: Mark attempt permanent_failed, release reservation
- Risk: Video exists on YouTube as failed/private
- Cleanup: Manual delete by owner if desired
- Recovery: Investigate cause, retry with fixed media

### Duplicate Upload Risk
- Symptom: Same media uploaded twice
- Prevention: Idempotency key per logical upload
- Detection: Same checksum + same channel in recent window
- Action: Block second upload, alert owner
- Recovery: Manual delete duplicate if created

### Quota Exhaustion
- Symptom: 403 quotaExceeded
- Action: Mark QUOTA_EXHAUSTED, enter retry_wait (24h)
- Risk: No new uploads until reset
- Recovery: Wait for quota reset (midnight PT) or request increase

### Accidental Public Visibility
- Prevention: Privacy forced to "private" in sandbox gate
- Prevention: Code rejects non-private privacy parameter
- If somehow bypassed: Owner manually sets to private in YouTube Studio
- Detection: Monitoring alert on non-private upload
- Severity: HIGH — requires immediate owner action

### Compromised Credential
- Detection: Unusual activity, auth from unknown IP
- Action: Immediate revocation via Google account security
- Action: Delete credential binding, revoke SecretStore entry
- Action: Disable all YouTube operations (gate=false)
- Recovery: Full re-authorization after security review

### Callback Abuse (CSRF/replay)
- Prevention: PKCE (code_verifier), state hash validation
- Prevention: One-time code exchange, consumed flag
- Prevention: 10-minute session expiry
- Detection: Multiple callback attempts with same state
- Action: Reject, audit security event

### SecretStore Outage
- Symptom: Cannot retrieve refresh token
- Action: All YouTube operations fail-closed
- Risk: No uploads possible (acceptable)
- Recovery: Restore SecretStore availability
- No degraded mode (fail-closed by design)

## Emergency Procedures

### Immediate Disable (< 1 minute)
```bash
# Set gate to false in compose and restart worker
YOUTUBE_REAL_TRANSPORT_ENABLED=false
YOUTUBE_REAL_ADAPTER_ENABLED=false
docker compose restart worker
```

### Credential Revocation (< 5 minutes)
1. Go to Google Account → Security → Third-party apps
2. Remove AIĐiLàm access
3. Or: Google Cloud Console → Credentials → Delete OAuth client

### Video Deletion (manual, owner only)
1. YouTube Studio → Content → Select video → Delete
2. Confirm permanent deletion
3. Record in audit log

## Sandbox Cleanup Policy
- Test videos: delete after verification (owner approval)
- Automated delete: DISABLED (gate: YOUTUBE_DELETE_ENABLED=false)
- Manual delete: owner via YouTube Studio
- Retention: 7 days maximum for test videos

## Owner Decisions Required
1. Accept manual-delete-only policy for sandbox
2. Define emergency contact for credential revocation
3. Approve fail-closed behavior during SecretStore outage
