# 04 — Cutover Plan

## Status: PREPARED — Awaiting Operator Execution

## Execution Path

The cutover cannot be performed from inside the current container because:
1. Docker CLI is not installed
2. Docker socket (/var/run/docker.sock) is not mounted
3. CAP_SYS_ADMIN not granted (cannot nsenter to host)
4. SSH to localhost requires key-based auth not configured for host

**Required**: Host administrator executes cutover script directly on SUSE host.

## Command

```bash
sudo bash /opt/aidilam/ops/management-container/cutover-management-container.sh
```

This script is accessible on the host because `/opt` is a bind mount.

## Cutover Sequence

1. Capture pre-cutover state (containers, networks, volumes, images)
2. Record Underspan baseline for protection verification
3. Preserve SSH keys from current container (already done to host filesystem)
4. Build replacement image (aidilam-management:latest)
5. Create replacement container with temporary name
6. Validate basic startup (Docker CLI, daemon, Git, /opt/aidilam)
7. Copy SSH keys into replacement container
8. Stop temporary replacement
9. Stop current container
10. Rename current → rollback name (e.g., aidilam-management-rollback-20260724-0940)
11. Rename temporary → aidilam-management
12. Start final replacement
13. Validate all tools
14. Verify Underspan state unchanged

## Rollback Trigger Conditions

- Kiro fails to start
- /opt/aidilam is unavailable
- Docker CLI cannot reach host daemon
- Container repeatedly restarts
- Source files missing
- Underspan state changes

## Pre-Preserved State

| Item | Location | Status |
|------|----------|--------|
| SSH keys | /opt/aidilam/ops/management-container/.ssh-backup/ | ✅ Done |
| SSH config | /opt/aidilam/ops/management-container/.ssh-backup/config | ✅ Done |
| Kiro settings | /opt/aidilam/ops/management-container/.kiro-backup/ | ✅ Done |
| AIĐiLàm source | /opt/aidilam (host bind mount) | ✅ Safe |

## Risk: Underspan Dev Server

**IMPORTANT**: The current container runs Underspan's Astro dev server (port 4321) via tmux.
Stopping the current container WILL temporarily stop this dev server.
Post-cutover, it can be restarted in the new container or migrated to its own container.
