# AIĐiLàm Management Container

## Overview

The Ubuntu Management Container is an **operational workspace** for managing AIĐiLàm.
It is **NOT** an application service, and it is **NOT** part of AIĐiLàm or Underspan.

## Architecture Position

```
SUSE Linux Host
├── Docker Engine
├── Ubuntu Management Container (this)    ← operational workspace
│   ├── Kiro CLI
│   ├── Docker CLI → /var/run/docker.sock → Host Docker Engine
│   ├── Docker Compose v2
│   ├── Git
│   ├── SSH Client
│   └── Build Toolchain (Node.js, npm)
└── Application Layer
    ├── AIĐiLàm (Docker Compose project)
    └── Underspan (separate project)
```

## Quick Start

```bash
# Build the image
cd /opt/aidilam/ops/management-container
docker compose build

# Start the container
docker compose up -d

# Enter the container
docker compose exec management bash

# Validate
bash /opt/aidilam/ops/management-container/validate-management-container.sh
```

## Configuration

| Setting | Value | Reason |
|---------|-------|--------|
| Network mode | `host` | Access host network stack for Docker, SSH |
| Restart policy | `unless-stopped` | Survive host reboots |
| Docker socket | Mounted | Required to manage containers |
| /opt | Bind-mounted | Access AIĐiLàm source and config |
| /data | Optional | Enable after host validation |
| Privileged | `false` | Not needed |

## Volumes

| Mount | Source | Target | Mode |
|-------|--------|--------|------|
| Docker socket | `/var/run/docker.sock` | `/var/run/docker.sock` | rw |
| /opt | `/opt` | `/opt` | rw |
| /data | `/data` | `/data` | rw (optional) |

## Security

- **No Docker-in-Docker**: Uses host daemon via socket
- **No Docker TCP**: Socket-only communication
- **No privileged mode**: Not required
- **no-new-privileges**: Security option enabled
- **ADR-013 scope**: Applies to application containers only; Management Container is exempt

## Docker Identity

```yaml
container_name: aidilam-management
labels:
  com.aidilam.role: management
  com.aidilam.owner: operations
  com.aidilam.application-service: "false"
```

## Management Scope

**Allowed:**
- `/opt/aidilam` and approved AIĐiLàm paths
- Docker resources with prefix `aidilam-`
- This management container itself

**Forbidden:**
- Underspan resources
- NEMO OS
- Unknown Docker resources (default-deny)

## Rollback

If the container fails after cutover:

```bash
# Run from SUSE host
bash /opt/aidilam/ops/management-container/rollback-management-container.sh
```

## Validation

```bash
# Run inside the container
bash /opt/aidilam/ops/management-container/validate-management-container.sh
```

## Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Image definition |
| `compose.yaml` | Container configuration |
| `.env.example` | Environment template |
| `validate-management-container.sh` | Post-deployment validation |
| `rollback-management-container.sh` | Rollback procedure |

## Lifecycle Independence

Rebuilding, upgrading, or replacing this container **MUST NOT**:
- Stop AIĐiLàm application containers
- Stop Underspan containers
- Modify any application data
- Change Docker networks or volumes owned by applications
