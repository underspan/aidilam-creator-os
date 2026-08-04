# DEP-015D2A Complete Failure Matrix

| # | Scenario | Job | Attempt | Reservation | Usage | Error |
|---|----------|-----|---------|-------------|-------|-------|
| 1 | source missing | failed | permanent_failed | released | 0 | PUBLISHING_SOURCE_NOT_FOUND |
| 2 | checksum invalid | failed | permanent_failed | released | 0 | PUBLISHING_SOURCE_INVALID |
| 3 | workspace failure | failed | permanent_failed | released | 0 | PUBLISHING_WORKSPACE_FAILED |
| 4 | adapter missing | failed | permanent_failed | released | 0 | PUBLISHING_ADAPTER_NOT_FOUND |
| 5 | non-mock blocked | failed | permanent_failed | released | 0 | PUBLISHING_ADAPTER_DISABLED |
| 6 | retryable failure | retry_wait/failed | retryable_failed | reserved/released | 0 | governed |
| 7 | permanent failure | failed | permanent_failed | released | 0 | MOCK_PERMANENT |
| 8 | result invalid | failed | permanent_failed | released | 0 | PUBLISHING_ADAPTER_RESULT_INVALID |
| 9 | unsafe URL | failed | permanent_failed | released | 0 | PUBLISHING_ADAPTER_RESULT_INVALID |
| 10 | usage invalid | N/A (ON CONFLICT) | - | - | - | - |
| 11 | publish timeout | failed | permanent_failed | released | 0 | PUBLISHING_RETRY_EXHAUSTED |
| 12 | poll timeout | failed | permanent_failed | released | 0 | PUBLISHING_RETRY_EXHAUSTED |
| 13 | poll retryable | retry_wait/failed | retryable_failed | reserved/released | 0 | governed |
| 14 | poll permanent | failed | permanent_failed | released | 0 | PUBLISHING_POLL_FAILED |
| 15 | retry exhausted | failed | permanent_failed | released | 0 | PUBLISHING_RETRY_EXHAUSTED |
| 16 | active cancel success | cancelled | cancelled | released | 0 | - |
| 17 | cancel timeout/failure | cancel_requested | running | reserved | 0 | - |

All: workspace=0, unexplained active=0
