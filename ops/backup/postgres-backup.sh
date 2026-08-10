#!/usr/bin/env bash
# =============================================================================
# postgres-backup.sh — AIĐiLàm PostgreSQL backup via pg_dump
# Executes on the SUSE host via SSH
# =============================================================================
set -euo pipefail

SSH_CONFIG="/opt/aidilam/.management-state/ssh/config"
SSH_ALIAS="aidilam-host"
DOCKER="/usr/bin/docker"
CONTAINER="aidilam-postgres"
BACKUP_DIR="/backup/aidilam/postgres"
RETENTION=${AIDILAM_BACKUP_RETENTION:-7}
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="aidilam-pg-${TIMESTAMP}.sql.gz"

echo "=============================================="
echo "AIĐiLàm PostgreSQL Backup"
echo "Date: $(date -Is)"
echo "Target: ${BACKUP_DIR}/${BACKUP_FILE}"
echo "Retention: ${RETENTION} backups"
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

# Run pg_dump inside container
echo "Running pg_dump..."
\$DOCKER exec $CONTAINER sh -c '
  pg_dump -U aidilam_app -d aidilam --format=custom
' > "${BACKUP_DIR}/${BACKUP_FILE}.tmp"

# Verify output
SIZE=\$(stat -c%s "${BACKUP_DIR}/${BACKUP_FILE}.tmp" 2>/dev/null || echo "0")
if [ "\$SIZE" -lt 100 ]; then
    echo "❌ ERROR: Backup file too small (\${SIZE} bytes)"
    rm -f "${BACKUP_DIR}/${BACKUP_FILE}.tmp"
    exit 1
fi

# Atomic rename
mv "${BACKUP_DIR}/${BACKUP_FILE}.tmp" "${BACKUP_DIR}/${BACKUP_FILE}"

# Create checksum
sha256sum "${BACKUP_DIR}/${BACKUP_FILE}" > "${BACKUP_DIR}/${BACKUP_FILE}.sha256"

echo "✅ Backup created: ${BACKUP_DIR}/${BACKUP_FILE} (\${SIZE} bytes)"

# Retention: remove oldest backups beyond limit
cd "${BACKUP_DIR}"
ls -1t aidilam-pg-*.sql.gz 2>/dev/null | tail -n +\$(($RETENTION + 1)) | while read f; do
    echo "  Removing old backup: \$f"
    rm -f "\$f" "\${f}.sha256"
done

echo "Done."
REMOTE

echo "=============================================="
echo "Backup complete"
echo "=============================================="
