# A5.9: Owner Decision Register

## Status: DEFAULTS APPROVED — OWNER VALUES PENDING

| # | Decision | Status | Value |
|---|----------|--------|-------|
| 1 | Google Cloud project name | OWNER VALUE REQUIRED | Recommended: `aidilam-youtube-sandbox` |
| 2 | DEV/SANDBOX and PROD separation | APPROVED DEFAULT | Separate projects |
| 3 | OAuth consent mode | APPROVED DEFAULT | External / Testing |
| 4 | Support email | OWNER VALUE REQUIRED | (owner email) |
| 5 | Developer contact email | OWNER VALUE REQUIRED | (owner email) |
| 6 | Authorized domain | OWNER VALUE REQUIRED | (e.g., aidilam.com) |
| 7 | Sandbox redirect URI | OWNER VALUE REQUIRED | (exact HTTPS callback URL) |
| 8 | Future production redirect URI | DEFERRED | Same domain pattern, separate client |
| 9 | First pilot channel | OWNER VALUE REQUIRED | Dedicated test channel |
| 10 | Sandbox privacy default | APPROVED DEFAULT | private (hard-coded, not configurable) |
| 11 | Delete permission policy | APPROVED DEFAULT | API delete DISABLED; manual via YouTube Studio |
| 12 | Sandbox SecretStore | APPROVED DEFAULT | Encrypted file/Docker-backed (temporary, migration-ready) |
| 13 | Production SecretStore | APPROVED DEFAULT | HashiCorp Vault (preferred) |
| 14 | First real test date | OWNER VALUE REQUIRED | (date) |
| 15 | Daily upload limit (sandbox) | APPROVED DEFAULT | 5 (internal policy) |
| 16 | Maximum video size (sandbox) | APPROVED DEFAULT | 500MB (internal policy) |
| 17 | Quota warning threshold | APPROVED DEFAULT | 70% |
| 18 | Quota hard-stop threshold | APPROVED DEFAULT | 85% |
| 19 | Polling interval | APPROVED DEFAULT | 30s initial |
| 20 | Maximum polling duration | APPROVED DEFAULT | 4 hours |
| 21 | Concurrent upload limit | APPROVED DEFAULT | 1 |
| 22 | Named sandbox approver | OWNER VALUE REQUIRED | (name) |
| 23 | Emergency revocation owner | OWNER VALUE REQUIRED | (name) |
| 24 | Credential rotation interval | APPROVED DEFAULT | 90 days |
| 25 | Data-retention period | APPROVED DEFAULT | 180 days |
| 26 | Evidence-retention period | APPROVED DEFAULT | 365 days |
| 27 | Allowed test media | APPROVED DEFAULT | Synthetic/owned only; no customer data, music-rights, or sensitive personal data |
| 28 | Public upload gate policy | APPROVED DEFAULT | DISABLED during sandbox |

## Summary

| Classification | Count |
|---------------|-------|
| APPROVED DEFAULT | 18 |
| OWNER VALUE REQUIRED | 10 |
| DEFERRED | 1 |

## Blocking Owner Inputs (required before credential creation)

These 10 values cannot be derived from policy and require explicit owner input:

1. Exact Google Cloud Sandbox project name
2. Owner Google account (for project ownership)
3. Support email (consent screen)
4. Developer contact email (consent screen)
5. Authorized domain (consent screen)
6. Exact HTTPS callback URI
7. Pilot YouTube channel/account ID
8. Named sandbox approver
9. Emergency credential-revocation owner
10. First real test date

## Implementation-Time Verification (not owner decisions)
- Actual Google quota allocation (verify in Console)
- Scope verification requirements (depends on Google policy at time)
- OAuth verification timeline (if moving to Published)
- DNS/TLS configuration for callback domain

## How to Provide Owner Values
Owner provides values via:
1. Direct instruction in conversation
2. Signed-off document
3. Pull request review approval

Each approved value will be recorded with date and reference.
No implementation proceeds until blocking values are provided.
