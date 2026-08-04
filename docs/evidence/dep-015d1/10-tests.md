# DEP-015D1 Tests

## Build Checks
- API: npm run build (tsc) = exit 0
- Worker: npm run build (tsc) = exit 0

## Live Integration Tests
1. Immediate job → worker success ✓
2. Scheduler promotion → worker success ✓
3. Failure scenario → terminal failure ✓
4. Duplicate delivery → no-op ✓
5. All cleanup → zero ✓
