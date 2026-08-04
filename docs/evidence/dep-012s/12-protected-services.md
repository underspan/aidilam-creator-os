# DEP-012S Phase J — Protected Services

## Services

| Service | Health | Status |
|---------|--------|--------|
| aidilam-postgres | healthy | ✓ |
| aidilam-redis | healthy | ✓ |
| aidilam-qdrant | healthy | ✓ |
| aidilam-minio | healthy | ✓ |
| aidilam-app | healthy | ✓ |
| aidilam-worker | healthy | ✓ |
| Redis maxmemory-policy | noeviction | ✓ |
| Host ports | NONE | ✓ |

## Container IDs (Before → After)

| Service | Before | After | Changed |
|---------|--------|-------|---------|
| PostgreSQL | 8abb5385b2d2 | 8abb5385b2d2 | NO |
| Redis | 7468421165df | 7468421165df | NO |
| Qdrant | fa68eb0b9066 | fa68eb0b9066 | NO |
| MinIO | 632f6b95e429 | 632f6b95e429 | NO |
| App | 672d8b25bf0c | 672d8b25bf0c | NO |
| Worker | 6ad75d7d931c | 271b75daf217 | YES (expected: redeployed) |
| Kiro | 3a90ece29953 | 3a90ece29953 | NO |

## Protected Resources

| Item | Result |
|------|--------|
| Infrastructure restart changes | 0 (all r=0) |
| Kiro restart change | 0 |
| Underspan state | tmux session exists (unchanged) |
| Underspan impact | NONE |
| NEMO OS impact | NONE |
| Secrets exposed | NONE |
| Commit | NOT PERFORMED |
| Push | NOT PERFORMED |
