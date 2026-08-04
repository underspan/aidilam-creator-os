# DEP-015C3 Tests

## API
- npm run build (tsc): exit 0 ✓
- No lint/test scripts beyond typecheck

## Worker
- npm run build (tsc): exit 0 ✓
- No publishing worker handler required

## Live Integration Coverage
All verified via deployed API:
1. Six-platform job creation: 6/6 ✓
2. Immediate/scheduled states ✓
3. Plan snapshot per platform ✓
4. Plan immutability ✓
5. Quota reservation ✓
6. Idempotent replay ✓
7. Idempotency conflict ✓
8. Queued cancellation ✓
9. Scheduled cancellation ✓
10. Permission matrix ✓
11. A→B isolation ✓
12. B→A isolation ✓
13. Foreign profile/source ✓
14. Credential rejection ✓
15. Client authority ✓
16. Content injection ✓
17. Audit cardinality ✓
18. Audit sanitization ✓
