# DEP-015C2A Cancel After Retry

## Test
- Job in queued state (after successful retry)
- POST /cancel

## Result
- HTTP 200, status=cancelled
- reservation: released
- active reservations: 0
- attempts: 0
- usage: 0
- external ID: null
- published URL: null

## Repeat Cancel
- HTTP 409 "Job is already terminal"
- No new mutations
