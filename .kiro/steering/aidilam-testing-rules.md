# Aidilam Testing Rules

## Scope
These rules apply to all test code and testing practices in the Aidilam platform.

## Pre-Completion Checks

- Always run `check` (linting/type-check) and `build` before marking any task complete.
- Do not present code as finished if it does not pass lint and build.
- Fix all errors before completion. Warnings should be addressed unless explicitly deferred.

## Test Categories

- Unit tests: for domain logic, pure functions, data transformations, and validators.
- Integration tests: for service boundaries, database queries, queue interactions, and API routes.
- Keep unit tests fast (no I/O, no network, no database).
- Integration tests may use real services but must be isolated and repeatable.

## Unit Test Rules

- Unit tests must not depend on external services (database, Redis, MinIO, APIs).
- Use mocked provider adapters for any external dependency in unit tests.
- Mock at the adapter/port boundary, not deep inside implementation details.
- Test behavior and outcomes, not internal method call sequences.

## Model & Provider References in Tests

- Do NOT hardcode model names or provider identifiers in test fixtures as runtime defaults.
- Use clearly marked test constants (e.g., `TEST_MODEL = "test-model-v1"`) for test values.
- Test constants must be obviously fake and never match real provider model identifiers.
- This prevents tests from accidentally coupling to a specific provider's runtime config.

## Test Database

- Integration tests use a separate test database, never the dev database.
- Test database is created/destroyed per test run or per test suite as appropriate.
- Do not share database state between test cases — each test sets up its own data.
- Use transactions or truncation for cleanup between tests.

## Fixtures & Factories

- Use factory functions to create test data. Avoid raw dictionary literals repeated across tests.
- Factories should produce valid domain objects by default with optional overrides.
- Shared fixtures live in a `conftest.py` or equivalent, not duplicated per file.

## Assertions & Coverage

- Assert specific expected values, not just "no exception thrown."
- Test both success paths and expected failure/error paths.
- Cover edge cases: empty inputs, boundary values, invalid data.
- Aim for meaningful coverage of domain logic, not arbitrary percentage targets.

## Naming & Organization

- Test files mirror source file structure: `src/foo/bar.py` → `tests/foo/test_bar.py`.
- Test function names describe the scenario: `test_<unit>_<condition>_<expected_result>`.
- Group related tests in classes or modules by feature area.

## CI Integration

- All tests must pass in CI before merge. No "known failing" tests in main branch.
- Flaky tests are bugs — fix or quarantine them immediately.
- Test execution time is monitored. Flag tests exceeding 5s as candidates for optimization.
