# DEP-016A2 RBAC and Audit

## RBAC: CONTRACT ONLY
Permissions defined but NOT registered in authorization model:
- youtube.oauth.configure
- youtube.oauth.authorize
- youtube.oauth.view
- youtube.oauth.revoke
- youtube.account.bind

Integration dependency: DEP-016A3

## Audit: CONTRACT DEFINED, INFRASTRUCTURE INTEGRATION PENDING
Events designed but NOT emitted through existing audit infrastructure:
- youtube_oauth_session_created
- youtube_oauth_callback_received
- youtube_oauth_authorized
- youtube_oauth_rejected
- youtube_oauth_expired
- youtube_credential_bound
- youtube_credential_revoked
- youtube_reauthorization_required

Integration dependency: DEP-016A3

## Exact Status
- RBAC registration: NOT DONE (contract only)
- Audit emission: NOT DONE (contract only)
- These are explicitly deferred to DEP-016A3 integration phase
