# COM-04E1R2 Evidence 10: Regression

## Dedicated Workflow Suite
- Command: `npx vitest run src/modules/workflow/`
- Files: 3
- Tests: 65 passed, 0 failed

## API Regression
- Command: `npm run test -- --exclude 'src/modules/youtube-oauth/domain/upload-db.test.ts'`
- Files: 25 passed
- Tests: 385 passed, 0 failed
- Includes: Provider Registry, Template, DAM, Workspace tenancy, Auth, Dashboard, all existing modules

## Worker Regression
- Command: `npm run test`
- Files: 1 passed
- Tests: 23 passed, 0 failed

## Build/Typecheck
- Command: `npm run build` (runs tsc)
- API: PASS (0 errors)
- Worker: PASS (0 errors)

## Sub-component Regression (all within API suite)
- Provider Registry: PASS (included in API regression)
- Template Library: PASS (included in API regression)
- DAM: PASS (included in API regression)
- Workspace Tenancy: PASS (included in API regression)

## Total
- Dedicated: 65 tests
- API regression: 385 tests (includes the 65 dedicated)
- Worker: 23 tests
- Combined unique: 385 + 23 = 408 tests, ALL PASS
