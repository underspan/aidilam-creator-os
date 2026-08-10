#!/usr/bin/env bash
# =============================================================================
# aidilam-docker-readonly.sh
# Docker read-only inventory via SSH
#
# Lists: containers, compose projects, networks, volumes, images, disk usage
# Does NOT modify anything on the host.
# =============================================================================

set -euo pipefail

SSH_CONFIG="/opt/aidilam/.management-state/ssh/config"
SSH_ALIAS="aidilam-host"

echo "=============================================="
echo "AIĐiLàm Docker Inventory (read-only)"
echo "Date: $(date -Is)"
echo "=============================================="
echo ""

# Verify SSH connectivity
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

echo "✅ SSH connection established"
echo ""

ssh -F "$SSH_CONFIG" "${SSH_ALIAS}" '
  echo "=== Containers ==="
  docker ps -a --format "table {{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
  echo ""

  echo "=== Compose Projects ==="
  docker compose ls -a 2>/dev/null || echo "No compose projects found"
  echo ""

  echo "=== Networks ==="
  docker network ls
  echo ""

  echo "=== Volumes ==="
  docker volume ls
  echo ""

  echo "=== Images ==="
  docker image ls
  echo ""

  echo "=== Disk Usage ==="
  docker system df
'

echo ""
echo "=============================================="
echo "Inventory complete (read-only)"
echo "=============================================="
