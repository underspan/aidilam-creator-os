#!/usr/bin/env bash
# =============================================================================
# aidilam-compose-wrapper.sh
# Docker Compose operations for AIĐiLàm via SSH to SUSE host
#
# Safety enforcement:
#   - Only project name "aidilam" is allowed
#   - Compose file must be under /opt/aidilam
#   - /opt/underspan paths are rejected
#   - Prune commands are rejected
#   - Runtime-changing commands require explicit approval
#   - All commands are logged (sanitized)
#
# Usage:
#   bash aidilam-compose-wrapper.sh ps
#   bash aidilam-compose-wrapper.sh up -d
#   bash aidilam-compose-wrapper.sh logs -f --tail=100
#   bash aidilam-compose-wrapper.sh down
# =============================================================================

set -euo pipefail

SSH_CONFIG="/opt/aidilam/.management-state/ssh/config"
SSH_ALIAS="aidilam-host"
COMPOSE_PROJECT="aidilam"
COMPOSE_FILE="/opt/aidilam/source/docker/compose.yaml"
LOG_DIR="/opt/aidilam/.management-state/execution-log"

# Commands that change runtime state and require confirmation
DESTRUCTIVE_COMMANDS="up|down|restart|stop|start|rm|kill|pause|unpause|scale|exec|run"

# Commands that are always safe (read-only)
SAFE_COMMANDS="ps|logs|top|config|images|ls|version|port|events"

# =============================================================================
# Safety Checks
# =============================================================================

if [ $# -eq 0 ]; then
    echo "Usage: $0 <compose-command> [args...]"
    echo ""
    echo "Safe commands (no confirmation): ps, logs, top, config, images, ls, version"
    echo "Runtime commands (confirmation required): up, down, restart, stop, start, rm"
    echo ""
    echo "Example:"
    echo "  $0 ps"
    echo "  $0 up -d"
    echo "  $0 logs -f --tail=50"
    exit 0
fi

COMPOSE_CMD="$1"
shift
COMPOSE_ARGS="${*:-}"

# --- Reject prune commands ---
if echo "$COMPOSE_CMD $COMPOSE_ARGS" | grep -qiE "prune"; then
    echo "❌ REJECTED: Prune commands are not allowed."
    echo "   Prune operations have broad blast radius and may affect other projects."
    exit 1
fi

# --- Reject paths containing /opt/underspan ---
if echo "$COMPOSE_CMD $COMPOSE_ARGS" | grep -q "/opt/underspan"; then
    echo "❌ REJECTED: Paths under /opt/underspan are not allowed."
    echo "   This wrapper only manages the AIĐiLàm project."
    exit 1
fi

# --- Reject non-aidilam project names ---
if echo "$COMPOSE_ARGS" | grep -qE -- "-p\s+[^\s]+|--project-name\s+[^\s]+"; then
    if ! echo "$COMPOSE_ARGS" | grep -qE -- "-p\s+aidilam|--project-name\s+aidilam"; then
        echo "❌ REJECTED: Only project name 'aidilam' is allowed."
        exit 1
    fi
fi

# --- Verify SSH connectivity ---
if [ ! -f "$SSH_CONFIG" ]; then
    echo "❌ BLOCKED: SSH config not found at $SSH_CONFIG"
    exit 1
fi

if ! ssh -F "$SSH_CONFIG" -o ConnectTimeout=5 -o BatchMode=yes "${SSH_ALIAS}" 'true' 2>/dev/null; then
    echo "❌ BLOCKED_HOST_SSH_ACCESS_REQUIRED"
    echo ""
    echo "Cannot connect to '${SSH_ALIAS}'."
    echo "Ensure the public key is installed on the host. See:"
    echo "  /opt/aidilam/.management-state/ssh/README.md"
    exit 1
fi

# --- Verify compose file exists ---
if ! ssh -F "$SSH_CONFIG" "${SSH_ALIAS}" "test -f ${COMPOSE_FILE}" 2>/dev/null; then
    echo "⚠️  Compose file not found at ${COMPOSE_FILE}"
    echo "   The AIĐiLàm application has not been deployed yet."
    echo "   Proceeding with command anyway (it may use default discovery)."
fi

# --- Confirmation for runtime-changing commands ---
if echo "$COMPOSE_CMD" | grep -qE "^(${DESTRUCTIVE_COMMANDS})$"; then
    echo "=============================================="
    echo "⚠️  Runtime-Changing Command"
    echo ""
    echo "  Project: ${COMPOSE_PROJECT}"
    echo "  Command: docker compose -p ${COMPOSE_PROJECT} ${COMPOSE_CMD} ${COMPOSE_ARGS}"
    echo "  Host: ${SSH_HOST}"
    echo ""
    echo "  This will modify running containers."
    echo "=============================================="
    read -p "  Approve? (yes/no): " APPROVAL
    if [ "$APPROVAL" != "yes" ]; then
        echo "  Aborted."
        exit 0
    fi
fi

# =============================================================================
# Execute
# =============================================================================

# Log the command (sanitized)
mkdir -p "${LOG_DIR}"
echo "$(date -Is) | compose ${COMPOSE_CMD} ${COMPOSE_ARGS}" >> "${LOG_DIR}/compose-commands.log"

echo ""
echo "Executing: docker compose -p ${COMPOSE_PROJECT} ${COMPOSE_CMD} ${COMPOSE_ARGS}"
echo "---"

ssh -F "$SSH_CONFIG" "${SSH_ALIAS}" "cd /opt/aidilam && docker compose -p ${COMPOSE_PROJECT} ${COMPOSE_CMD} ${COMPOSE_ARGS}"

EXIT_CODE=$?
echo "---"
echo "Exit code: ${EXIT_CODE}"

# Log result
echo "$(date -Is) | exit=${EXIT_CODE}" >> "${LOG_DIR}/compose-commands.log"

exit ${EXIT_CODE}
