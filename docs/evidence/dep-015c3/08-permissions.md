# DEP-015C3 Permission Matrix

## Creator (pub-creator role)
- create job: 202 ✓
- read jobs: allowed via role
- cancel: 403 (not granted)

## Reader (pub-reader role)
- read job list: 200 ✓
- create: 403 ✓
- cancel: 403 ✓

## Canceller (pub-canceller role)
- cancel: 200 ✓
- create: 403 ✓

## Normal user (no publishing permissions)
- All operations: 403
