# DEP-015C2A Quota Admission Concurrency

## Quota Source
- Publishing profile `quota_policy_json.maxPublishOperationsPerDay`
- 0 or absent = unlimited
- Daily boundary: PostgreSQL CURRENT_DATE (server timezone)

## Locking Mechanism
- `pg_advisory_xact_lock` on deterministic key derived from `projectId + ':publishing:quota'`
- Lock acquired inside the same transaction as job+plan+reservation creation
- Serializes all quota-relevant operations per project

## Admission Sequence
1. Acquire advisory lock
2. SUM active reservations for today
3. SUM committed usage records for today
4. Compare demand against remaining = limit - reserved - committed
5. Deny with PUBLISHING_QUOTA_EXCEEDED or proceed with INSERT

## Live Test: 20 Parallel Distinct-Key Requests
- Profile: maxPublishOperationsPerDay = 1
- 20 distinct idempotency keys
- Same project, profile, source

### Results
- 1×HTTP 202 (admitted)
- 19×HTTP 409 PUBLISHING_QUOTA_EXCEEDED
- 0×HTTP 500

### Database Cardinality
- jobs = 1
- plans = 1
- reservations = 1
- active reservations = 1
- oversubscription = 0

## Quota Estimate (E_PUBLISH)
- publish_operations: 1
- platform_requests: 2
- upload_bytes: 1048576
- quota_units: 1
- estimated_cost: 0.01
