# DEP-012S Phase F — Stale Reservation Reconciliation

## Setup

| Item | Value |
|------|-------|
| Project | dep012s-stale (0a2bb38f) |
| Reservation ID | 11111111-2222-3333-4444-555555555555 |
| Status | reserved |
| expires_at | now() - 1 hour (stale) |
| estimated_amount | 0.000253 |
| Active BullMQ job | NONE |
| Active worker lease | NONE |

## First Reconciliation

```json
{
  "staleDetected": 1,
  "staleResolved": 1,
  "releasedIds": ["11111111-2222-3333-4444-555555555555"],
  "errors": []
}
```

| Item | Value |
|------|-------|
| Stale detected | 1 |
| Stale resolved | 1 |
| Final status | released |
| Remaining budget restored | YES (active_reserved = 0) |
| Duplicate release | 0 |

## Second Reconciliation (Idempotency)

```json
{
  "staleDetected": 0,
  "staleResolved": 0,
  "releasedIds": [],
  "errors": []
}
```

| Item | Value |
|------|-------|
| Stale detected | 0 |
| Mutations | 0 |
| Duplicate releases | 0 |
| Remaining budget unchanged | YES |

## VERDICT: PASS
