# DEP-015D1C Workspace Failure

## Validation Scenario
- publish_workspace_creation_failure (server-allowlisted)
- Requires: AIDILAM_VALIDATION_MODE=true, is_validation_only=true

## Execution Path
1. BullMQ item received by worker
2. Job claimed: queued → publishing
3. Attempt created (#1, running)
4. Plan loaded (project-scoped)
5. Reservation verified
6. Source asset verified
7. Mock-only guard passed
8. **Workspace creation hook triggered**
9. Validation scenario detected: publish_workspace_creation_failure
10. settleFailure called with PUBLISHING_WORKSPACE_FAILED

## Worker Log Evidence
```
"msg":"Workspace creation failure triggered (validation scenario)","jobId":"c6468251-..."
"msg":"Publishing job failed","errorCode":"PUBLISHING_WORKSPACE_FAILED"
```

## Terminal Result
- job: failed
- error: PUBLISHING_WORKSPACE_FAILED
- attempt: permanent_failed
- reservation: released
- usage: 0
- adapter publish calls: 0
- external publish ID: null
- published URL: null
- workspace directories: 0
- raw path in audit/API: 0
