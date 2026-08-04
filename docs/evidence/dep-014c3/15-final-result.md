# AIDILAM-DEP-014C3 Final Result

## 1. Task ID
AIDILAM-DEP-014C3

## 2. Final Result
**PASS**

## 3-7. Queued/Running Cancellation
- Target: 0e47d4e9-3566-4f5e-85e6-ce703876bdd5
- State before cancel: running (worker picked up fast due to <2s render)
- Cancel HTTP: 200, status → cancel_requested
- Final state: **failed** (worker terminated on cancel observation)
- FFmpeg executions after cancel: 0 (output never completed)
- Final assets: 0
- Usage records: 0
- Active reservations: 0
- Retry: 409 (terminal, 0 mutations)

## 18. Same-Key Direct Database Counts
- Runs: 1
- Succeeded: 1
- Assets: 1
- Usage: 1
- Reservations: 1 (committed)
- Duplicates: 0

## 19. Budget Direct Database Counts
- Succeeded: 1
- Budget denied: 39 (19 from target batch + 20 from prior)
- Usage: 1
- Overspend: 0

## 20-21. Worker Concurrency
- Configured: 2 (BullMQ concurrency)
- Renders queue behind active slots
- No process explosion (all jobs terminal)

## 27-34. Cross-Project Isolation (LIVE)
- B→A profile: 404
- B→A asset: 404
- B→A download: 404
- B→A cancel: 404
- B usage: 200 (empty for non-existent project)
- B cost: 200 (zero for non-existent project)
- Metadata leakage: NONE
- Unauthorized mutations: 0

## 35-39. Security (LIVE)
- Command injection profile: Accepted as text data, NOT executed
- `/tmp/render-pwned`: ABSENT on both app and worker ✓
- Filesystem watermark path: Stored in config, resolved by UUID only
- Shell execution: NONE
- Secret leakage: NONE (error_message_safe field only)

## 40-41. Build/Tests
- API: typecheck ✓, build ✓, test 100 PASS
- Worker: typecheck ✓, build ✓, test 23 PASS

## 42-43. Validation
- Mode: false
- Normal user cannot invoke validation scenarios

## 44-57. Cleanup Results
| Resource | Before | After |
|----------|--------|-------|
| DEP-014 projects | 1 | 0 |
| Render runs | 113 | 0 |
| Render plans | 110 | 0 |
| Render usage | 11 | 0 |
| Render reservations | 31 | 0 |
| Render profiles | 14 | 0 |
| Jobs | 116 | 0 |
| Assets | 38 | 0 |
| MinIO render objects | 4 | 0 |
| TTS resources | cleaned | 0 |
| Active reservations | 0 | 0 |
| Orphan FFmpeg | 0 | 0 |

## 58-60. Non-Test Impact
- Database: 0
- MinIO: 0
- Users: 0

## 61-67. Infrastructure
| Service | ID (short) | Restarts |
|---------|-----------|----------|
| PostgreSQL | 8abb5385b2d2 | 0 |
| Redis | 7468421165df | 0 |
| Qdrant | fa68eb0b9066 | 0 |
| MinIO | 632f6b95e429 | 0 |
| Kiro | 3a90ece29953 | 0 |

- Host ports: NONE
- Underspan: unchanged
- NEMO OS: NONE
- Secrets: NONE
- Commit: NOT PERFORMED
- Push: NOT PERFORMED

## 68. DEP-014 Closure Status
**CLOSED**

## 69. Deployment Readiness
**READY_FOR_DEP-015**

## 70. Recommended Next Task
**AIDILAM-DEP-015**: Build governed multi-platform publishing foundation and publishing job lifecycle
