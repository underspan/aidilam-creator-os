#!/usr/bin/env bash
# =============================================================================
# CANCELLED — 2026-07-24 AIĐILÀM-ARCH-003
# The dedicated/replacement Management Container approach has been superseded.
# The current Ubuntu container is retained as a shared workspace (Architecture v1.2).
# =============================================================================
echo "BLOCKED: The dedicated/replacement Management Container approach has been cancelled."
echo "The current Ubuntu container is retained as a shared workspace."
echo "Use host SSH execution for AIĐiLàm Docker operations."
exit 43
# =============================================================================
# HISTORICAL: rollback-management-container.sh
# Rolls back the AIĐiLàm Management Container to the previous version.
#
# This script must be executed on the SUSE host (not inside the container).
#
# Prerequisites:
#   - The rollback container exists (stopped, with rollback name)
#   - Docker daemon is accessible
#
# Usage:
#   bash /opt/aidilam/ops/management-container/rollback-management-container.sh
# =============================================================================

set -euo pipefail

CURRENT_NAME="aidilam-management"
ROLLBACK_PREFIX="aidilam-management-rollback"
DATE_STAMP=$(date +%Y%m%d-%H%M)

echo "=============================================="
echo "AIĐiLàm Management Container Rollback"
echo "Date: $(date -Is)"
echo "=============================================="
echo ""

# --- Find rollback container ---
echo "🔍 Looking for rollback container..."
ROLLBACK_CONTAINER=$(docker ps -a --filter "name=${ROLLBACK_PREFIX}" --format '{{.Names}}' | head -1)

if [ -z "$ROLLBACK_CONTAINER" ]; then
    echo "❌ ERROR: No rollback container found matching '${ROLLBACK_PREFIX}*'"
    echo "   Available containers:"
    docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' | grep -i "aidilam\|management" || true
    exit 1
fi

echo "   Found rollback container: ${ROLLBACK_CONTAINER}"
echo ""

# --- Safety check: verify Underspan is unaffected ---
echo "🛡️  Checking Underspan protection..."
UNDERSPAN_BEFORE=$(docker ps --filter "name=underspan" --format '{{.ID}}:{{.Status}}' 2>/dev/null || true)
echo "   Underspan state: ${UNDERSPAN_BEFORE:-none}"
echo ""

# --- Stop current replacement container ---
echo "⏹️  Stopping current container '${CURRENT_NAME}'..."
if docker ps -q --filter "name=^${CURRENT_NAME}$" | grep -q .; then
    docker stop "${CURRENT_NAME}" || true
    echo "   Stopped."
else
    echo "   Not running (already stopped or removed)."
fi
echo ""

# --- Rename current (failed) container ---
FAILED_NAME="aidilam-management-failed-${DATE_STAMP}"
if docker ps -a -q --filter "name=^${CURRENT_NAME}$" | grep -q .; then
    echo "📛 Renaming failed container to '${FAILED_NAME}'..."
    docker rename "${CURRENT_NAME}" "${FAILED_NAME}"
    echo "   Renamed."
else
    echo "   No container named '${CURRENT_NAME}' to rename."
fi
echo ""

# --- Restore rollback container ---
echo "♻️  Restoring rollback container..."
docker rename "${ROLLBACK_CONTAINER}" "${CURRENT_NAME}"
echo "   Renamed '${ROLLBACK_CONTAINER}' → '${CURRENT_NAME}'"
echo ""

echo "▶️  Starting restored container..."
docker start "${CURRENT_NAME}"
echo "   Started."
echo ""

# --- Verify ---
echo "✅ Verification..."
sleep 2
docker ps --filter "name=^${CURRENT_NAME}$" --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
echo ""

# --- Verify Underspan unchanged ---
UNDERSPAN_AFTER=$(docker ps --filter "name=underspan" --format '{{.ID}}:{{.Status}}' 2>/dev/null || true)
if [ "$UNDERSPAN_BEFORE" = "$UNDERSPAN_AFTER" ]; then
    echo "🛡️  Underspan unchanged: PASS"
else
    echo "⚠️  WARNING: Underspan state changed during rollback!"
    echo "   Before: ${UNDERSPAN_BEFORE:-none}"
    echo "   After:  ${UNDERSPAN_AFTER:-none}"
fi
echo ""

echo "=============================================="
echo "ROLLBACK COMPLETE"
echo ""
echo "Next steps:"
echo "  1. Verify Kiro works: docker exec -it ${CURRENT_NAME} kiro-cli --version"
echo "  2. Verify /opt/aidilam: docker exec -it ${CURRENT_NAME} ls /opt/aidilam"
echo "  3. Keep failed container '${FAILED_NAME}' for investigation"
echo "  4. Do NOT delete rollback evidence until root cause documented"
echo "=============================================="
