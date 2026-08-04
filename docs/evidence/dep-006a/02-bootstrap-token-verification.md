# AIDILAM-DEP-006A: Bootstrap Token Verification

## Date
2026-07-24

## Service Account
- Code: aidilam-internal-admin
- Status: active
- ID: f3dc3183-acff-4259-8a02-8c94a9a0c0ce

## Token Status

| Prefix | Name | Status | Expires | Revoked |
|--------|------|--------|---------|---------|
| fb79343d | Bootstrap token | revoked | - | 2026-07-24T11:38:41Z |
| 760bd002 | Rotated bootstrap token | active | 2026-10-22 | - |

## Verification Results
- New token authentication: 200
- Old token authentication: 401
- Plaintext in database: NO (only HMAC-SHA256 hashes stored)
- Token file: /opt/aidilam/secrets/bootstrap_internal_admin_token (root:600)
- Token NOT mounted in aidilam-app container

## Audit Record
- Revocation event recorded in aidilam_app.audit_events
- Action: service_token.revoke
- Outcome: success
