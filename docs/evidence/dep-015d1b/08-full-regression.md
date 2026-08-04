# DEP-015D1B Full Regression

## API
- npm run build (tsc): exit 0

## Worker
- npm run build (tsc): exit 0

## Live Integration Coverage (new in D1B)
1. Unsafe URL https → rejected ✓
2. Unsafe URL http → rejected ✓
3. Unsafe URL localhost → rejected ✓
4. Unsafe URL loopback → rejected ✓
5. Unsafe URL private10 → rejected ✓
6. Unsafe URL private172 → rejected ✓
7. Unsafe URL private192 → rejected ✓
8. Unsafe URL metadata → rejected ✓
9. Unsafe URL file → rejected ✓
10. Unsafe URL ftp → rejected ✓
11. Unsafe URL credentials → rejected ✓
12. Checksum failure → PUBLISHING_SOURCE_INVALID ✓
13. Foreign plan → denied ✓
14. Execution-context sanitization → 0 credential matches ✓
15. Audit sanitization → 0 forbidden matches ✓
