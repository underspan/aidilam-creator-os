# COM-04E2 Evidence 02: Execution Domain Model

## Tables (migration 028)
- `wf_execution_snapshots` — immutable execution intent
- `wf_executions` — state machine (prepared→running→succeeded/failed/cancelled)
- `wf_node_executions` — per-node state (pending→ready→running→succeeded/failed)
- `wf_execution_audit` — append-only audit events

## Domain Services
- `types.ts` — ExecutionSnapshot, WorkflowExecution, NodeExecution, transition graphs
- `snapshot-hash.ts` — canonicalizeJson(), sha256Hex(), hashExecutionSnapshot()
- `state-machine.ts` — transitionWorkflowExecution(), transitionNodeExecution(), isNodeReady(), calculateProgress()
- `prepare-service.ts` — prepareWorkflowExecution() with full authorization chain
- `dry-run-harness.ts` — runDryExecution(), cancelExecution(), retryNode()

## Execution Mode
- Only `dry_run` permitted (CHECK constraint)
- Feature guard: execution_mode IN ('dry_run') enforced at DB level

## Resolution Timing Decision
Provider identity/config revision frozen at snapshot preparation time (Option A).
Safe identifiers only (configId, definitionId). Never secrets.
