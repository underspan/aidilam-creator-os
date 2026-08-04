# DEP-015C2A Audit Events

## Events Generated
- `publishing_job_created` — on successful job creation
- `publishing_job_retry_requested` — on successful retry transition

## Events Implied by Code Path (not generated for denials)
- Idempotent replays (200) — no audit event (no state change)
- Quota denials (409) — no audit event (no state change)
- Conflict denials (409) — no audit event (no state change)

## Audit Exclusions
- No raw request body stored
- No credential values
- No request fingerprint
- No storage keys
- No presigned URLs
- metadata_safe_json contains only: profileId, platformKey, status

## Verification
- After retry: audit_retry count = 1
- After cleanup: all audit events deleted (test data only)
