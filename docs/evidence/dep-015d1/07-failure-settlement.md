# DEP-015D1 Failure Settlement

## Transaction
- Lock job (FOR UPDATE)
- Attempt → permanent_failed
- Job → failed
- Reservation → released
- Usage: 0 (no record created)
- External ID: null
- Published URL: null
- Audit: publishing_job_failed with safe error code

## Live Proof
- Scenario: publish_permanent_failure (validation mode)
- Job: failed, error=MOCK_PERMANENT
- Attempt: permanent_failed
- Reservation: released
- Usage: 0
- No automatic retry (D1 scope)
