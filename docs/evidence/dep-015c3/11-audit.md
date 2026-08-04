# DEP-015C3 Audit Validation

## Event Types
- publishing_job_created: 11
- publishing_job_cancelled: 5

## Cardinality
- One job-created per logical job: ✓
- No duplicate success events from replay: ✓

## Audit Safety
- Tokens in metadata: 0
- Passwords: 0
- Authorization: 0
- Credential references: 0
- Caption content: 0
- Raw payloads: 0
- Request fingerprints: 0
- Storage keys: 0
- Presigned URLs: 0
- Forbidden matches: 0
