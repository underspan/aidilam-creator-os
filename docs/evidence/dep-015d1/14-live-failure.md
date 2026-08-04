# DEP-015D1 Live Failure

## Setup
- AIDILAM_VALIDATION_MODE=true
- Profile: is_validation_only=true
- Plan adapter_snapshot: {"validationScenario": "publish_permanent_failure"}

## Worker Execution
- Adapter: mock-tiktok
- Scenario: publish_permanent_failure
- Result: success=false, retryable=false, errorCode=MOCK_PERMANENT

## Terminal State
- Job: failed, error_code=MOCK_PERMANENT
- Attempt: permanent_failed
- Reservation: released
- Usage: 0
- External ID: null
- Published URL: null
- Automatic retry: 0 (D1 = terminal failure only)
