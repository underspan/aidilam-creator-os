# COM-04E1R2 Evidence 08: System Policy, CSRF, Spoofed Actor

## System Workflow Mutation Denial

| Operation | Result |
|-----------|--------|
| Create version on system workflow | ACCESS_DENIED |
| Activate system version | ACCESS_DENIED |
| Archive system workflow | ACCESS_DENIED |

- Tenant system-workflow mutation count: 0
- Both users CAN read system workflow (policy permits read)

## CSRF Cross-Session

| Scenario | Result |
|----------|--------|
| User-A session + User-B CSRF | CSRF_INVALID |
| User-B session + User-A CSRF | CSRF_INVALID |
| No CSRF token | CSRF_REQUIRED |

- No token values exposed in evidence

## Spoofed Actor/Workspace

Attempt included body fields: userId, role, systemAdmin, actorId, workspaceId

| Test | Result |
|------|--------|
| Spoofed body with owner userId + systemAdmin:true | Created version in own WS-A (spoofed fields ignored) |
| Spoofed X-Workspace-Id, X-User-Id, X-Role headers | Returned WS-A data (headers ignored) |

- Server derives actor from authenticated session cookie
- Server derives workspace from URL path parameter
- Spoofed privilege elevation: 0

## Resource-ID Probing

| Test | Result |
|------|--------|
| Random non-existent UUID | code=NOT_FOUND, no name/desc/creator leaked |
| Foreign workspace workflow via own workspace path | code=NOT_FOUND, keys=['error'] only |

- Foreign metadata leakage: 0
