#!/usr/bin/env bash
# =============================================================================
# redis-backup.sh — AIĐiLàm Redis backup (RDB snapshot)
# Executes on the SUSE host via SSH
# =============================================================================
set -euo pipefail

SSH_CONFIG="/opt/aidilam/.management-state/ssh/config"
SSH_ALIAS="aidilam-host"
DOCKER="/usr/bin/docker"
CONTAINER="aidilam-redis"
BACKUP_DIR="/backup/aidilam/redis"
RETENTION=${AIDILAM_BACKUP_RETENTION:-7}
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="aidilam-redis-${TIMESTAMP}.rdb"

echo "=============================================="
echo "AIĐiLàm Redis Backup"
echo "Date: $(date -Is)"
echo "Target: ${BACKUP_DIR}/${BACKUP_FILE}"
echo "=============================================="

ssh -F "$SSH_CONFIG" "$SSH_ALIAS" /bin/sh -s <<REMOTE
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
DOCKER=$DOCKER

# Verify container is healthy
STATUS=\$(\$DOCKER inspect $CONTAINER --format='{{.State.Health.Status}}' 2>/dev/null)
if [ "\$STATUS" != "healthy" ]; then
    echo "❌ ERROR: $CONTAINER is not healthy (status: \$STATUS)"
    exit 1
fi

# Trigger BGSAVE and wait
echo "Triggering BGSAVE..."
REDIS_PASS=\$(cat /opt/aidilam/secrets/redis_password | tr -d '\n')
\$DOCKER exec $CONTAINER redis-cli -a "\$REDIS_PASS" BGSAVE 2>/dev/null
sleep 5

# Check last save succeeded
LAST_SAVE=\$(\$DOCKER exec $CONTAINER redis-cli -a "\$REDIS_PASS" LASTSAVE 2>/dev/null)
echo "Last save timestamp: \$LAST_SAVE"

# Copy dump.rdb from container data volume
if [ -f /data/aidilam/redis/dump.rdb ]; then
    cp /data/aidilam/redis/dump.rdb "${BACKUP_DIR}/${BACKUP_FILE}.tmp"

    SIZE=\$(stat -c%s "${BACKUP_DIR}/${BACKUP_FILE}.tmp" 2>/dev/null || echo "0")
    if [ "\$SIZE" -lt 50 ]; then
        echo "❌ ERROR: RDB file too small (\${SIZE} bytes)"
        rm -f "${BACKUP_DIR}/${BACKUP_FILE}.tmp"
        exit 1
    fi

    mv "${BACKUP_DIR}/${BACKUP_FILE}.tmp" "${BACKUP_DIR}/${BACKUP_FILE}"
    sha256sum "${BACKUP_DIR}/${BACKUP_FILE}" > "${BACKUP_DIR}/${BACKUP_FILE}.sha256"
    echo "✅ Backup created: ${BACKUP_DIR}/${BACKUP_FILE} (\${SIZE} bytes)"
else
    echo "⚠️  No dump.rdb found (Redis may not have persisted yet)"
    # Copy appendonly files if available
    if [ -d /data/aidilam/redis/appendonlydir ]; then
        tar czf "${BACKUP_DIR}/${BACKUP_FILE}.aof.tar.gz" -C /data/aidilam/redis appendonlydir
        sha256sum "${BACKUP_DIR}/${BACKUP_FILE}.aof.tar.gz" > "${BACKUP_DIR}/${BACKUP_FILE}.aof.tar.gz.sha256"
        echo "✅ AOF backup created"
    fi
fi

# Retention
cd "${BACKUP_DIR}"
ls -1t aidilam-redis-*.rdb 2>/dev/null | tail -n +\$(($RETENTION + 1)) | while read f; do
    echo "  Removing old backup: \$f"
    rm -f "\$f" "\${f}.sha256"
done

echo "Done."
REMOTE

echo "=============================================="
echo "Redis backup complete"
echo "=============================================="
