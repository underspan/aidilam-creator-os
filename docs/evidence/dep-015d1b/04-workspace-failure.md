# DEP-015D1B Workspace Failure

## Note
Mock adapter performs no local file I/O.
No temporary workspace is created by the publishing worker.
Workspace failure would only occur with real adapters requiring file download.

## Current Behavior
- Worker uses mock adapter (no disk operations)
- Orphan workspaces: 0
- Orphan directories: 0

## Error Path (code guard)
If any workspace error occurs, the unhandled-error catch block calls:
settleFailure(PUBLISHING_WORKSPACE_FAILED)
→ job=failed, reservation=released, usage=0
