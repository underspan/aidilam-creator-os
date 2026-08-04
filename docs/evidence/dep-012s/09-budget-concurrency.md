# DEP-012S Phase G — 20-Way Distinct-Run Budget Concurrency

## Configuration

| Item | Value |
|------|-------|
| Project | dep012s-concurrency (bf182bf6) |
| Committed spend before | 0 |
| Active reservations before | 0 |
| Translation runs before | 0 |
| per_run_limit | 100.0 |
| daily_budget | 0.000253 |
| monthly_budget | 10000.0 |

## Execution

| Item | Value |
|------|-------|
| Requests submitted | 20 |
| Distinct idempotency keys | 20 (each version is unique source) |
| Distinct translation runs | 20 |
| Synchronization method | Promise.all (genuinely parallel) |

## API Results

| Item | Value |
|------|-------|
| HTTP 202 (new runs) | 20 |
| HTTP 200 (replays) | 0 |
| HTTP 500 (errors) | 0 |
| Distinct run IDs | 20 |

## Run Final Statuses

| Run ID | Status |
|--------|--------|
| f9d39782-6936-4963-a7d6-12d0c50f94c7 | **succeeded** |
| 58b262af-542a-4ac9-ba34-5955b19e77b3 | failed (BUDGET_EXCEEDED) |
| ae2ec05e-1fed-4cd9-b3bd-6adff097ab87 | failed (BUDGET_EXCEEDED) |
| fba121c2-e5a0-42d8-890a-5ea5e2a5d673 | failed (BUDGET_EXCEEDED) |
| 6617b4f4-dec8-485a-b109-62eb644f77a6 | failed (BUDGET_EXCEEDED) |
| 0333e889-050b-448a-affa-014869a3077e | failed (BUDGET_EXCEEDED) |
| 9d44c387-08dc-418c-a10e-bf65d83835ac | failed (BUDGET_EXCEEDED) |
| 16968e7d-3ebe-45c7-93ca-90650392bfac | failed (BUDGET_EXCEEDED) |
| 842cf2ac-39ee-4432-9ff4-e617dae3daaf | failed (BUDGET_EXCEEDED) |
| 61b26bb9-ea8d-4fd3-9b7a-fc60c34fb1c9 | failed (BUDGET_EXCEEDED) |
| bab12bea-1520-44cb-9b26-f78765c8d625 | failed (BUDGET_EXCEEDED) |
| 3657980c-b7fc-45ef-a18e-f98578fe78cf | failed (BUDGET_EXCEEDED) |
| 16f12fd4-283f-488c-9920-ff9da33fa4c0 | failed (BUDGET_EXCEEDED) |
| c615a139-7361-418f-b4bf-2bcf91e128a0 | failed (BUDGET_EXCEEDED) |
| 57bace61-b8d2-4dcf-9a84-893fe2fa9b97 | failed (BUDGET_EXCEEDED) |
| ba6b632c-8f1c-4ed7-a154-26ff7b6b0cf8 | failed (BUDGET_EXCEEDED) |
| d1f0483d-6c19-450c-b7ff-22334a30bd4b | failed (BUDGET_EXCEEDED) |
| 5d728cdc-93a5-440b-9936-31109a15cb23 | failed (BUDGET_EXCEEDED) |
| 89b0e474-6412-4178-b1c1-1537cbcb7b35 | failed (BUDGET_EXCEEDED) |
| 22b4d43a-4f91-40c1-9286-3e4ac6941abc | failed (BUDGET_EXCEEDED) |

## Database Results

| Item | Value |
|------|-------|
| Provider executions | 1 |
| Usage records | 1 |
| Reservation winners | 1 |
| Committed reservations | 1 |
| Active reservations after | 0 |
| Duplicate reservations | 0 |
| Duplicate usage records | 0 |
| Duplicate charges | 0 |
| Final project spend | 0.0002 USD |
| Configured daily budget | 0.000253 USD |
| Budget overspend | 0 |

## Relationship

```
final_project_spend (0.0002) <= configured_daily_budget (0.000253) ✓
```

## Serialization Evidence

| Item | Value |
|------|-------|
| Locking method | SELECT ... FOR UPDATE |
| Locked table | aidilam_app.translation_budgets |
| Lock scope | project_id (bf182bf6-b95d-463f-83ac-f08467231552) |
| Currency | USD |
| Transaction flow | BEGIN → FOR UPDATE → spend calculation → reservation INSERT → COMMIT |
| Budget row lock | Exclusive row lock on translation_budgets WHERE project_id = $1 |

The 19 losing runs were denied because the serialized budget check (within the same transaction that holds the FOR UPDATE lock) calculated that existing reservations + new estimated cost > daily_limit.

## VERDICT: PASS
