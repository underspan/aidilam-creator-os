# DEP-012S Phase D — Reservation Release

## Configuration

| Item | Value |
|------|-------|
| Project | dep012s-release (4fbdba10) |
| Profile | validation_pre_provider_failure |
| Failure point | After reservation, before provider invocation |

## Event Sequence

```
1. budget_reservation_created (estimated_amount = 0.000253)
2. worker_pre_provider_failure (simulated)
3. transitionRunToFailed → budget_reservation_released
```

## Result

| Item | Value |
|------|-------|
| Run ID | 5ed4c879-0746-4220-b840-0f903df26873 |
| Reservation ID | 547fe10a-e40e-49b2-ac78-d36811907753 |
| Reservation created | 1 |
| Provider executions | 0 |
| Usage records | 0 |
| Final reservation status | **released** |
| Released amount | 0.000253 |
| Remaining budget before | 1000 |
| Remaining budget after | 1000 (fully restored) |
| Duplicate release | 0 |
| Active reservations after | 0 |
| Unexpected HTTP 500 | 0 |

## VERDICT: PASS
