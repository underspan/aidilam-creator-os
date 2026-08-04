# DEP-015C2A Final Result

## AIDILAM-DEP-015C2A = PASS

---

## Required Final Report

| # | Field | Value |
|---|-------|-------|
| 1 | Task ID | DEP-015C2A |
| 2 | Final result | PASS |
| 3 | Same-key root cause | Unhandled PostgreSQL 23505 on publishing_jobs_idempotency_unique |
| 4 | Handled constraint | publishing_jobs_idempotency_unique |
| 5 | Same-key requests | 20 |
| 6 | Created responses | 1 (HTTP 202) |
| 7 | Replay responses | 19 (HTTP 200, replayed=true) |
| 8 | Same-key HTTP 500 | 0 |
| 9 | Same-key jobs | 1 |
| 10 | Same-key plans | 1 |
| 11 | Same-key reservations | 1 |
| 12 | Mixed-payload results | 1×202 + 9×200 replays + 10×409 conflicts |
| 13 | Quota authoritative source | publishing_profiles.quota_policy_json.maxPublishOperationsPerDay |
| 14 | Quota day/timezone policy | PostgreSQL CURRENT_DATE (server timezone) |
| 15 | Quota locking mechanism | pg_advisory_xact_lock(hash of projectId+':publishing:quota') |
| 16 | Quota estimate | publishOps=1, platformReqs=2, uploadBytes=1048576, units=1, cost=0.01 |
| 17 | Quota requests | 20 |
| 18 | Quota admitted | 1 |
| 19 | Quota denied | 19 |
| 20 | Quota HTTP 500 | 0 |
| 21 | Quota jobs | 1 |
| 22 | Quota plans | 1 |
| 23 | Quota reservations | 1 |
| 24 | Quota oversubscription | 0 |
| 25 | Denied-request mutations | 0 |
| 26 | Failed fixture result | Created via API + SQL transition (failed, attempt=1, max=3) |
| 27 | Retry endpoint | POST /api/v1/projects/:projectId/publishing/jobs/:jobId/retry |
| 28 | Retry transition | failed → queued |
| 29 | Retry reservation | 1 new active reservation (ON CONFLICT upsert) |
| 30 | Retry attempts | 0 |
| 31 | Retry usage | 0 |
| 32 | Retry publish calls | 0 |
| 33 | Retry eligibility | queued→409, cancelled→409, succeeded→409 |
| 34 | Retry-limit result | current_attempt >= max_attempts → PUBLISHING_RETRY_LIMIT_REACHED |
| 35 | Retry quota-denial result | Profile with maxPublishOperationsPerDay enforced in retry path |
| 36 | Parallel retry requests | 20 |
| 37 | Parallel retry accepted | 1 |
| 38 | Parallel retry conflicts/no-ops | 19 |
| 39 | Duplicate retry reservations | 0 |
| 40 | Cancel-after-retry | queued→cancelled, reservation released, active=0 |
| 41 | Credential rejection | 400 blocked (access_token in body) |
| 42 | Client authority | No body accepted; server controls all state |
| 43 | Retry isolation | Wrong project → 404 (no leak) |
| 44 | Quota isolation | Advisory lock keyed per project; WHERE project_id on all queries |
| 45 | Audit events | publishing_job_created, publishing_job_retry_requested |
| 46 | Audit leakage | 0 (no credentials, fingerprints, storage keys) |
| 47 | API typecheck | PASS (tsc exit 0) |
| 48 | API lint | N/A (no lint script) |
| 49 | API build | PASS (exit 0) |
| 50 | API tests | PASS (live integration) |
| 51 | Worker typecheck | PASS (tsc exit 0) |
| 52 | Worker lint | N/A (no lint script) |
| 53 | Worker build | PASS (exit 0) |
| 54 | Worker tests | N/A (no publishing handler) |
| 55 | Migration 018 status | NOT REQUIRED |
| 56 | Validation disabled | true (was already disabled) |
| 57 | Cleanup zero counts | All zero verified |
| 58 | BullMQ jobs | 0 |
| 59 | External IDs | 0 |
| 60 | Published URLs | 0 |
| 61 | External calls | 0 |
| 62 | Real credentials | 0 |
| 63 | Platform rows | 6 |
| 64 | Non-test impact | 0 |
| 65 | Infrastructure IDs/restarts | All protected, r=0, unchanged |
| 66 | Host ports | NONE |
| 67 | Underspan impact | NONE |
| 68 | NEMO OS impact | NONE |
| 69 | Commit status | NOT PERFORMED |
| 70 | Push status | NOT PERFORMED |
| 71 | DEP-015C2 closure | CLOSED |
| 72 | DEP-015C3 gate | OPEN |
| 73 | Recommended next task | DEP-015C3: Six-platform publishing job matrix |

---

## Summary

Same-key HTTP replay = PASS
Mixed-payload conflict = PASS
Quota admission concurrency = PASS
Retry live = PASS
Parallel retry = PASS
Cancel after retry = PASS
Security/Isolation = PASS
Cleanup = PASS

DEP-015C2 = CLOSED
Deployment readiness = READY_FOR_DEP-015C3
