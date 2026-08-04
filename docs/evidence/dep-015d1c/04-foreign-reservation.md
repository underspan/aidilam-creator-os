# DEP-015D1C Foreign Reservation

## Fixture
- Project A job created normally
- Reservation for this job deleted (simulating foreign/missing ownership)

## Worker Execution
- Worker claims job, creates attempt
- Loads plan (found, project-scoped)
- Queries reservation: WHERE publishing_job_id=$1 AND status='reserved'
- No reservation found → settleFailure: PUBLISHING_RESERVATION_NOT_FOUND

## Worker Log
```
"msg":"Publishing job failed","errorCode":"PUBLISHING_RESERVATION_NOT_FOUND"
```

## Result
- job: failed
- usage: 0
- quota commitment: 0
- Cross-project mutations: 0
- Foreign reservations: unchanged
