# DEP-006: Bootstrap Token Rotation

## Date
2026-07-24

## Precondition
- Service account `aidilam-internal-admin` exists and active
- Original bootstrap token (prefix: fb79343d) authenticates successfully

## Rotation Performed

| Step | Action | Result |
|------|--------|--------|
| 1 | Confirm original token works | 200 OK |
| 2 | Create new token via API | 201 Created |
| 3 | Save new token to secrets file | Written (600 perms) |
| 4 | Verify new token authenticates | 200 OK |
| 5 | Revoke old token via API | 200 (status: revoked) |
| 6 | Verify new token still works | 200 OK |
| 7 | Confirm audit event recorded | service_token.revoke logged |

## Token Status After Rotation

| Token Prefix | Name | Status | Expires |
|-------------|------|--------|---------|
| fb79343d | Bootstrap token | revoked | - |
| 760bd002 | Rotated bootstrap token | active | 2026-10-22 |

## Security

- New token stored at: /opt/aidilam/secrets/bootstrap_internal_admin_token
- File permissions: 600 (root only)
- Plaintext not logged or exposed in evidence
- Old token immediately invalidated upon revocation
- Revocation audit event confirms: actor, timestamp, outcome
