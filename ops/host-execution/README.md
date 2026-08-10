# AIĐiLàm Host Execution Wrappers

## Purpose

These scripts execute Docker and system commands on the SUSE host via SSH.

The shared workspace container does not have Docker CLI or Docker socket access.
All Docker operations are performed through SSH to the host.

## Prerequisites

- SSH access to the SUSE host must be configured
- SSH alias `aidilam-host` must be working
- See `/opt/aidilam/.management-state/ssh/README.md` for setup

## Current Status

**BLOCKED_HOST_SSH_ACCESS_REQUIRED** — Scripts are ready but will fail until
the `aidilam-host` SSH alias is configured.

## Scripts

| Script | Purpose | Risk Level |
|--------|---------|------------|
| `aidilam-host-check.sh` | Read-only host validation | Low (read-only) |
| `aidilam-docker-readonly.sh` | Docker inventory (read-only) | Low (read-only) |
| `aidilam-compose-wrapper.sh` | Docker Compose operations | Medium-High (runtime changes) |

## Safety Boundaries

All scripts enforce:
- Only the `aidilam` Compose project is allowed
- Paths must be under `/opt/aidilam`
- `/opt/underspan` paths are rejected
- Prune commands are rejected
- Runtime-changing commands require explicit approval
- All commands are logged (sanitized)

## Usage

```bash
# Read-only host check
bash /opt/aidilam/ops/host-execution/aidilam-host-check.sh

# Docker inventory
bash /opt/aidilam/ops/host-execution/aidilam-docker-readonly.sh

# Compose operations (interactive approval required)
bash /opt/aidilam/ops/host-execution/aidilam-compose-wrapper.sh up -d
bash /opt/aidilam/ops/host-execution/aidilam-compose-wrapper.sh ps
bash /opt/aidilam/ops/host-execution/aidilam-compose-wrapper.sh logs
```
