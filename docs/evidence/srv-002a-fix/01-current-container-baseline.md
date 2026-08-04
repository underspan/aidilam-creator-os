# 01 — Current Container Baseline

## Date Captured: 2026-07-24T09:32+07:00

## Container Identity

| Field | Value |
|-------|-------|
| Container ID | 3a90ece29953f3062221e5bec62384da7c8ceb91454e1aaaacec76b9d208eed7 |
| Hostname | s4prddbttf01 (matches host — host network mode) |
| OS | Ubuntu 24.04.4 LTS (Noble Numbat) |
| User | root (uid=0, gid=0) |
| PID 1 | bash |
| PID 1 Command | `bash -c "apt-get update && apt-get install -y curl ca-certificates unzip && curl -fsSL https://cli.kiro.dev/install \| bash && exec bash"` |
| Network Mode | host |
| Image Base | ubuntu:24.04 (2 overlay layers) |
| Overlay Upper | 6b67c05b4769ad2ec06b28f48a0a59077ee9575eeb6c8f2a4510e64a5d41d467 |

## Mounts

| Source | Target | Type |
|--------|--------|------|
| /opt (host rootvg-rootlv) | /opt | bind |
| Container overlay | / | overlay |

**Docker socket: NOT mounted**

## Installed Tools

| Tool | Version | Status |
|------|---------|--------|
| Kiro CLI | 2.13.0 | ✅ Installed (/root/.local/bin/kiro-cli) |
| Git | 2.43.0 | ✅ Installed (apt) |
| SSH | OpenSSH 9.6p1 | ✅ Installed (apt) |
| Node.js | v24.18.0 | ✅ Installed (NVM) |
| NVM | (current) | ✅ Installed (/root/.nvm) |
| Docker CLI | - | ❌ NOT INSTALLED |
| Docker Compose | - | ❌ NOT INSTALLED |
| tmux | (available) | ✅ Installed |
| curl | 8.5.0 | ✅ Installed |

## Ephemeral State (in container overlay)

- /root/.local/bin/kiro-cli, kiro-cli-chat, kiro-cli-term
- /root/.local/share/kiro-cli/ (bun, tui.js, data.sqlite3, feed.json)
- /root/.kiro/ (agents/, sessions/, settings/)
- /root/.nvm/ (Node.js v24.18.0)
- /root/.ssh/ (config, underspan_github_ed25519, known_hosts)
- /root/.bashrc (NVM, PATH customizations)

## Processes Running

- Kiro CLI sessions (3 active kiro-cli processes)
- Underspan Astro dev server (port 4321) via tmux session "underspan"
- Underspan preview via tmux session "underspan-preview"

## Capabilities

Effective: CAP_CHOWN, CAP_DAC_OVERRIDE, CAP_FOWNER, CAP_FSETID, CAP_KILL, CAP_SETGID, CAP_SETUID, CAP_SETPCAP, CAP_NET_BIND_SERVICE, CAP_NET_RAW, CAP_SYS_CHROOT, CAP_MKNOD, CAP_AUDIT_WRITE, CAP_SETFCAP

**CAP_SYS_ADMIN: NOT granted**
**CAP_SYS_PTRACE: NOT granted**

## Key Finding

This container was created ad-hoc with `docker run` using inline commands. No Dockerfile, no Compose project. Docker CLI was never installed, and the Docker socket was never mounted. All operational state is ephemeral in the container's overlay filesystem except /opt which is a host bind mount.
