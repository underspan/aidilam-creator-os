# AIDILAM-DEP-008B Final Result

## Task ID
AIDILAM-DEP-008B

## Result
**PASS**

## Date
2026-07-25

## Summary
Restricted project isolation proven end-to-end with real restricted identities. Cross-project access denied for all operations. Oversized upload policy validated for all media types.

## Key Results

| # | Item | Result |
|---|------|--------|
| 1 | Project A identity | dep008b-asset-user-a (project_editor on project A only) |
| 2 | Project B identity | dep008b-asset-user-b (project_editor on project B only) |
| 3 | A global roles | NONE |
| 4 | B global roles | NONE |
| 5 | A project assignments | Project A (project_editor) |
| 6 | B project assignments | Project B (project_editor) |
| 7 | A same-project access | 200 (allowed) |
| 8 | B same-project access | 200 (allowed) |
| 9 | B → A read | 403 (DENIED) |
| 10 | B → A list | 403 (DENIED) |
| 11 | B → A initiate | 403 (DENIED) |
| 12 | B → A complete | 403 (DENIED) |
| 13 | B → A download-url | 403 (DENIED, no URL leaked) |
| 14 | B → A delete | 403 (DENIED) |
| 15 | A → B read | 403 (DENIED) |
| 16 | A → B list | 403 (DENIED) |
| 17 | A → B initiate | 403 (DENIED) |
| 18 | A → B download-url | 403 (DENIED) |
| 19 | A → B delete | 403 (DENIED) |
| 20 | Metadata leakage | NONE (object_key: false, downloadUrl: false) |
| 21 | Presigned URL leakage | NONE |
| 22 | Foreign object-key injection | DENIED (server generates all keys) |
| 23 | Unauthorized mutations | 0 |
| 24 | Oversized image (>50MB) | 400 DENIED |
| 25 | Oversized audio (>500MB) | 400 DENIED |
| 26 | Oversized video (>5GB) | 400 DENIED |
| 27 | Oversized subtitle (>10MB) | 400 DENIED |
| 28 | Test tokens revoked | YES (revoked immediately, files deleted, accounts disabled) |
| 29 | PostgreSQL ID | 8abb5385b2d2 (unchanged, 0 restarts) |
| 30 | Redis ID | 7468421165df (unchanged, 0 restarts) |
| 31 | Qdrant ID | fa68eb0b9066 (unchanged, 0 restarts) |
| 32 | MinIO ID | 632f6b95e429 (unchanged, 0 restarts) |
| 33 | Worker ID | 9162c8e86f15 (unchanged, 0 restarts) |
| 34 | Kiro restarts | 0 |
| 35 | Underspan impact | NONE |
| 36 | NEMO OS impact | NONE |
| 37 | Host ports | NOT LISTENING |
| 38 | Secrets exposed | NONE |
| 39 | Commit | NOT PERFORMED |
| 40 | Push | NOT PERFORMED |

## Security Fix Applied
Fixed `resolveServiceAccountIdentity` in authentication plugin: service accounts with explicit project role assignments no longer receive default `service_worker` global permissions. This ensures project-scoped roles enforce true isolation — accounts can only access projects they are explicitly assigned to.

## Conditions (accepted)
1. MinIO API/worker credential separation deferred
2. Malware scanning deferred
3. OIDC deferred
4. Redis ACL separation deferred
5. Root SSH remains in use

## Recommended Next Task
AIDILAM-DEP-009: Implement media preprocessing, FFmpeg execution sandbox and derived-asset foundation
