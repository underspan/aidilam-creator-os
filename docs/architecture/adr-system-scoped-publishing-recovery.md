# ADR: System-Scoped Publishing Recovery

## Status: APPROVED

## Context
DEP-015D3R required "foreign-authority recovery entry points" — invoking recovery under Project B's authority against Project A's resources. Investigation revealed no such entry point exists.

## Decision
Publishing recovery is a **system-scoped operational capability**. Tenant/project users do not invoke recovery. Recovery functions (`recoverStaleJobs`, `reconcileMissingEnqueues`) are parameterless system-level operations invoked by the internal scheduler.

Isolation is enforced by:
1. Resource ownership: each job carries its own `project_id`
2. project_id propagation: recovery reads `job.project_id` and uses it in ALL subsequent operations (queue item, attempt, reservation, usage, audit, worker claim)
3. Worker claim gate: `WHERE j.id=$1 AND j.project_id=$2` rejects mismatched payloads

## Alternatives Considered
- **Per-project recovery API**: Rejected — adds complexity without security benefit; the global scheduler already respects ownership
- **Project-scoped recovery service**: Rejected — recovery must find stale jobs globally regardless of which project they belong to
- **Foreign-authority test harness**: Rejected — no authority parameter to test against

## Security Consequences
- No tenant can trigger recovery for another tenant's resources (no entry point exists)
- Recovery cannot be manipulated via API (system-internal only)
- Cross-project contamination prevented by project_id propagation (proven: cross_project_*=0)

## Operational Consequences
- Recovery is operator/system-only (scheduler interval)
- No user-facing recovery API needed
- Monitoring targets system-level scheduler health, not per-project recovery

## Test Implications
- "Foreign-authority recovery isolation" is replaced by four evidence layers:
  - Layer A: ownership integrity (project_id propagation)
  - Layer B: multi-project contamination (cross_project_*=0)
  - Layer C: tenant entry-point isolation (API 404s)
  - Layer D: exactly-once audit cardinality

## Rollback/Reevaluation
If future requirements need per-project recovery (e.g., admin panel), implement project-scoped recovery endpoints at that time and add foreign-authority tests then.
