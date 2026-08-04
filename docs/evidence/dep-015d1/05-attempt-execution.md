# DEP-015D1 Attempt Execution

## Flow
1. Load immutable plan (project_id verified)
2. Verify active reservation exists
3. Verify source asset (project-owned, available)
4. Mock-only guard (adapterKey.startsWith('mock'))
5. Resolve adapter from registry
6. Build execution context (no credentials)
7. Scan for credential fields (detectCredentialFields)
8. Call adapter.publish()
9. Validate result (mock:// URL only)
10. Settle success or failure

## Adapter
- BaseMockAdapter (mock-{platform})
- Returns deterministic mock external ID + mock:// URL
- Validation scenarios via AIDILAM_VALIDATION_MODE
