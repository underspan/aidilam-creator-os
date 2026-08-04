# DEP-015D1C Foreign Plan

## Fixture
- Project A job created normally (plan belongs to Project A)
- Plan's project_id changed to Project B via SQL UPDATE

## Worker Execution
- Worker receives job with projectId=A
- Plan query: WHERE p.publishing_job_id=$1 AND p.project_id=$2
- Plan has project_id=B, query passes project_id=A → 0 rows
- settleFailure: PUBLISHING_PLAN_NOT_FOUND

## Worker Log
```
"msg":"Publishing job failed","errorCode":"PUBLISHING_PLAN_NOT_FOUND"
```

## Result
- job: failed
- adapter calls: 0
- usage: 0
- Project B plan: unchanged
- Cross-project mutations: 0
- Metadata leakage: NONE
