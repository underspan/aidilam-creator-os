# VIDEOMVP-002 Evidence 13: Download and RBAC Test

## Download Endpoint
- Route: `POST /api/v1/projects/:projectId/assets/:assetId/download-url`
- Authentication: Bearer token (required)
- Authorization: Project-scoped RBAC
- Response: Presigned MinIO URL (15-minute expiry)
- Content-Type served: video/mp4

## Test Results

| Test | Expected | Actual | Pass |
|------|----------|--------|------|
| Authorized owner download | 200 + valid URL | 200 + valid URL | ✓ |
| Downloaded checksum matches stored | Match | Match | ✓ |
| Unauthenticated request | 401 | 401 | ✓ |
| Foreign project access | 403/404 | 404 | ✓ |
| Raw filesystem path in response | None | None | ✓ |

## Checksum Integrity Chain
1. Source file checksum: `0ec292a89316d9c8...`
2. MinIO stored checksum: `0ec292a89316d9c8...` (verified at ingest)
3. Downloaded file checksum: `0ec292a89316d9c8...`
4. **All three match** ✓

## Security Observations
- No raw MinIO paths exposed to client (presigned URL only)
- Presigned URL expires after 15 minutes
- Bearer token required for URL generation
- Project isolation enforced (foreign project = 404)
- No secret leakage in response headers or body

## Audit
- Asset access recorded via existing ingest audit
- Download URL generation is a read operation (audit on asset creation)

## No social-platform upload performed.
## No public anonymous access.
## Owner authentication required for download.
