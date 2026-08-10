#!/usr/bin/env bash
# =============================================================================
# aidilam-compose.sh — AIĐiLàm Docker Compose deployment wrapper
#
# Executes Compose commands on the SUSE host via SSH with safety enforcement.
# =============================================================================
set -euo pipefail

SSH_CONFIG="/opt/aidilam/.management-state/ssh/config"
SSH_ALIAS="aidilam-host"
COMPOSE_PROJECT="aidilam"
COMPOSE_FILE="/opt/aidilam/ops/compose/compose.yaml"
DOCKER="/usr/bin/docker"
LOG_DIR="/opt/aidilam/.management-state/execution-log"

ALLOWED_ACTIONS="config pull build up ps logs restart-service stop-service down"

usage() {
    echo "Usage: $0 <action> [args...]"
    echo ""
    echo "Allowed actions: $ALLOWED_ACTIONS"
    echo ""
    echo "Examples:"
    echo "  $0 config"
    echo "  $0 up"
    echo "  $0 ps"
    echo "  $0 logs --tail=50"
    echo "  $0 down"
    exit 0
}

[ $# -eq 0 ] && usage
ACTION="$1"; shift
EXTRA_ARGS="${*:-}"

# --- Reject unsafe input ---
echo "$ACTION $EXTRA_ARGS" | grep -qiE "prune|rm -f|system.*prune" && {
    echo "❌ REJECTED: Prune/destructive commands not allowed"; exit 1
}
echo "$ACTION $EXTRA_ARGS" | grep -q "/opt/underspan" && {
    echo "❌ REJECTED: /opt/underspan paths not allowed"; exit 1
}

# --- Validate action ---
echo "$ALLOWED_ACTIONS" | grep -qw "$ACTION" || {
    echo "❌ REJECTED: Unknown action '$ACTION'"; echo "Allowed: $ALLOWED_ACTIONS"; exit 1
}

# --- SSH connectivity ---
if ! ssh -F "$SSH_CONFIG" -o ConnectTimeout=5 -o BatchMode=yes "$SSH_ALIAS" 'true' 2>/dev/null; then
    echo "❌ BLOCKED: Cannot connect to $SSH_ALIAS"; exit 1
fi

# --- Build the Compose base command ---
COMPOSE_CMD="$DOCKER compose --project-name $COMPOSE_PROJECT --file $COMPOSE_FILE"

# --- Handle actions ---
case "$ACTION" in
    config)
        ssh -F "$SSH_CONFIG" "$SSH_ALIAS" /bin/sh -s <<REMOTE
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
cd /opt/aidilam/ops/compose
$COMPOSE_CMD config
REMOTE
        ;;
    pull)
        ssh -F "$SSH_CONFIG" "$SSH_ALIAS" /bin/sh -s <<REMOTE
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
cd /opt/aidilam/ops/compose
$COMPOSE_CMD pull
REMOTE
        ;;
    up)
        echo "⚠️  Deploying AIĐiLàm foundation..."
        echo "  Project: $COMPOSE_PROJECT"
        echo "  File: $COMPOSE_FILE"
        read -p "  Type I_CONFIRM_DEPLOY_AIDILAM_FOUNDATION_CANARY to proceed: " CONFIRM
        [ "$CONFIRM" = "I_CONFIRM_DEPLOY_AIDILAM_FOUNDATION_CANARY" ] || { echo "Aborted."; exit 1; }
        ssh -F "$SSH_CONFIG" "$SSH_ALIAS" /bin/sh -s <<REMOTE
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
cd /opt/aidilam/ops/compose
$COMPOSE_CMD up -d
REMOTE
        ;;
    ps)
        ssh -F "$SSH_CONFIG" "$SSH_ALIAS" /bin/sh -s <<REMOTE
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
$COMPOSE_CMD ps
REMOTE
        ;;
    logs)
        ssh -F "$SSH_CONFIG" "$SSH_ALIAS" /bin/sh -s <<REMOTE
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
$COMPOSE_CMD logs $EXTRA_ARGS
REMOTE
        ;;
    down)
        echo "⚠️  Removing AIĐiLàm foundation canary..."
        read -p "  Type I_CONFIRM_REMOVE_AIDILAM_FOUNDATION_CANARY_ONLY to proceed: " CONFIRM
        [ "$CONFIRM" = "I_CONFIRM_REMOVE_AIDILAM_FOUNDATION_CANARY_ONLY" ] || { echo "Aborted."; exit 1; }
        ssh -F "$SSH_CONFIG" "$SSH_ALIAS" /bin/sh -s <<REMOTE
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
cd /opt/aidilam/ops/compose
$COMPOSE_CMD down
REMOTE
        ;;
    *)
        echo "❌ Action '$ACTION' not yet implemented"; exit 1
        ;;
esac

# Log
mkdir -p "$LOG_DIR"
echo "$(date -Is) | $ACTION $EXTRA_ARGS | exit=$?" >> "$LOG_DIR/compose-commands.log"
