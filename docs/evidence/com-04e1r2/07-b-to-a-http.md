# COM-04E1R2 Evidence 07: B→A HTTP Isolation

## Test Actor
- user-b@test.dev (editor, Workspace B only)

## Target
- Workspace A resources (workflow ID: 76b4b318-b15a-4872-b5f6-5223452afd78)

## Results

| Operation | Endpoint | Result |
|-----------|----------|--------|
| List workflows | GET /api/v1/workspaces/{WS_A}/workflows | ACCESS_DENIED |
| Workflow detail | GET /api/v1/workspaces/{WS_A}/workflows/{A_CLONE} | ACCESS_DENIED |
| Version list | GET /api/v1/workspaces/{WS_A}/workflows/{A_CLONE}/versions | ACCESS_DENIED |
| Create version | POST /api/v1/workspaces/{WS_A}/workflows/{A_CLONE}/versions | ACCESS_DENIED |
| Archive workflow | POST .../archive | ACCESS_DENIED |
| Clone into A | POST /api/v1/workspaces/{WS_A}/workflows/{SYS}/clone | ACCESS_DENIED |

## Summary
- Successful foreign reads: 0
- Successful foreign mutations: 0
- Foreign metadata leakage: 0
- Bidirectional isolation proven (A↛B and B↛A)
