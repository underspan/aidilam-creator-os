# CI Validation Runbook

## Purpose
Automated build and test validation for every push to `develop`/`main` and every pull request.

## Trigger Policy
- **Push to develop**: validates merged code
- **Push to main**: validates release code
- **Pull request → develop/main**: validates before merge
- **Manual dispatch**: on-demand validation

## CI Jobs

### API Validation
```bash
cd apps/api
npm ci
npm run build    # includes TypeScript typecheck
npm run test     # vitest run (all unit/integration tests)
```

### Worker Validation
```bash
cd apps/worker
npm ci
npm run build    # includes TypeScript typecheck
npm run test     # vitest run (all unit tests)
```

## Runtime Version
- Node.js: 22 (matches Dockerfile `node:22.16-bookworm-slim`)
- Package manager: npm with `npm ci` (lockfile-exact)
- Lockfile: `package-lock.json` per workspace

## Service Dependencies
- **External CI services: NOT_REQUIRED**
- All 713 tests are pure unit tests with mocked dependencies
- No PostgreSQL, Redis, MinIO, or Qdrant needed in CI

## Secret Policy
- **Real secrets required: 0**
- Tests do not connect to real databases or services
- No production credentials referenced
- No API keys needed

## External Call Policy
- **External publishing calls: 0**
- All platform adapters use mock/validation mode
- No Facebook/TikTok/YouTube/Douyin/Bilibili/Xiaohongshu real API calls
- CI cannot trigger real external publishing

## Failure Interpretation
- **npm ci failure**: dependency issue (check lockfile sync)
- **build failure**: TypeScript type error (check tsc output)
- **test failure**: logic error (check vitest output for failing test name)
- Every step must exit 0; any non-zero fails the job

## How to Rerun
- GitHub Actions: click "Re-run failed jobs" or "Re-run all jobs" on the workflow run
- Manual: use `workflow_dispatch` trigger from Actions tab

## Diagnosing API Failure
1. Check build step output for TypeScript errors
2. Check test step for failing test names
3. Run locally: `cd apps/api && npm ci && npm run build && npm run test`

## Diagnosing Worker Failure
1. Check build step for TypeScript errors
2. Check test step output
3. Run locally: `cd apps/worker && npm ci && npm run build && npm run test`

## Branch Protection Recommendation
- Require CI pass before merging to develop
- Require CI pass before merging to main
- No force push to develop or main
- **Not yet enabled** (requires repository admin action)

## Important
- **CI does NOT deploy**
- **CI does NOT run migrations**
- **CI does NOT access production infrastructure**
- **CI does NOT enable real publishing adapters**
