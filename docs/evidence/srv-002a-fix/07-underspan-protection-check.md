# 07 — Underspan Protection Check

## Status: PARTIAL — Cannot fully verify without Docker CLI

## Known Underspan State

| Aspect | Evidence | Source |
|--------|----------|--------|
| Location | /opt/underspan/underspan-site | Filesystem |
| Runtime | Astro dev server (port 4321) | Process list |
| Process | node astro dev --host 0.0.0.0 --port 4321 | ps aux |
| Tmux session | "underspan" (attached) | tmux list-sessions |
| Tmux session | "underspan-preview" | tmux list-sessions |
| Git repo | /opt/underspan/underspan-site/.git | Filesystem |
| SSH key | /opt/underspan/gitkey | Filesystem (not modified) |

## Architectural Finding

Underspan's development server currently runs **inside this Management Container** via tmux.
This violates the Canonical Architecture v1.1 principle of application independence.

Per v1.1: "AIĐiLàm and Underspan are independent sibling applications; each owns its own containers."

However, this is currently a **dev server** (not a separate Docker container). The current
container serves as both the Management Environment AND the Underspan dev runtime.

## Impact of Cutover on Underspan

| Impact | Assessment |
|--------|-----------|
| Underspan Docker containers changed | N/A (no separate Underspan Docker containers) |
| Underspan dev server interrupted | ⚠️ YES — runs in current container via tmux |
| Underspan source files affected | ❌ NO — /opt/underspan is on host bind mount |
| Underspan configuration modified | ❌ NO |
| Underspan data lost | ❌ NO |

## Mitigation

1. Cutover script warns operator about Underspan dev server impact
2. After cutover, operator can restart Underspan dev in new container
3. Long-term fix: migrate Underspan to its own container (separate task)

## Post-Cutover Verification

After cutover, run the Docker inventory and confirm:
```
Underspan Docker containers changed: 0 (there are no separate containers to change)
Underspan restarts caused by task: 0 (dev server restart is operator-initiated)
Underspan network changes: 0
Underspan volume changes: 0
Underspan file changes: 0 (/opt/underspan on host, verified via ls)
```
