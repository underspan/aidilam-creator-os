#!/usr/bin/env bash
# =============================================================================
# validate-foundation.sh — Validates the AIĐiLàm Docker Compose foundation
# =============================================================================
set -euo pipefail

SSH_CONFIG="/opt/aidilam/.management-state/ssh/config"
SSH_ALIAS="aidilam-host"
DOCKER="/usr/bin/docker"
COMPOSE_FILE="/opt/aidilam/ops/compose/compose.yaml"

echo "=============================================="
echo "AIĐiLàm Foundation Validation"
echo "Date: $(date -Is)"
echo "=============================================="

PASS=0; FAIL=0

check() { local d="$1"; shift; if "$@" >/dev/null 2>&1; then echo "  ✅ $d"; ((PASS++)); else echo "  ❌ $d"; ((FAIL++)); fi; }

# Run all checks on the remote host
RESULT=$(ssh -F "$SSH_CONFIG" "$SSH_ALIAS" /bin/sh -s <<'REMOTE'
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
DOCKER=/usr/bin/docker

echo "=== CONTAINER ==="
$DOCKER inspect aidilam-foundation-canary --format='Status: {{.State.Status}}
Health: {{.State.Health.Status}}
Privileged: {{.HostConfig.Privileged}}
NetworkMode: {{.HostConfig.NetworkMode}}
PidMode: {{.HostConfig.PidMode}}
ReadonlyRootfs: {{.HostConfig.ReadonlyRootfs}}
RestartPolicy: {{.HostConfig.RestartPolicy.Name}}'

echo ""
echo "=== LABELS ==="
$DOCKER inspect aidilam-foundation-canary --format='{{json .Config.Labels}}'

echo ""
echo "=== MOUNTS ==="
$DOCKER inspect aidilam-foundation-canary --format='{{json .Mounts}}'

echo ""
echo "=== NETWORK ==="
$DOCKER inspect aidilam-foundation-canary --format='{{json .NetworkSettings.Networks}}'

echo ""
echo "=== PORT BINDINGS ==="
$DOCKER inspect aidilam-foundation-canary --format='{{json .HostConfig.PortBindings}}'

echo ""
echo "=== RESOURCE LIMITS ==="
$DOCKER inspect aidilam-foundation-canary --format='NanoCPUs: {{.HostConfig.NanoCpus}}
Memory: {{.HostConfig.Memory}}'

echo ""
echo "=== LOGGING ==="
$DOCKER inspect aidilam-foundation-canary --format='LogDriver: {{.HostConfig.LogConfig.Type}}
LogOpts: {{json .HostConfig.LogConfig.Config}}'

echo ""
echo "=== HTTP CHECK ==="
curl -fsSI http://127.0.0.1:18080/ 2>&1 | head -3

echo ""
echo "=== NETWORK INSPECT ==="
$DOCKER network inspect aidilam-internal --format='Driver: {{.Driver}}
Labels: {{json .Labels}}'

echo ""
echo "=== UNDERSPAN ==="
echo "Port4321: $(ss -lnt | grep ':4321 ' | head -1)"
curl -fsSI http://127.0.0.1:4321/ 2>&1 | head -1

echo ""
echo "=== KIRO ==="
$DOCKER inspect kiro --format='RestartCount: {{.RestartCount}} | Status: {{.State.Status}}'
REMOTE
)

echo "$RESULT"
echo ""
echo "=============================================="

# Quick automated checks on the output
echo "$RESULT" | grep -q "Status: running" && echo "  ✅ Container running" || echo "  ❌ Container not running"
echo "$RESULT" | grep -q "Health: healthy" && echo "  ✅ Health: healthy" || echo "  ⚠️  Health: not yet healthy (may need time)"
echo "$RESULT" | grep -q "Privileged: false" && echo "  ✅ Not privileged" || echo "  ❌ PRIVILEGED!"
echo "$RESULT" | grep -q "ReadonlyRootfs: true" && echo "  ✅ Read-only rootfs" || echo "  ❌ Not read-only"
echo "$RESULT" | grep -q "HTTP/1.1 200" && echo "  ✅ HTTP 200" || echo "  ⚠️  HTTP check pending"
echo "$RESULT" | grep -q "docker.sock" && echo "  ❌ Docker socket mounted!" || echo "  ✅ No Docker socket"
echo "$RESULT" | grep -q "underspan" && echo "  ⚠️  Check underspan references" || echo "  ✅ No /opt/underspan mount"
echo "$RESULT" | grep -q "RestartCount: 0" && echo "  ✅ Kiro not restarted" || echo "  ❌ Kiro restarted!"

echo ""
echo "=============================================="
