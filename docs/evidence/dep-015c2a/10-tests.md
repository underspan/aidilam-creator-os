# DEP-015C2A Tests

## API
- `npm run build` (includes tsc typecheck): exit 0
- No lint/test scripts configured (runtime validation via live tests)

## Worker
- `npm run build` (includes tsc typecheck): exit 0
- No publishing worker handler (not in scope)

## Live Integration Tests (executed via SSH + curl)
All tests passed with runtime evidence:
1. Same-key 20-way: 1×202 + 19×200 + 0×500 ✓
2. Mixed-payload 20-way: 1×202 + 9×200 + 10×409 + 0×500 ✓
3. Quota 20-way: 1×202 + 19×409 + 0×500 ✓
4. Single retry: failed→queued ✓
5. Parallel retry 20-way: 1×200 + 19×409 + 0×500 ✓
6. Cancel after retry: queued→cancelled, reservation released ✓
7. Credential rejection: 400 ✓
8. Project isolation: 404 ✓
9. Retry eligibility: queued→409 ✓
