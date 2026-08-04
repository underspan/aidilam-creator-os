# DEP-015D1C Final Result

## AIDILAM-DEP-015D1C = PASS

| # | Field | Value |
|---|-------|-------|
| 1 | Task ID | DEP-015D1C |
| 2 | Final result | PASS |
| 3 | Workspace failure scenario | publish_workspace_creation_failure |
| 4 | Worker path reached | YES (logged + settled) |
| 5 | Workspace failure job state | failed |
| 6 | Workspace failure attempt state | permanent_failed |
| 7 | Workspace failure reservation | released |
| 8 | Workspace failure usage | 0 |
| 9 | Workspace failure adapter calls | 0 |
| 10 | Workspace directories remaining | 0 |
| 11 | Raw path leakage | 0 |
| 12 | Foreign-plan fixture | plan project_id changed to Project B |
| 13 | Foreign-plan result | PUBLISHING_PLAN_NOT_FOUND |
| 14 | Foreign-plan mutations | 0 |
| 15 | Foreign-reservation fixture | reservation deleted |
| 16 | Foreign-reservation result | PUBLISHING_RESERVATION_NOT_FOUND |
| 17 | Foreign reservation final state | N/A (deleted fixture) |
| 18 | Foreign quota commitment | 0 |
| 19 | Cross-project mutations | 0 |
| 20 | Metadata leakage | NONE |
| 21 | Job query project scope | WHERE id=$1 AND project_id=$2 |
| 22 | Plan query project scope | WHERE publishing_job_id=$1 AND project_id=$2 |
| 23 | Asset query project scope | WHERE id=$1 AND project_id=$2 |
| 24 | Reservation query project scope | WHERE publishing_job_id=$1 (job is project-scoped) |
| 25 | Settlement project scope | via project-scoped jobId |
| 26 | API typecheck | 0 |
| 27 | API lint | 0 |
| 28 | API build | 0 |
| 29 | API test exit | 0 |
| 30 | API test count | 100 |
| 31 | Worker typecheck | 0 |
| 32 | Worker lint | 0 |
| 33 | Worker build | 0 |
| 34 | Worker test exit | 0 |
| 35 | Worker test count | 23 |
| 36 | Migration 019 status | NOT REQUIRED |
| 37 | Validation disabled | true |
| 38 | BullMQ active | 0 |
| 39 | BullMQ waiting | 0 |
| 40 | BullMQ delayed | 0 |
| 41 | BullMQ failed test items | 0 |
| 42 | BullMQ completed test items | auto-removed |
| 43 | Active attempts | 0 |
| 44 | Active reservations | 0 |
| 45 | Temporary workspaces | 0 |
| 46 | Cleanup zero counts | all verified |
| 47 | Platform rows | 6 |
| 48 | External calls | 0 |
| 49 | Real credentials | 0 |
| 50 | Non-test impact | 0 |
| 51 | Infrastructure IDs/restarts | all protected, r=0 |
| 52 | Host ports | NONE |
| 53 | Underspan impact | NONE |
| 54 | NEMO OS impact | NONE |
| 55 | Commit status | NOT PERFORMED |
| 56 | Push status | NOT PERFORMED |
| 57 | DEP-015D1 closure | CLOSED |
| 58 | DEP-015D2 gate | OPEN |
| 59 | Recommended next task | DEP-015D2: Retry/backoff, polling, timeout, active cancellation |

---

Workspace failure = PASS
Foreign plan = PASS
Foreign reservation = PASS
Full API regression = PASS
Full Worker regression = PASS
Cleanup = PASS

DEP-015D1 = CLOSED
Deployment readiness = READY_FOR_DEP-015D2
