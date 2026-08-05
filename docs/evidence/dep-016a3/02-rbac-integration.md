# DEP-016A3 RBAC Integration

## Enforcement
- All YouTube OAuth routes use `requireProjectPermission(request, projectId, permission)`
- Same middleware as publishing routes (proven in DEP-015)
- Deny-by-default: unauthorized returns 403

## Permissions Registered (5)
- youtube.oauth.configure → POST config
- youtube.oauth.authorize → POST sessions
- youtube.oauth.view → GET config, GET sessions/:id, GET bindings/:accountId
- youtube.oauth.revoke → POST revoke, POST reauthorization-required
- youtube.account.bind → future channel binding

## Role Assignments
- system_admin: all 5 YouTube permissions granted (migration 018)
- other roles: none (deny-by-default)

## Runtime Proof
- requireProjectPermission checks role_permissions table
- project_role_assignments scoped to projectId
- Foreign-project access: 403 (no assignment exists)
