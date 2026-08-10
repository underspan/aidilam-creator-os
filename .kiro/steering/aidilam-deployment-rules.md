# Aidilam Deployment Rules

## Scope
These rules govern all deployment, infrastructure, and release processes for the Aidilam platform.

## Production Safety

- NO automatic production deployments. Every production deploy requires explicit human approval.
- Staging deploys from the `develop` branch. Production deploys from tagged releases.
- A rollback plan must exist and be documented before any production deployment proceeds.
- No force push (`git push --force`) to any shared branch. Ever.

## Approval & Process

- Production deployments require at least one approver beyond the code author.
- Deployment tickets must include: change summary, rollback steps, monitoring plan.
- Failed deployments trigger immediate rollback, not forward-fix under pressure.
- Post-deployment verification must confirm healthchecks pass before declaring success.

## Docker Images

- All Docker images must use multi-stage builds to minimize final image size.
- Final stage must run as a non-root user. No `USER root` in the final stage.
- Pin base image versions. Do not use `latest` tags for base images.
- Do NOT mount the Docker socket into any **application** container. This is a hard security boundary.
- The shared workspace container does not have Docker socket access; Docker operations use host SSH.

## Resource Limits

- All deployed containers must have explicit CPU and memory resource limits.
- Resource limits are mandatory in both staging and production manifests.
- Do not deploy containers without resource limits — the orchestrator will reject them.
- Set resource requests to expected usage; set limits to maximum tolerable burst.

## Healthchecks

- Every deployed service must expose a healthcheck endpoint.
- Healthchecks must verify actual service readiness (DB connection, queue connection).
- Liveness and readiness probes must be configured for all containers.
- Services that fail healthchecks are automatically removed from load balancing.

## Underspan

- DO NOT modify Underspan configuration, code, or infrastructure.
- Underspan is a coexisting project on the same server — separate and unchanged.
- If Underspan changes are needed, escalate to the platform owner. Do not self-serve.

## NEMO OS

- NEMO OS is on another server — completely out of scope.
- DO NOT access, inspect, reference, modify, deploy, or govern NEMO OS from this environment.
- DO NOT share any resources between AIĐiLàm and NEMO OS.

## Canonical Architecture v1.2 — Shared Workspace

### Classification

- The Ubuntu container is a **shared development and management workspace**.
- It hosts project workspaces for both AIĐiLàm and Underspan.
- It is NOT an AIĐiLàm application container.
- It is NOT an Underspan application container.
- Neither project owns or controls the workspace container exclusively.

### Scope Selection

Kiro's active authorization is determined by the current project root.

When operating in `/opt/aidilam`:
- Kiro may manage AIĐiLàm only.
- `/opt/underspan` is protected.
- Underspan processes, ports, files, Git repositories and credentials must not be modified.
- Default-deny: any resource not conclusively identified as AIĐiLàm-owned must NOT be changed.

### Project Root Verification

Before every task, Kiro must verify the working directory:

```bash
pwd
git rev-parse --show-toplevel 2>/dev/null || true
```

Expected for AIĐiLàm tasks: `/opt/aidilam`

If the root is `/opt/underspan` or unknown, the task is:
```
BLOCKED_WRONG_PROJECT_CONTEXT
```

Do not continue automatically when the project root is wrong.

### Runtime Isolation

Projects share the workspace but must not share application infrastructure:
- No shared databases, Redis, Qdrant, MinIO
- No shared Docker networks, volumes, Compose projects
- No shared credentials or secrets
- No shared application containers

### Shared Container Lifecycle

The workspace container hosts Underspan development runtime (Astro, port 4321).

It must NOT be stopped, restarted, renamed, removed or recreated from an AIĐiLàm task.

Any container lifecycle operation requires explicit cross-project impact assessment
and operator approval.

### Docker Management Path

Docker CLI and Docker socket are NOT available inside the workspace container.

Docker operations use SSH to the SUSE host:
```
Kiro → SSH client → SUSE host → Docker CLI / Docker Compose
```

- No Docker TCP exposure.
- No Docker-in-Docker.
- No Docker daemon inside the workspace.
- Host SSH access uses a dedicated AIĐiLàm management key (when configured).

### Management Authorization

- Kiro is authorized to manage AIĐiLàm only.
- Kiro must never modify Underspan.
- Allowed: /opt/aidilam, approved data/backup paths, aidilam-prefixed Docker resources.
- Default-deny: any resource not conclusively identified as AIĐiLàm-owned must NOT be changed.

### Kiro Tmux Sessions

Use logically separate tmux sessions per project:

- AIĐiLàm: `kiro-aidilam` (working directory: `/opt/aidilam`)
- Underspan: `underspan` (existing session — do not terminate)

For AIĐiLàm work:
```bash
tmux new-session -s kiro-aidilam -c /opt/aidilam
# or attach:
tmux attach-session -t kiro-aidilam
```

Every AIĐiLàm task must start from `cd /opt/aidilam`.

Do not store AIĐiLàm commands in the Underspan tmux pane.
Do not terminate or send keys to the `underspan` tmux session.

## Underspan Runtime Protection Baseline

Protected Underspan runtime inside the shared workspace:

| Attribute | Value |
|-----------|-------|
| Workspace | /opt/underspan/underspan-site |
| Runtime | Astro development server |
| Port | 4321 (0.0.0.0) |
| Startup mechanism | tmux session `underspan` |
| Process supervisor | None (tmux only) |

AIĐiLàm tasks must NOT:

- Send keys to the Underspan tmux session
- Kill Astro, npm or Node processes belonging to Underspan
- Bind another service to port 4321
- Edit files under /opt/underspan
- Change Underspan Git state
- Reuse Underspan SSH keys (underspan_github_ed25519)
- Modify Underspan runtime configuration

Before and after host-side AIĐiLàm Docker changes, verify Underspan health:

```bash
# From inside workspace (host network mode):
curl -fsS -I http://127.0.0.1:4321/ || echo "Underspan NOT responding"
```

Expected after any AIĐiLàm operation:
```
Underspan interruption: NONE
Underspan restart caused by AIĐiLàm: 0
```

## Docker Ownership Convention

- Compose project name: `aidilam`
- Container names: prefix `aidilam-`
- Network names: prefix `aidilam-`
- Volume names: prefix `aidilam-`
- Labels: `com.aidilam.project=aidilam`

## Infrastructure Validation

- Mark any infrastructure change that cannot be verified locally as `REQUIRES_HOST_VALIDATION`.
- Do not claim infrastructure changes work without testing on the target host.
- Unverified infrastructure code must be clearly flagged in PR descriptions and commit messages.

## Secrets & Configuration

- Secrets are injected via environment variables or secret stores, never in code or images.
- Do not commit secrets, tokens, or credentials to any repository.
- Configuration differs per environment — use environment-specific overlays.

## Monitoring & Observability

- All deployed services must emit structured logs and metrics.
- Alerting must be configured before production deploy, not after.
- Dashboard links are included in deployment documentation.

## Branch Protection

- `main` and `develop` branches are protected. No direct pushes.
- All changes go through pull requests with required reviews.
- CI must pass before merge is permitted.
