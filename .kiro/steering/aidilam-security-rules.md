# AIĐiLàm Security Rules

## Container Security

- All containers run as non-root user (UID 1000+)
- No container mounts the Docker socket (/var/run/docker.sock)
- Read-only root filesystem where possible; use tmpfs for writable paths
- Drop all capabilities; add back only what is required
- No privileged containers — ever

## RBAC & Authorization

- Role-Based Access Control enforced on every API endpoint
- Roles: owner, editor, viewer — principle of least privilege
- Permission checks happen at Application layer, not Presentation layer
- No endpoint accessible without authentication (except health checks)
- Token validation occurs server-side on every request

## Workspace Isolation

- Each workspace has isolated data partitions
- Cross-workspace data access is forbidden at query level
- Workspace ID included in every database query filter
- File storage paths are workspace-scoped (/workspace-{id}/...)
- No shared MinIO buckets between workspaces

## Secrets Management

- Secrets stored as references (env vars or secret manager paths)
- No secrets in source code, config files, or Docker Compose yamls
- No secrets in log output — mask sensitive values before logging
- Credentials for AIĐiLàm NEVER shared with Underspan services
- Rotate secrets on schedule; support zero-downtime rotation

## Session & Encryption

- Platform sessions encrypted with AES-256-GCM
- Session tokens are httpOnly, secure, SameSite=Strict
- Session expiry: 24h idle, 7d absolute maximum
- Refresh tokens stored encrypted at rest
- All internal service communication over TLS (mTLS preferred)

## Upload & Input Validation

- All uploads validated: file type (magic bytes), size limits, filename sanitization
- No path traversal — reject filenames containing ../ or absolute paths
- Media files scanned before processing (reject malformed containers)
- Input size limits enforced at reverse proxy AND application layer
- Content-Type must match actual file content

## SSRF Prevention

- Outbound requests restricted to allowlisted domains/IPs
- Block requests to internal/private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, ::1)
- DNS resolution validated before connection (prevent DNS rebinding)
- URL schemes restricted to https:// only (no file://, ftp://, gopher://)

## FFmpeg Security

- All FFmpeg commands use parameterized arguments (no shell interpolation)
- Input files validated before passing to FFmpeg
- Resource limits: max duration, max resolution, max file size
- FFmpeg runs in sandboxed container with no network access

## Audit & Logging

- Audit logs are append-only and immutable — no modification or deletion
- Audit captures: who, what, when, from-where, result
- Security events trigger alerts (failed auth, permission denied, SSRF attempts)
- Log retention: minimum 90 days

## Anti-Patterns (REJECT these)

- ❌ Running containers as root
- ❌ Mounting Docker socket into any container
- ❌ Hardcoded secrets or credentials in code/config
- ❌ Sharing credentials between AIĐiLàm and Underspan
- ❌ Logging sensitive data (tokens, passwords, PII)
- ❌ Trusting client-side input without server validation
- ❌ Shell-interpolated FFmpeg commands
