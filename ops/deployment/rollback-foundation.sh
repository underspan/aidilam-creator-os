#!/usr/bin/env bash
# =============================================================================
# rollback-foundation.sh — Remove AIĐiLàm foundation canary only
# =============================================================================
set -euo pipefail

SSH_CONFIG="/opt/aidilam/.management-state/ssh/config"
SSH_ALIAS="aidilam-host"
DOCKER="/usr/bin/docker"
COMPOSE_FILE="/opt/aidilam/ops/compose/compose.yaml"

echo "=============================================="
echo "AIĐiLàm Foundation Rollback"
echo "=============================================="
echo ""
echo "This will remove ONLY:"
echo "  - aidilam-foundation-canary container"
echo "  - aidilam-internal network (if unused)"
echo ""
echo "This will NOT remove:"
echo "  - kiro container"
echo "  - Docker images"
echo "  - Volumes"
echo "  - Underspan resources"
echo "  - Unknown resources"
echo ""

read -p "Type I_CONFIRM_ROLLBACK_AIDILAM_FOUNDATION_ONLY to proceed: " CONFIRM
if [ "$CONFIRM" != "I_CONFIRM_ROLLBACK_AIDILAM_FOUNDATION_ONLY" ]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo "Executing rollback..."

ssh -F "$SSH_CONFIG" "$SSH_ALIAS" /bin/sh -s <<REMOTE
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
DOCKER=/usr/bin/docker

cd /opt/aidilam/ops/compose
\$DOCKER compose --project-name aidilam --file $COMPOSE_FILE down

echo ""
echo "=== Post-rollback state ==="
\$DOCKER ps --all --format 'table {{.Names}}\t{{.Status}}'
\$DOCKER network ls
echo ""
echo "Kiro:"
\$DOCKER inspect kiro --format='RestartCount: {{.RestartCount}} | Status: {{.State.Status}}'
REMOTE

echo ""
echo "✅ Rollback complete"
