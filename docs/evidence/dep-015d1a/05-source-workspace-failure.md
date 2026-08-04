# DEP-015D1A Source & Workspace Failure

## Source Missing
- Created job with valid asset
- Changed asset status to 'deleted' before worker execution
- Worker: asset check found status≠available
- Result: job=failed, error=PUBLISHING_SOURCE_NOT_FOUND
- Reservation: released, Usage: 0, Adapter calls: 0

## Workspace
- Mock adapter: no local file I/O (workspace N/A)
- No temporary directories created
- Orphan workspaces: 0
