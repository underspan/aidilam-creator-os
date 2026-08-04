# 12 — Host Cutover Readiness

## Task: AIDILAM-SRV-002A-GATE
## Date: 2026-07-24T09:57+07:00

---

## Operational Cutover Readiness: BLOCKED

## Status Correction

```
Previous task (ARCH-002 + SRV-002A-FIX) status:
  PASS WITH CONDITIONS

Operational cutover readiness (this task):
  BLOCKED

Reason:
  The current Management Container contains a protected sibling application's
  development runtime (Underspan Astro dev server, port 4321).
  
  The fail-closed safety gate in the cutover script will automatically
  block execution (exit 42) until Underspan is separated.
```

## Blocking Condition

| Condition | Status |
|-----------|--------|
| Underspan process detected | YES (PIDs 1449, 3075, 3088, 3089) |
| Underspan port active | YES (0.0.0.0:4321) |
| Same lifecycle as container | YES (confirmed — same PID namespace) |
| Fail-closed check will block | YES (exit 42) |
| Can be bypassed without code change | NO |

## What Is Ready

| Item | Status |
|------|--------|
| Canonical Architecture v1.1 | ✅ Adopted |
| Replacement Dockerfile | ✅ Created |
| Replacement compose.yaml | ✅ Created |
| Cutover script | ✅ Updated with fail-closed gate |
| Rollback script | ✅ Created |
| Validation script | ✅ Created |
| SSH keys preserved | ✅ Backed up to host filesystem |
| Kiro settings preserved | ✅ Backed up to host filesystem |
| AIĐiLàm source safe | ✅ On host bind mount |

## What Is Blocking

| Item | Owner | Action Required |
|------|-------|-----------------|
| Underspan runtime separation | Underspan project owner | Migrate Underspan to own container or host process |
| Port 4321 availability | Underspan project owner | Ensure port remains accessible post-separation |
| Kiro CLI for Underspan | Underspan project owner | Provide Kiro access if needed in new runtime |

## Sequence to Unblock

```
1. UNDERSPAN-SRV-001 — Separate Underspan Development Runtime
   Owner: Underspan project / platform administrator
   Deliverable: Underspan runs independently, port 4321 available

2. Verify separation:
   - No Underspan processes in Management Container
   - Port 4321 accessible from new runtime
   - Cutover script preflight passes (exit 0)

3. AIDILAM-SRV-002A-CUTOVER — Replace Ubuntu Management Container
   Owner: AIĐiLàm operations / Kiro
   Deliverable: New Management Container with Docker CLI, socket mounted
```

## Risk of Proceeding Without Separation

If the cutover script's fail-closed check were removed (NOT recommended):
- Underspan dev server (port 4321) would become unavailable
- All tmux sessions inside the container would be lost
- The Kiro CLI session used for Underspan development would terminate
- Underspan source would be safe (on host bind mount) but runtime state lost
- Manual restart would be required in the new container

This is why the fail-closed check exists and cannot be bypassed without deliberate code modification.
