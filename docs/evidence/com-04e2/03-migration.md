# COM-04E2 Evidence 03: Migration 028

File: `migrations/028_workflow_execution_snapshot.sql`

## Tables Created
1. `wf_execution_snapshots` — 24 columns, immutable, idempotency_key UNIQUE per workspace
2. `wf_executions` — 18 columns, state_version for optimistic concurrency, execution_mode CHECK ('dry_run')
3. `wf_node_executions` — 17 columns, UNIQUE(execution_id, node_key), state_version
4. `wf_execution_audit` — 6 columns, append-only

## Constraints
- snapshot_checksum_sha256 must be 64 chars
- workflow_checksum must be 64 chars
- execution status CHECK: prepared, running, cancel_requested, succeeded, failed, cancelled
- node status CHECK: pending, ready, running, succeeded, failed, skipped, cancelled
- progress CHECK: 0-100

## Indexes
- workspace_id, project_id, snapshot_id, status (partial), execution_id, node uniqueness
