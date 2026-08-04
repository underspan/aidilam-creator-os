# AIDILAM-DEP-006A: Security Validation

## Date
2026-07-24

## Health Endpoints

| Endpoint | No Token | With Token |
|----------|----------|-----------|
| /health/live | 200 | N/A |
| /health/ready | 200 | N/A |
| /health/deep | 401 | 200 |

## API Endpoints (deny-by-default)

| Endpoint | No Token | With system_admin |
|----------|----------|-----------------|
| /api/v1/system/info | 401 | 200 |
| /api/v1/projects | 401 | 200 |
| /api/v1/security/service-accounts | 401 | 200 |
| /api/v1/security/audit-events | 401 | 200 |

## Documentation Endpoints

| Endpoint | No Token | With system.read |
|----------|----------|-----------------|
| /documentation | 401 | 200 |
| /documentation/json | 401 | 200 |

## Default Deny
ENABLED — all /api/v1/* and /documentation/* routes require authentication.

## Secret Leakage
NONE — token values, pepper, and hashes not found in any output.
