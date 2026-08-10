# COM-04E1R2 Evidence 06: A→B HTTP Isolation

## Test Actor
- user-a@test.dev (editor, Workspace A only)

## Target
- Workspace B resources (workflow ID: 4a697875-3e12-4532-b865-e4007c5855c8)

## Results

| Operation | Endpoint | Result |
|-----------|----------|--------|
| List workflows | GET /api/v1/workspaces/{WS_B}/workflows | ACCESS_DENIED |
| Workflow detail | GET /api/v1/workspaces/{WS_B}/workflows/{B_CLONE} | ACCESS_DENIED |
| Version list | GET /api/v1/workspaces/{WS_B}/workflows/{B_CLONE}/versions | ACCESS_DENIED |
| Create version | POST /api/v1/workspaces/{WS_B}/workflows/{B_CLONE}/versions | ACCESS_DENIED |
| Activate version | POST .../versions/{id}/activate | ACCESS_DENIED |
| Archive workflow | POST .../archive | ACCESS_DENIED |
| Clone into B | POST /api/v1/workspaces/{WS_B}/workflows/{SYS}/clone | ACCESS_DENIED |

## Summary
- Successful foreign reads: 0
- Successful foreign mutations: 0
- Foreign metadata leakage: 0
- All denied at workspace membership check level
