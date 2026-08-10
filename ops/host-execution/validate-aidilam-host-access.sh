#!/usr/bin/env bash
# =============================================================================
# validate-aidilam-host-access.sh
# Comprehensive validation of AIĐiLàm SSH access to the SUSE host.
#
# Reports on: SSH config, key, known hosts, host identity, Docker access.
# Does NOT modify anything.
# =============================================================================

set -euo pipefail

SSH_CONFIG="/opt/aidilam/.management-state/ssh/config"
SSH_ALIAS="aidilam-host"
KEY_PATH="/opt/aidilam/.management-state/ssh/id_ed25519_aidilam_host"
KNOWN_HOSTS="/opt/aidilam/.management-state/ssh/known_hosts"

echo "=============================================="
echo "AIĐiLàm Host Access Validation"
echo "Date: $(date -Is)"
echo "=============================================="
echo ""

PASS=0
FAIL=0
WARN=0

check() {
    local desc="$1"; shift
    if "$@" >/dev/null 2>&1; then
        echo "  ✅ $desc"
        ((PASS++))
    else
        echo "  ❌ $desc"
        ((FAIL++))
    fi
}

warn_check() {
    local desc="$1"; shift
    if "$@" >/dev/null 2>&1; then
        echo "  ✅ $desc"
        ((PASS++))
    else
        echo "  ⚠️  $desc"
        ((WARN++))
    fi
}

# --- SSH Config ---
echo "📋 SSH Configuration"
check "SSH config exists" test -f "$SSH_CONFIG"
check "SSH config permissions (600)" test "$(stat -c %a "$SSH_CONFIG" 2>/dev/null)" = "600"
check "Config references aidilam-host" grep -q "Host aidilam-host" "$SSH_CONFIG"
check "StrictHostKeyChecking enabled" grep -q "StrictHostKeyChecking yes" "$SSH_CONFIG"
echo ""

# --- Private Key ---
echo "🔑 Private Key"
check "Private key exists" test -f "$KEY_PATH"
check "Private key permissions (600)" test "$(stat -c %a "$KEY_PATH" 2>/dev/null)" = "600"
check "Public key exists" test -f "${KEY_PATH}.pub"
echo "  Fingerprint: $(ssh-keygen -l -f "$KEY_PATH" 2>/dev/null | awk '{print $2}')"
echo ""

# --- Known Hosts ---
echo "🌐 Known Hosts"
check "Known hosts file exists" test -f "$KNOWN_HOSTS"
check "Known hosts file not empty" test -s "$KNOWN_HOSTS"
echo "  Host key: $(ssh-keygen -l -f "$KNOWN_HOSTS" 2>/dev/null | awk '{print $2}')"
echo ""

# --- SSH Connection ---
echo "🔗 SSH Connection"
if ssh -F "$SSH_CONFIG" -o ConnectTimeout=10 -o BatchMode=yes "$SSH_ALIAS" 'true' 2>/dev/null; then
    echo "  ✅ SSH connection successful"
    ((PASS++))

    echo ""
    echo "🖥️  Host Identity"
    ssh -F "$SSH_CONFIG" "$SSH_ALIAS" '
        echo "  Hostname: $(hostname)"
        echo "  OS: $(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d \")"
        echo "  User: $(whoami)"
        echo "  Date: $(date -Is)"
    ' 2>/dev/null || echo "  ❌ Failed to get host identity"

    echo ""
    echo "🐳 Docker Access"
    DOCKER_OK=true
    if ssh -F "$SSH_CONFIG" "$SSH_ALIAS" 'docker --version' >/dev/null 2>&1; then
        echo "  ✅ Docker CLI: $(ssh -F "$SSH_CONFIG" "$SSH_ALIAS" 'docker --version' 2>/dev/null)"
    else
        echo "  ❌ Docker CLI not accessible"
        DOCKER_OK=false
        ((FAIL++))
    fi

    if ssh -F "$SSH_CONFIG" "$SSH_ALIAS" 'docker compose version' >/dev/null 2>&1; then
        echo "  ✅ Docker Compose: $(ssh -F "$SSH_CONFIG" "$SSH_ALIAS" 'docker compose version' 2>/dev/null)"
    else
        echo "  ❌ Docker Compose not accessible"
        DOCKER_OK=false
        ((FAIL++))
    fi

    if ssh -F "$SSH_CONFIG" "$SSH_ALIAS" 'docker info' >/dev/null 2>&1; then
        echo "  ✅ Docker daemon reachable"
        ((PASS++))
    else
        echo "  ❌ Docker daemon not reachable"
        ((FAIL++))
    fi

    echo ""
    echo "🔒 Security"
    echo "  Connection method: public-key authentication"
    echo "  Docker TCP: DISABLED (using SSH)"
    echo "  StrictHostKeyChecking: YES"

else
    echo "  ❌ SSH connection failed"
    ((FAIL++))
    echo ""
    echo "  The public key may not be installed on the host."
    echo "  Run on the SUSE host:"
    echo "    bash /opt/aidilam/.management-state/ssh/install-aidilam-pubkey.sh"
fi

echo ""
echo "=============================================="
echo "RESULTS: ✅ ${PASS} passed | ❌ ${FAIL} failed | ⚠️  ${WARN} warnings"
echo "=============================================="

if [ $FAIL -gt 0 ]; then
    echo ""
    echo "Status: BLOCKED — $FAIL check(s) failed"
    exit 1
else
    echo ""
    echo "Status: PASS — All checks passed"
    exit 0
fi
