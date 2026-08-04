# 11 — Cutover Script Safety Review

## Task: AIDILAM-SRV-002A-GATE
## Date: 2026-07-24T09:57+07:00
## File Reviewed: /opt/aidilam/ops/management-container/cutover-management-container.sh

---

## Static Review Findings (Before Modification)

| Check | Script Behavior | Assessment |
|-------|----------------|------------|
| Stops current container | YES — `docker stop` | UNSAFE if Underspan active |
| Renames current container | YES — to rollback name | UNSAFE if Underspan active |
| Removes current container | NO — keeps for rollback | OK |
| Replaces entrypoint | NO — new container, own image | OK |
| Assumes no app processes inside | PARTIALLY — warning + generic yes/no | INSUFFICIENT |
| Validates Underspan process absence | NO | **MISSING (critical)** |
| Records Underspan port state | PARTIAL — Docker container check only | **INCOMPLETE** |
| Validates Underspan after cutover | PARTIAL — only Docker state | **INCOMPLETE** |
| Auto-rolls back if Underspan unavailable | NO | **MISSING** |

## Previous Confirmation Mechanism (Removed)

```bash
read -p "  Continue with cutover? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
```

Issues:
- Generic yes/no is too easy to accept reflexively
- No automated process detection before asking
- Informational warning only, not a safety gate

## Modifications Applied

### 1. Fail-Closed Underspan Detection (3 methods)

**Method 1 — CWD Check:**
Scans all processes inside the container for working directories under `/opt/underspan`.
Avoids false positives from grep/evidence commands.

**Method 2 — Command Check:**
Scans process command lines for Underspan-specific patterns:
- `astro (dev|build|preview)`
- `underspan-site/node_modules`

**Method 3 — Port 4321 Check:**
Inspects `/proc/net/tcp` inside the container for hex port `10E1` in LISTEN state.

### 2. Fail-Closed Behavior

If ANY detection method triggers:
- Prints BLOCKED message with evidence
- Performs NO container stop
- Performs NO container rename
- Performs NO container removal
- Exits with code **42**

Message:
```
BLOCKED: Underspan runtime is active inside the current Ubuntu Management Container.
Management Container cutover would interrupt a protected sibling project.
Separate or relocate Underspan runtime before retrying.
No runtime changes were performed.
```

### 3. General Application Runtime Warning

Additionally detects any non-management process with CWD under `/opt/` that is not `/opt/aidilam`.
Reports as warning (does not auto-block, but informs operator).

### 4. Explicit Operator Confirmation

After all automated checks pass, requires exact string:
```
I_CONFIRM_CURRENT_CONTAINER_HAS_NO_APPLICATION_RUNTIME
```

Generic "yes" is not accepted. Must be typed exactly.

## Script Validation

| Check | Result |
|-------|--------|
| bash -n (syntax check) | ✅ PASS |
| Exit code 42 for Underspan block | ✅ Present |
| Confirmation string check | ✅ Present |
| set -euo pipefail | ✅ Present |
| Docker host check (/.dockerenv) | ✅ Present |
| Rollback on failure | ✅ Present (Step 9) |
| Evidence capture | ✅ Present (Step 1) |

## Remaining Limitations

1. Post-cutover port 4321 check is not added (Underspan won't exist in new container anyway)
2. No automatic rollback specifically for Underspan port loss (moot if Underspan is separated first)
3. Detection relies on `docker exec` — requires Docker CLI on host (expected for host-side execution)
