# DEP-015C2A Mixed-Payload Conflict Test

## Test
20 concurrent requests with same idempotency key but different payloads:
- 10 requests: asset A (de015c2a-0005-0000-0000-000000000001)
- 10 requests: asset B (de015c2a-0005-0000-0000-000000000002)

## Results
- Asset A won the race
  - 1×HTTP 202 (created)
  - 9×HTTP 200 (replayed=true)
- Asset B (losing payload)
  - 10×HTTP 409 PUBLISHING_IDEMPOTENCY_CONFLICT
- HTTP 500 = 0

## Database Cardinality
- jobs = 1
- plans = 1
- reservations = 1
- duplicates = 0
