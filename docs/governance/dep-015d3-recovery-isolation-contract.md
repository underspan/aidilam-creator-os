# DEP-015D3 Recovery Isolation Contract (Revised)

## Replaces: Foreign-authority recovery entry-point requirement

## Rationale
The publishing recovery system is system-scoped (no project authority parameter).
The original requirement assumed per-project recovery APIs that do not exist.
This contract defines equivalent isolation evidence using four mandatory layers.

## Layer A — System Recovery Ownership Integrity
For all recovery paths (stale publishing, stale polling, retry reconciliation, stale cancellation):
- attempt.project_id = job.project_id
- reservation.project_id = job.project_id
- usage.project_id = job.project_id
- audit.project_id = job.project_id
- queue-item projectId = job.project_id

## Layer B — Multi-Project Contamination Isolation
For simultaneous two-project recovery:
- cross_project_attempts = 0
- cross_project_reservations = 0
- cross_project_usage = 0
- cross_project_audit = 0
- cross_project_queue_items = 0

## Layer C — Foreign Tenant Entry-Point Isolation
Using actual project-authorized APIs (read, cancel, retry, worker claim):
- All foreign operations: 404 or safe skip
- Zero mutations across all dimensions

## Layer D — Exactly-Once and Audit Cardinality
- job_succeeded = 12
- attempt_succeeded = 12
- usage_recorded = 12
- reservation_committed = 12
- All duplicate counts = 0 (reported separately)
