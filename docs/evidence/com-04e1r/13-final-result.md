# COM-04E1R Evidence 13: Final Result

## Status: PASS — Workflow Domain Fully Closed

## Real SHA-256 Checksum
- Previous: `e1v1-canonical-hash` (placeholder, INVALID)
- After: `4bade105e6a8ce8eb7a1bf28eb53054adcdcad4c3c08a22e72bb10d1214a718d`
- Format: 64 lowercase hex chars ✓
- Generated from canonical JSON serialization (sorted nodes/edges by key)

## Determinism
- Nodes sorted alphabetically by node_key
- Edges sorted by from_node_key + to_node_key
- JSON.stringify produces stable output
- Same spec → same hash (both workspace clones have identical checksum)

## System Workflow
- ID: `e0000000-0001-4000-a000-000000000001`
- Checksum: `4bade105e6a8ce8eb7a1bf28eb53054adcdcad4c3c08a22e72bb10d1214a718d`
- Nodes: 10
- Edges: 9
- Publishing nodes: 0
- workspace_id: NULL (system)

## Workspace Clones
| Workspace | Definition | Checksum | Status |
|-----------|-----------|----------|--------|
| A (default) | 76b4b318... | 4bade105... (same spec) | active |
| B | 4a697875... | 4bade105... (same spec) | active |

- Both independently owned (workspace_id set)
- Both have 10 nodes + 9 edges (cloned)
- Future system changes cannot mutate clones

## Clone API
- Route: `POST /api/v1/workflows/:workflowId/clone`
- Requires: session + CSRF + workspace membership
- Creates: new definition + version + nodes + edges
- Independent ownership

## Workflow Runtime
- Invocation count: **0**
- Execution rows: **0**
- Legacy pipeline: **CANONICAL**

## Build/Test
- API: 320 passed ✓
- Worker: 23 passed ✓
- Build: tsc clean ✓
- Publishing: disabled
- Production: unchanged

## COM-04E1 WORKFLOW DOMAIN + VERSIONING = CLOSED
