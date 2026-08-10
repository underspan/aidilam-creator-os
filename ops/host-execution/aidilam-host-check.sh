#!/usr/bin/env bash
# =============================================================================
# aidilam-host-check.sh
# Read-only host validation via SSH
#
# Checks: hostname, OS, Docker version, Docker Compose version, Docker info
# Does NOT modify anything on the host.
# =============================================================================

set -euo pipefail

SSH_CONFIG="/opt/aidilam/.management-state/ssh/config"
SSH_ALIAS="aidilam-host"

echo "=============================================="
echo "AIĐiLàm Host Check (read-only)"
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
  echo "=== Hostname ==="
  hostname

  echo ""
  echo "=== OS ==="
  cat /etc/os-release 2>/dev/null | head -5

  echo ""
  echo "=== Docker CLI ==="
  docker --version 2>/dev/null || echo "Docker CLI not found"

  echo ""
  echo "=== Docker Compose ==="
  docker compose version 2>/dev/null || echo "Docker Compose not found"

  echo ""
  echo "=== Docker Info (summary) ==="
  docker info 2>/dev/null | grep -E "Server Version|Storage Driver|Operating System|Total Memory|Docker Root Dir" || echo "Docker info not available"
'

echo ""
echo "=============================================="
echo "Host check complete (read-only)"
echo "=============================================="
