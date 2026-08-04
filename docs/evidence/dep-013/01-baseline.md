# DEP-013 Baseline

## Date
2026-07-27T18:05:00+07:00

## Infrastructure State

| Service | Container ID (short) | Health | Restarts |
|---------|---------------------|--------|----------|
| PostgreSQL | 8abb5385b2d2 | healthy | 0 |
| Redis | 7468421165df | healthy | 0 |
| Qdrant | fa68eb0b9066 | healthy | 0 |
| MinIO | 632f6b95e429 | healthy | 0 |
| App | 672d8b25bf0c | healthy | 0 |
| Worker | 271b75daf217 | healthy | 0 |
| Kiro | 3a90ece29953 | — | 0 |

## Pre-Existing TTS State

| Item | Value |
|------|-------|
| TTS tables | 0 |
| TTS routes | 0 |
| Active jobs | 1 |
| Active budget reservations | 0 |

## Configuration

| Item | Value |
|------|-------|
| Redis maxmemory-policy | noeviction |
| Host ports listening | NONE |
| External TTS calls | 0 |
| AIDILAM_VALIDATION_MODE | false |
