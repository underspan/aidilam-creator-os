#!/usr/bin/env bash
# =============================================================================
# validate-management-container.sh
# Validates that the AIĐiLàm Management Container is functional.
#
# Run inside the management container:
#   bash /opt/aidilam/ops/management-container/validate-management-container.sh
#
# Or from host:
#   docker exec aidilam-management bash /opt/aidilam/ops/management-container/validate-management-container.sh
# =============================================================================

set -euo pipefail

PASS=0
FAIL=0
WARN=0

check() {
    local desc="$1"
    shift
    if "$@" >/dev/null 2>&1; then
        echo "  ✅ PASS: $desc"
        ((PASS++))
    else
        echo "  ❌ FAIL: $desc"
        ((FAIL++))
    fi
}

warn_check() {
    local desc="$1"
    shift
    if "$@" >/dev/null 2>&1; then
        echo "  ✅ PASS: $desc"
        ((PASS++))
    else
        echo "  ⚠️  WARN: $desc"
        ((WARN++))
    fi
}

echo "=============================================="
echo "AIĐiLàm Management Container Validation"
echo "Date: $(date -Is)"
echo "Hostname: $(hostname)"
echo "=============================================="
echo ""

# --- Container Environment ---
echo "📦 Container Environment"
check "Running inside container" test -f /.dockerenv
check "Ubuntu OS detected" grep -q "Ubuntu" /etc/os-release
check "Running as root" test "$(whoami)" = "root"
echo ""

# --- Docker CLI ---
echo "🐳 Docker CLI"
check "docker command available" command -v docker
check "docker compose available" docker compose version
check "Docker daemon reachable" docker info
check "Docker socket exists" test -S /var/run/docker.sock
echo ""

# --- Kiro CLI ---
echo "🤖 Kiro CLI"
check "kiro-cli binary exists" test -f /root/.local/bin/kiro-cli
warn_check "kiro-cli on PATH" command -v kiro-cli
echo ""

# --- Git ---
echo "📝 Git"
check "git command available" command -v git
check "/opt/aidilam is a git repo or has .kiro" test -d /opt/aidilam/.kiro
echo ""

# --- SSH ---
echo "🔑 SSH"
check "ssh command available" command -v ssh
echo ""

# --- Filesystem ---
echo "📁 Filesystem"
check "/opt/aidilam accessible" test -d /opt/aidilam
check "/opt/aidilam/.kiro/steering exists" test -d /opt/aidilam/.kiro/steering
warn_check "/data accessible" test -d /data
echo ""

# --- Node.js ---
echo "⬡ Node.js"
warn_check "node command available" command -v node
warn_check "npm command available" command -v npm
echo ""

# --- Security ---
echo "🔒 Security Checks"
check "No Docker daemon running in container" bash -c '! pgrep -x dockerd'
check "Docker socket is Unix socket" bash -c 'echo $DOCKER_HOST | grep -q unix://'
echo ""

# --- Summary ---
echo "=============================================="
echo "RESULTS: ✅ ${PASS} passed | ❌ ${FAIL} failed | ⚠️  ${WARN} warnings"
echo "=============================================="

if [ $FAIL -gt 0 ]; then
    echo ""
    echo "❌ VALIDATION FAILED — $FAIL check(s) did not pass."
    exit 1
else
    echo ""
    echo "✅ VALIDATION PASSED"
    exit 0
fi
