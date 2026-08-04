# 08 — Rollback Procedure

## Trigger Conditions

Rollback immediately if any of the following occur after cutover:

1. Kiro CLI fails to start or is missing
2. /opt/aidilam is unavailable or empty
3. Docker CLI cannot reach host daemon
4. Replacement container exits or restart-loops
5. Source files are missing
6. Underspan Docker resources change unexpectedly
7. Unexpected application containers restart

## Rollback Script

Location: `/opt/aidilam/ops/management-container/rollback-management-container.sh`

```bash
# Execute from SUSE host:
sudo bash /opt/aidilam/ops/management-container/rollback-management-container.sh
```

## Manual Rollback Steps

If the script fails:

```bash
# 1. Stop the failed replacement
docker stop aidilam-management

# 2. Rename the failed container
docker rename aidilam-management aidilam-management-failed-$(date +%Y%m%d-%H%M)

# 3. Find the rollback container
docker ps -a --filter "name=aidilam-management-rollback"

# 4. Rename rollback container back
docker rename aidilam-management-rollback-YYYYMMDD-HHMM aidilam-management

# 5. Start it
docker start aidilam-management

# 6. Verify
docker exec -it aidilam-management bash -c "cat /etc/os-release; ls /opt/aidilam"
```

## Post-Rollback Verification

1. Confirm /opt/aidilam is accessible
2. Confirm Kiro CLI starts
3. Confirm Underspan dev server can be restarted (tmux)
4. Document the failure cause

## Retention Policy

- Keep rollback container STOPPED until acceptance is confirmed
- Keep failed container for root cause investigation
- Do NOT delete rollback image or container during this task
