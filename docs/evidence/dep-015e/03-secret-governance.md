# DEP-015E Secret Governance

## Model
- Credentials stored as opaque references: `credential_reference = 'vault://...'`
- No raw tokens in database (only vault references)
- No raw tokens in logs (detectCredentialFields scan)
- No raw tokens in queue payloads (only jobId, projectId, enqueueReason)
- No raw tokens in audit events (metadata_safe_json only)
- No raw tokens in API responses (credential fields blocked by preValidation hook)

## Fail-Closed
- Missing credential reference: account status = 'draft' or validation-only
- Invalid credential: adapter validation fails before publish
- Mock-only guard: non-mock adapters blocked in current mode

## Production
- Real publishing: DISABLED (AIDILAM_VALIDATION_MODE=false, mock adapters only)
- No production credentials loaded
- No external platform API endpoints configured
