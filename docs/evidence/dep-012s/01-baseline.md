# DEP-012S Baseline

## Date
2026-07-27T10:04:00Z

## Infrastructure State

| Service | Container ID (short) | Health | Restarts |
|---------|---------------------|--------|----------|
| PostgreSQL | 8abb5385b2d2 | healthy | 0 |
| Redis | 7468421165df | healthy | 0 |
| Qdrant | fa68eb0b9066 | healthy | 0 |
| MinIO | 632f6b95e429 | healthy | 0 |
| App | 672d8b25bf0c | healthy | 0 |
| Worker | 6ad75d7d931c | healthy | 0 |
| Kiro | 3a90ece29953 | — | 0 |

## Configuration

| Item | Value |
|------|-------|
| Redis maxmemory-policy | noeviction |
| Host ports listening | NONE |
| AIDILAM_VALIDATION_MODE | false (before test) |
| Underspan tmux session | exists |
