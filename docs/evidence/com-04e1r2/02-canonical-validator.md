# COM-04E1R2 Evidence 02: Canonical Validator

## Implementation
- File: `apps/api/src/modules/workflow/validator.ts`
- Function: `validateWorkflowVersion(spec: WorkflowSpecification): ValidationResult`
- Lines: 299

## Result Contract
```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  metadata?: { nodeCount, edgeCount, cycleCount, unreachableExecutableNodes, publishingNodes };
}
```

## Validation Rules Enforced
1. Workflow non-empty (WORKFLOW_EMPTY)
2. Unique node keys (DUPLICATE_NODE_KEY)
3. Known node types (UNKNOWN_NODE_TYPE)
4. Known capabilities (UNKNOWN_CAPABILITY)
5. Edges reference real nodes (DANGLING_EDGE)
6. Graph acyclic - Kahn's algorithm (CYCLE_DETECTED)
7. Source node exists (SOURCE_REQUIRED)
8. Review terminal exists (TERMINAL_REVIEW_REQUIRED)
9. All executable nodes reachable (DISCONNECTED_NODE)
10. Valid node configuration - dangerous patterns rejected (INVALID_NODE_CONFIG)
11. Valid input/output contract shape (INVALID_NODE_CONFIG)

## Dangerous Pattern Detection
- Shell commands (sh -c, bash -c, /bin/sh, /bin/bash)
- Code injection (eval, exec, import, require, spawn)
- Secret references (MINIO_SECRET, POSTGRES_PASSWORD, REDIS_PASSWORD, SERVICE_TOKEN, PRIVATE_KEY)
- Process manipulation (child_process, process.env, fs.*Sync)

## Integration Points
- `POST /api/v1/workspaces/:wsId/workflows/:wfId/versions` → calls validator BEFORE persistence
- `POST /api/v1/workspaces/:wsId/workflows/:wfId/clone` → validates cloned spec BEFORE persistence
- Invalid workflows: version delta = 0, active version delta = 0

## System Workflow Validation Result
```
valid: true
nodeCount: 10
edgeCount: 9 (DB edges use 'success' type matching CHECK constraint)
cycleCount: 0
unreachableExecutableNodes: 0
publishingNodes: 0
```
