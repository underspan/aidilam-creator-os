# DEP-015C2A Security & Isolation

## Credential Rejection
- `access_token` in job create body → 400 "Credential fields are not allowed"
- preValidation hook strips before schema validation

## Project Isolation (Retry)
- POST retry with wrong project ID → 404 "Publishing job not found"
- No metadata leakage (no job details exposed)
- No reservation created

## Quota Isolation
- Quota lock key includes project_id — different projects get different advisory locks
- Reserved operations counted per project_id
- Cross-project contamination impossible (WHERE project_id filter on all quota queries)

## Client Authority Rejection
- Retry endpoint accepts no body (POST with no Content-Type)
- Client cannot override status, currentAttempt, maxAttempts, reservationStatus, etc.
- Server determines all state transitions
