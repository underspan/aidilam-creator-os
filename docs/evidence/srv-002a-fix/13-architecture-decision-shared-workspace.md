# 13 — Architecture Decision: Shared Workspace Adoption

## Date: 2026-07-24T10:42+07:00
## Task: AIDILAM-ARCH-003
## Decision: Adopt shared Ubuntu workspace; cancel dedicated replacement container

---

## Context

Tasks AIDILAM-ARCH-002 and SRV-002A-FIX designed a dedicated AIĐiLàm Management Container
to replace the current Ubuntu container. Task SRV-002A-GATE determined the cutover was
blocked because Underspan's development runtime runs inside the same container.

## Decision

The dedicated/replacement Management Container approach is **cancelled**.

The current Ubuntu container is retained as a **shared development and management workspace**
for both AIĐiLàm and Underspan, with strict project isolation enforced through:

- Project-root-based authorization
- Separate tmux sessions
- Default-deny resource protection
- Host SSH execution for Docker operations

## Rationale

1. The current container already functions as a shared workspace.
2. Replacing it would interrupt Underspan (a protected sibling project).
3. Docker operations can be performed via SSH to the SUSE host.
4. Strict isolation rules prevent cross-project contamination without requiring separate containers.
5. The workspace container is not an application runtime — it is developer tooling.

## Impact on Previous Work

| Document/Script | Status |
|----------------|--------|
| cutover-management-container.sh | CANCELLED (exit 43 block added) |
| rollback-management-container.sh | CANCELLED (exit 43 block added) |
| Dockerfile | Superseded (historical reference only) |
| compose.yaml | Superseded (historical reference only) |
| validate-management-container.sh | Superseded |
| Evidence documents 01-12 | Retained as historical record |
| Canonical Architecture v1.1 | Superseded by v1.2 |

## New Architecture

Canonical Architecture v1.2 — Shared Workspace with Strict Project Isolation.

See steering files for the complete definition.
