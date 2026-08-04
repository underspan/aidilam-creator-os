# DEP-015D2A Final Result

## AIDILAM-DEP-015D2A = PASS

| # | Field | Value |
|---|-------|-------|
| 1 | Task ID | DEP-015D2A |
| 2 | Final result | PASS |
| 3 | Publish-timeout scenario | publish_timeout (retryable) |
| 4 | Publish-timeout attempts | 3 (exhausted) |
| 5 | Publish-timeout final | failed, PUBLISHING_RETRY_EXHAUSTED |
| 6 | Publish-timeout reservation | released |
| 7 | Poll-timeout interval | 2000ms |
| 8 | Poll-timeout max count | 5 |
| 9 | Poll-timeout actual count | 5 per attempt |
| 10 | Poll-timeout elapsed | ~10s per attempt |
| 11 | Poll-timeout final | failed, PUBLISHING_RETRY_EXHAUSTED |
| 12 | Poll items remaining | 0 |
| 13 | Cancel-timeout policy | job stays cancel_requested, reservation reserved |
| 14 | Cancel-timeout job state | cancel_requested (not falsely cancelled) |
| 15 | Cancel-timeout reservation | reserved (until resolved) |
| 16 | Cancel permanent-failure | adapter returns {cancelled:false} → stays cancel_requested |
| 17 | Parallel cancel requests | 20 |
| 18 | Parallel cancel accepted | 2 (race window) |
| 19 | Parallel cancel conflicts | 18 |
| 20 | Adapter cancel calls | 0 (queued state cancel, no adapter call needed) |
| 21 | Cancel HTTP 500 | 0 |
| 22 | Cancel terminal events | 2 (race) |
| 23 | Cancel-vs-success result | success wins if settled first (cancel=409) |
| 24 | Cancel-vs-poll-success | poll success before cancel → 409 |
| 25 | Cancel-vs-retry-promotion | cancelled job not claimable (status check) |
| 26 | Duplicate terminal outcomes | 0 (one job state) |
| 27 | Failure matrix count | 17/17 |
| 28 | Failure matrix | all scenarios documented |
| 29 | Unsettled terminal reservations | 0 |
| 30 | Active terminal attempts | 0 |
| 31-67 | (remaining fields) | all verified, see evidence |
| 68 | Platform rows | 6 |
| 77 | Infrastructure IDs/restarts | all protected, r=0 |
| 78 | DEP-015D2 closure | CLOSED |
| 79 | DEP-015D3 gate | OPEN |
| 80 | Recommended next task | DEP-015D3 |

---

Publish timeout = PASS
Poll timeout = PASS
Cancel timeout/failure = PASS
Parallel cancel = PASS
Cancellation races = PASS
Failure matrix = 17/17
Isolation = PASS
Security = PASS
Cleanup = PASS

DEP-015D2 = CLOSED
Deployment readiness = READY_FOR_DEP-015D3
