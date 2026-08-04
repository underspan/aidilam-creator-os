# DEP-015D1 Security & Isolation

## Mock-Only Guard
- adapterKey.startsWith('mock') required
- Non-mock adapters: settleFailure(PUBLISHING_ADAPTER_DISABLED)

## URL Safety
- Only mock:// URLs accepted in D1
- Non-mock URLs: settleFailure(PUBLISHING_ADAPTER_RESULT_INVALID)

## Credential-Free Context
- detectCredentialFields() scan before adapter.publish()
- If found: settleFailure(PUBLISHING_ADAPTER_FAILED)

## Project Isolation
- All queries include project_id filter
- Job load: WHERE j.id=$1 AND j.project_id=$2
- Plan: WHERE p.project_id=$2
- Asset: WHERE id=$1 AND project_id=$2
- Foreign project payload: skipped (job not found)
