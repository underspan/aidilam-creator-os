# DEP-012S Phase H — Build and Tests

## API (apps/api)

| Command | Exit | Detail |
|---------|------|--------|
| npm ci | 0 | dependencies installed |
| npm run typecheck | 0 | tsc --noEmit |
| npm run lint | 0 | lint ok |
| npm run build | 0 | tsc |
| npm run test | 0 | 8 test files, 100 tests passed |

## Worker (apps/worker)

| Command | Exit | Detail |
|---------|------|--------|
| npm ci | 0 | dependencies installed |
| npm run typecheck | 0 | tsc --noEmit |
| npm run lint | 0 | lint ok |
| npm run build | 0 | tsc |
| npm run test | 0 | 1 test file, 23 tests passed |

## Budget Behavior Coverage

Budget runtime behavior verified by live execution phases A-G:
- Daily allowed: Phase A
- Monthly blocked: Phase B
- Monthly allowed: Phase C
- Reservation release: Phase D
- Release retry: Phase E
- Stale reconciliation: Phase F
- 20-way concurrency: Phase G
- Usage uniqueness: Phase G (duplicate_usage_records = 0)
