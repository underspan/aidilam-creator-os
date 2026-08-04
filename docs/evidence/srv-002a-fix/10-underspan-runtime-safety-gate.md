# 10 — Underspan Runtime Safety Gate

## Task: AIDILAM-SRV-002A-GATE
## Date: 2026-07-24T09:57+07:00
## Result: BLOCKED_UNDERSPAN_SEPARATION_REQUIRED

---

## Underspan Process Inventory

| PID | PPID | User | CWD | Command | Start Time | Elapsed | Classification |
|-----|------|------|-----|---------|------------|---------|---------------|
| 1449 | 0 | root | /opt/underspan/underspan-site | tmux: server (session "underspan") | Jul 22 19:07 | 1d 14h50m | UNDERSPAN_DEVELOPMENT_RUNTIME |
| 1450 | 1449 | root | /opt/underspan/underspan-site | bash (tmux shell) | Jul 22 19:07 | 1d 14h50m | UNDERSPAN_DEVELOPMENT_RUNTIME |
| 3075 | 1449 | root | /opt/underspan/underspan-site | `npm run dev --host 0.0.0.0 --port 4321` | Jul 23 16:14 | 17h42m | UNDERSPAN_DEVELOPMENT_RUNTIME |
| 3088 | 3075 | root | /opt/underspan/underspan-site | `sh -c astro dev --host 0.0.0.0 --port 4321` | Jul 23 16:14 | 17h42m | UNDERSPAN_DEVELOPMENT_RUNTIME |
| 3089 | 3088 | root | /opt/underspan/underspan-site | `node .../astro dev --host 0.0.0.0 --port 4321` | Jul 23 16:14 | 17h42m | UNDERSPAN_DEVELOPMENT_RUNTIME |

## Listening Ports

| Address | Port | Protocol | PID | Process | Exposure |
|---------|------|----------|-----|---------|----------|
| 0.0.0.0 | 4321 | TCP | 3089 | node/astro dev | PUBLIC (all interfaces) |

Other ports (22, 111, 2049, 3350, 3389, 20048, 40366, 44328, 49078, 56963) belong to host services visible through host network mode — PIDs not found in container namespace (owned by host).

## Startup Mechanism

| Attribute | Value |
|-----------|-------|
| Mechanism | tmux session |
| Command | `tmux new-session -s underspan -c /opt/underspan/underspan-site kiro; exec bash` |
| Supervisor | None (no systemd, no PM2, no supervisord) |
| Auto-restart | No |
| Recovery method | Manual restart via tmux |

## Container Lifecycle Dependency

| Check | Result |
|-------|--------|
| Same PID namespace as container PID 1 | YES (pid:[4026533766]) |
| Same cgroup as container | YES (docker/3a90ece29953...) |
| Same mount namespace | YES (mnt:[4026533763]) |
| Same network namespace | YES (net:[4026531969] — host) |
| Same UTS namespace | YES (uts:[4026533764]) |
| Will stop when container stops | **YES — CONFIRMED** |

## Handoff Requirements for Underspan Separation

| Item | Current State | Required for Separation |
|------|---------------|------------------------|
| Source code | /opt/underspan/underspan-site (on host bind mount) | No data loss — already on host |
| Package manifest | /opt/underspan/underspan-site/package.json | Must be preserved |
| Git repository | /opt/underspan/underspan-site/.git | Must be preserved |
| SSH key | /opt/underspan/gitkey (on host bind mount) | Must be accessible to new runtime |
| Development server | Astro dev on port 4321 | Must be available after separation |
| Startup command | `npm run dev --host 0.0.0.0 --port 4321` | Must be replicated |
| Network mode | Host (port 4321 publicly exposed) | Maintain same behavior |
| Node.js version | v24.18.0 (via NVM in container) | Must match or be compatible |
| npm | v11.16.0 | Must match or be compatible |
| Kiro CLI | Active inside tmux (used for Underspan development) | Must remain available |

## Expected Target Runtime

The Underspan separation should provide one of:
1. Dedicated Underspan Docker container (preferred — architecture v1.1 compliance)
2. Host-level process with systemd supervision
3. Separate tmux session on the host outside any container

This decision belongs to the Underspan project owner, not AIĐiLàm.

## Verification Required Before AIĐiLàm Cutover

Before the Management Container cutover can proceed:
1. Underspan runtime is running independently from the Management Container
2. Port 4321 is accessible from the separated runtime
3. Underspan source at /opt/underspan is accessible to the new runtime
4. The Management Container no longer hosts any Underspan processes
5. The cutover script's fail-closed check passes (exit 0, not exit 42)
