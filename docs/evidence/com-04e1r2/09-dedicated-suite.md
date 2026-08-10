# COM-04E1R2 Evidence 09: Dedicated Test Suite

## Command
```bash
cd apps/api && npx vitest run src/modules/workflow/
```

## Test Files
1. `src/modules/workflow/validator.test.ts` — 17 tests (valid workflows, empty, duplicate, types, capabilities, edges, cycles, disconnected, source, review)
2. `src/modules/workflow/validator-security.test.ts` — 23 tests (dangerous config, error contract, node shape, publishing detection)
3. `src/modules/workflow/validator-integration.test.ts` — 25 tests (version service, clone service, isolation contracts, edge cases)

## Results
- Test files: 3 passed
- Tests: 65 passed
- Duration: ~700ms

## Key Coverage
- Canonical validator valid/invalid: 17 cases
- Dangerous config rejection: 11 patterns
- Error contract structure: 5 tests
- Version service integration: 5 tests
- Clone service integration: 2 tests
- Isolation contract: 13 tests
- Edge cases (large workflow, self-loop, all types/caps): 5 tests

## R2 Cases Included
- ✓ canonical validator valid workflow (tests 01-03)
- ✓ cycle detection (tests 13-14, 62)
- ✓ dangling edge (tests 11-12)
- ✓ duplicate node (tests 06-07)
- ✓ unknown type (test 08)
- ✓ unknown capability (test 09)
- ✓ disconnected node (test 15)
- ✓ missing source (test 16)
- ✓ missing review (test 17)
- ✓ dangerous config (tests 18-28, 38)
- ✓ A→B HTTP isolation contract (tests 48-55)
- ✓ B→A HTTP isolation contract (tests 48-55)
- ✓ CSRF cross-session (test 58)
- ✓ system workflow mutation denial (tests 56-57)
