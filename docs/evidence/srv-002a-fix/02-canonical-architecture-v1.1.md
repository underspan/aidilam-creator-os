# 02 — Canonical Architecture v1.1

## Version: 1.1
## Date: 2026-07-24
## Status: Adopted

## Infrastructure Topology

```
SUSE Linux Host (s4prddbttf01.truongthanh.com)
│
├── Docker Engine
│
├── Ubuntu Management Container (aidilam-management)
│   ├── Kiro CLI
│   ├── Git
│   ├── Docker CLI → /var/run/docker.sock → Host Docker Engine
│   ├── Docker Compose v2
│   ├── SSH Client
│   └── Build Toolchain (Node.js, NVM)
│
└── Application Layer
    ├── AIĐiLàm (Docker Compose project, prefix: aidilam-)
    └── Underspan (independent sibling, separate ownership)
```

## Key Principles

1. **Management Container is NOT an application** — it is an operational workspace
2. **Applications are independent** — neither owns the Management Environment
3. **Docker socket is acceptable** for the Management Container only (ADR-013 applies to app containers)
4. **Lifecycle independence** — replacing the Management Container must not affect applications
5. **Default-deny** — unknown resources are protected until ownership proven

## Changes from v1.0

| Aspect | v1.0 | v1.1 |
|--------|------|------|
| Architecture version | v1.0 | v1.1 |
| Docker socket policy | Absolute prohibition for all containers | Exempt for Management Container |
| Management Container identity | Not formally defined | Container name, labels, role |
| Lifecycle independence | Implicit | Explicit requirement |
| Docker Socket trust boundary | Not documented | Documented and accepted |

## Files Updated

- `/opt/aidilam/.kiro/steering/aidilam-project-context.md` — Architecture section replaced
- `/opt/aidilam/.kiro/steering/aidilam-deployment-rules.md` — Management Container section rewritten

## Conflict Resolution

- ADR-013 "no-docker-socket" clarified in steering as applying to application containers only
- ADR-013 document itself not modified (historical evidence preservation)
- No other conflicts found in steering or docs
