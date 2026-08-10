# COM-04E1R2 Evidence 03: Invalid DAG Tests

All tests call the SAME `validateWorkflowVersion()` canonical function.

## Test Results (all return valid=false)

| Case | Error Code | Test # |
|------|-----------|--------|
| Empty workflow | WORKFLOW_EMPTY | 04, 05 |
| Duplicate node key | DUPLICATE_NODE_KEY | 06, 07 |
| Unknown node type | UNKNOWN_NODE_TYPE | 08 |
| Unknown capability | UNKNOWN_CAPABILITY | 09 |
| Dangling edge (source) | DANGLING_EDGE | 11 |
| Dangling edge (target) | DANGLING_EDGE | 12 |
| Direct cycle (A→B→A) | CYCLE_DETECTED | 13 |
| Indirect cycle (A→B→C→A) | CYCLE_DETECTED | 14 |
| Self-loop | CYCLE_DETECTED | 62 |
| Disconnected node | DISCONNECTED_NODE | 15 |
| Missing source | SOURCE_REQUIRED | 16 |
| Missing review terminal | TERMINAL_REVIEW_REQUIRED | 17 |
| Shell command in config | INVALID_NODE_CONFIG | 18 |
| eval() in config | INVALID_NODE_CONFIG | 19 |
| Dynamic import in config | INVALID_NODE_CONFIG | 20 |
| require() in config | INVALID_NODE_CONFIG | 21 |
| child_process in config | INVALID_NODE_CONFIG | 22 |
| /bin/bash in config | INVALID_NODE_CONFIG | 23 |
| MINIO_SECRET in config | INVALID_NODE_CONFIG | 24 |
| POSTGRES_PASSWORD in config | INVALID_NODE_CONFIG | 25 |
| Private key in config | INVALID_NODE_CONFIG | 26 |
| spawn() in config | INVALID_NODE_CONFIG | 27 |
| SERVICE_TOKEN in config | INVALID_NODE_CONFIG | 28 |
| Dangerous display_name | INVALID_NODE_CONFIG | 38 |

## Activation/Version Rejection
- Invalid spec → validation fails → no INSERT to workflow_versions
- Version delta = 0 on invalid input (tests 42-45)
- Clone of corrupted source fails (test 47)

## Dangerous Config Accepted Count: 0
