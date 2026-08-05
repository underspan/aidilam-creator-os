# DEP-016A3 Audit Integration

## Runtime-Integrated Events (5)
- youtube_oauth_config_created: POST /config route
- youtube_oauth_session_created: POST /sessions route
- youtube_credential_revoked: POST /revoke route
- youtube_reauthorization_required: POST /reauthorization-required route
- youtube_oauth_session_expired: via repository expireStale()

## Contract-Only Events (3, deferred to real callback slice)
- youtube_oauth_callback_received: requires real Google callback
- youtube_oauth_authorized: requires token exchange
- youtube_credential_bound: requires successful authorization

## Redaction
- No raw state/tokens/codes/verifiers in metadata_safe_json
- Only safe IDs: configId, sessionId, bindingId, status
