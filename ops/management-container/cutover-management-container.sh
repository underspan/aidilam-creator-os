#!/usr/bin/env bash
# =============================================================================
# CANCELLED — 2026-07-24 AIĐILÀM-ARCH-003
# The dedicated/replacement Management Container approach has been superseded.
# The current Ubuntu container is retained as a shared workspace (Architecture v1.2).
# Docker operations use host SSH execution instead.
# =============================================================================
echo "BLOCKED: The dedicated/replacement Management Container approach has been cancelled."
echo "The current Ubuntu container is retained as a shared workspace."
echo "Use host SSH execution for AIĐiLàm Docker operations."
exit 43
# =============================================================================
# HISTORICAL: cutover-management-container.sh
# AIĐiLàm Management Container — Controlled Cutover (CANCELLED)
#
# MUST BE EXECUTED ON THE SUSE HOST — NOT inside the current container.
#
# This script:
#   1. Runs fail-closed Underspan detection preflight
#   2. Requires explicit operator confirmation
#   3. Captures pre-cutover state
#   4. Preserves ephemeral SSH state from old container
#   5. Builds the replacement image
#   6. Creates the replacement container
#   7. Validates basic startup
#   8. Stops the old container
#   9. Renames for rollback
#   10. Starts the replacement as aidilam-management
#   11. Validates including Underspan port check
#
# Usage:
#   sudo bash /opt/aidilam/ops/management-container/cutover-management-container.sh
#
# SAFETY: This script will BLOCK (exit 42) if Underspan runtime is detected
# inside the current Management Container. Underspan must be separated first.
#
# =============================================================================

set -euo pipefail

# --- Configuration ---
CURRENT_CONTAINER_ID="3a90ece29953f3062221e5bec62384da7c8ceb91454e1aaaacec76b9d208eed7"
NEW_CONTAINER_NAME="aidilam-management"
TEMP_CONTAINER_NAME="aidilam-management-new"
ROLLBACK_NAME="aidilam-management-rollback-$(date +%Y%m%d-%H%M)"
BUILD_DIR="/opt/aidilam/ops/management-container"
EVIDENCE_DIR="/opt/aidilam/docs/evidence/srv-002a-fix"
SSH_BACKUP="${BUILD_DIR}/.ssh-backup"

# Exit code for Underspan detection block
readonly EXIT_UNDERSPAN_BLOCKED=42

echo "=============================================="
echo "AIĐiLàm Management Container Cutover"
echo "Date: $(date -Is)"
echo "Host: $(hostname)"
echo "=============================================="
echo ""

# =============================================================================
# PREFLIGHT: Must be run on host, not inside container
# =============================================================================
if [ -f /.dockerenv ]; then
    echo "❌ ERROR: This script must be run on the SUSE host, NOT inside a container."
    exit 1
fi

# Docker daemon must be accessible
if ! docker info >/dev/null 2>&1; then
    echo "❌ ERROR: Docker daemon not accessible."
    exit 1
fi
echo "  ✅ Running on host"
echo "  ✅ Docker daemon accessible"
echo ""

# =============================================================================
# FAIL-CLOSED PREFLIGHT: Underspan Runtime Detection
# =============================================================================
echo "🛡️  PREFLIGHT: Underspan Runtime Detection (fail-closed)"
echo "  Scanning container ${CURRENT_CONTAINER_ID:0:12} for Underspan processes..."
echo ""

UNDERSPAN_DETECTED=false
UNDERSPAN_EVIDENCE=""

# Detection method 1: Check for processes with CWD under /opt/underspan
# Use docker exec to inspect the running container's process table
UNDERSPAN_PROCS=$(docker exec "${CURRENT_CONTAINER_ID}" bash -c '
    found=0
    for pid in $(ls /proc | grep "^[0-9]"); do
        cwd=$(readlink -f /proc/$pid/cwd 2>/dev/null || true)
        cmd=$(tr "\0" " " < /proc/$pid/cmdline 2>/dev/null || true)
        # Skip our own detection commands
        if echo "$cmd" | grep -q "readlink\|cmdline\|grep\|bash -c"; then
            continue
        fi
        if echo "$cwd" | grep -q "/opt/underspan"; then
            echo "PID=$pid CWD=$cwd CMD=$cmd"
            found=1
        fi
    done
    exit $found
' 2>/dev/null) && true || UNDERSPAN_DETECTED_CWD=$?

if [ "${UNDERSPAN_DETECTED_CWD:-0}" -ne 0 ]; then
    UNDERSPAN_DETECTED=true
    UNDERSPAN_EVIDENCE="${UNDERSPAN_EVIDENCE}  [CWD] Processes with working directory under /opt/underspan:\n${UNDERSPAN_PROCS}\n"
fi

# Detection method 2: Check for processes running astro/underspan commands
UNDERSPAN_CMD_PROCS=$(docker exec "${CURRENT_CONTAINER_ID}" bash -c '
    found=0
    for pid in $(ls /proc | grep "^[0-9]"); do
        cmd=$(tr "\0" " " < /proc/$pid/cmdline 2>/dev/null || true)
        # Skip our own detection commands and grep itself
        if echo "$cmd" | grep -q "readlink\|cmdline\|bash -c"; then
            continue
        fi
        # Match actual runtime processes, not evidence files or grep commands
        if echo "$cmd" | grep -qE "(astro (dev|build|preview)|underspan-site/node_modules)"; then
            echo "PID=$pid CMD=$cmd"
            found=1
        fi
    done
    exit $found
' 2>/dev/null) && true || UNDERSPAN_DETECTED_CMD=$?

if [ "${UNDERSPAN_DETECTED_CMD:-0}" -ne 0 ]; then
    UNDERSPAN_DETECTED=true
    UNDERSPAN_EVIDENCE="${UNDERSPAN_EVIDENCE}  [CMD] Processes running Underspan commands:\n${UNDERSPAN_CMD_PROCS}\n"
fi

# Detection method 3: Check if port 4321 is listening inside the container
UNDERSPAN_PORT=$(docker exec "${CURRENT_CONTAINER_ID}" bash -c '
    # Check /proc/net/tcp for port 4321 (0x10E1) in LISTEN state
    if grep -q ":10E1" /proc/net/tcp 2>/dev/null; then
        echo "Port 4321 is LISTENING"
        exit 1
    fi
    exit 0
' 2>/dev/null) && true || UNDERSPAN_DETECTED_PORT=$?

if [ "${UNDERSPAN_DETECTED_PORT:-0}" -ne 0 ]; then
    UNDERSPAN_DETECTED=true
    UNDERSPAN_EVIDENCE="${UNDERSPAN_EVIDENCE}  [PORT] Port 4321 is listening (Underspan Astro dev server)\n"
fi

# --- FAIL-CLOSED DECISION ---
if [ "$UNDERSPAN_DETECTED" = true ]; then
    echo "=============================================="
    echo "❌ BLOCKED: Underspan runtime is active inside the current"
    echo "   Ubuntu Management Container."
    echo ""
    echo "   Management Container cutover would interrupt a protected"
    echo "   sibling project."
    echo ""
    echo "   Evidence:"
    echo -e "$UNDERSPAN_EVIDENCE"
    echo ""
    echo "   Separate or relocate Underspan runtime before retrying."
    echo "   No runtime changes were performed."
    echo "=============================================="
    exit ${EXIT_UNDERSPAN_BLOCKED}
fi

echo "  ✅ No Underspan runtime detected inside Management Container"
echo ""

# =============================================================================
# PREFLIGHT: Check for ANY other application runtime processes
# =============================================================================
echo "🛡️  PREFLIGHT: Checking for other application runtimes..."

OTHER_RUNTIMES=$(docker exec "${CURRENT_CONTAINER_ID}" bash -c '
    # Look for non-management processes (not bash, kiro-cli, tmux, ps, grep, etc.)
    for pid in $(ls /proc | grep "^[0-9]"); do
        comm=$(cat /proc/$pid/comm 2>/dev/null || true)
        cwd=$(readlink -f /proc/$pid/cwd 2>/dev/null || true)
        # Skip known management processes
        case "$comm" in
            bash|kiro*|bun|tmux*|ps|grep|sleep|cat|readlink|tr|ls) continue ;;
        esac
        # Skip if CWD is root, home, or kiro-related
        case "$cwd" in
            /|/root|/root/.local*) continue ;;
        esac
        # Flag anything with CWD under /opt that is not aidilam management
        if echo "$cwd" | grep -qE "^/opt/" && ! echo "$cwd" | grep -q "/opt/aidilam"; then
            cmd=$(tr "\0" " " < /proc/$pid/cmdline 2>/dev/null || true)
            echo "PID=$pid CWD=$cwd CMD=${cmd:0:100}"
        fi
    done
' 2>/dev/null) || true

if [ -n "$OTHER_RUNTIMES" ]; then
    echo "  ⚠️  WARNING: Other application processes detected:"
    echo "$OTHER_RUNTIMES"
    echo ""
    echo "  These processes will be terminated during cutover."
    echo "  Review before proceeding."
    echo ""
fi

echo "  ✅ Runtime preflight complete"
echo ""

# =============================================================================
# EXPLICIT OPERATOR CONFIRMATION
# =============================================================================
echo "=============================================="
echo "⚠️  EXPLICIT CONFIRMATION REQUIRED"
echo ""
echo "  You are about to stop the current Management Container and"
echo "  replace it with a new one."
echo ""
echo "  This will terminate ALL processes inside the current container."
echo ""
echo "  Confirm that:"
echo "    - No application runtime is active inside the container"
echo "    - Underspan has been separated or is not running"
echo "    - You accept responsibility for any interrupted processes"
echo ""
echo "  Type exactly:"
echo "    I_CONFIRM_CURRENT_CONTAINER_HAS_NO_APPLICATION_RUNTIME"
echo ""
echo "=============================================="
read -p "  Confirmation: " OPERATOR_CONFIRM
if [ "$OPERATOR_CONFIRM" != "I_CONFIRM_CURRENT_CONTAINER_HAS_NO_APPLICATION_RUNTIME" ]; then
    echo ""
    echo "  ❌ Confirmation not provided. Cutover aborted."
    echo "  No runtime changes were performed."
    exit 1
fi
echo ""
echo "  ✅ Operator confirmation accepted"
echo ""

# --- Step 1: Capture pre-cutover state ---
echo "📋 Step 1: Capturing pre-cutover state..."
mkdir -p "${EVIDENCE_DIR}"

docker ps -a --format 'table {{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}\t{{.Networks}}' \
    > "${EVIDENCE_DIR}/pre-cutover-containers.txt" 2>&1

docker network ls > "${EVIDENCE_DIR}/pre-cutover-networks.txt" 2>&1
docker volume ls > "${EVIDENCE_DIR}/pre-cutover-volumes.txt" 2>&1
docker image ls > "${EVIDENCE_DIR}/pre-cutover-images.txt" 2>&1

# Capture Underspan baseline
UNDERSPAN_STATE=$(docker ps -a --filter "name=underspan" --format '{{.ID}}:{{.Names}}:{{.Status}}:{{.Image}}' 2>/dev/null || true)
echo "${UNDERSPAN_STATE}" > "${EVIDENCE_DIR}/underspan-baseline.txt"
echo "  Underspan state: ${UNDERSPAN_STATE:-none}"

# Get current container name
CURRENT_NAME=$(docker inspect --format '{{.Name}}' "${CURRENT_CONTAINER_ID}" 2>/dev/null | sed 's/^\/*//')
if [ -z "$CURRENT_NAME" ]; then
    echo "❌ ERROR: Cannot find container ${CURRENT_CONTAINER_ID}"
    exit 1
fi
echo "  Current container name: ${CURRENT_NAME}"
echo "  ✅ Pre-cutover state captured"
echo ""

# --- Step 2: Capture current container config ---
echo "📋 Step 2: Recording current container config..."
docker inspect "${CURRENT_CONTAINER_ID}" > "${EVIDENCE_DIR}/current-container-inspect.json" 2>&1
# Sanitize: remove env vars that might contain secrets
python3 -c "
import json, sys
with open('${EVIDENCE_DIR}/current-container-inspect.json') as f:
    data = json.load(f)
for container in data:
    env = container.get('Config', {}).get('Env', [])
    container['Config']['Env'] = [e if not any(s in e.upper() for s in ['TOKEN', 'SECRET', 'KEY=', 'PASSWORD', 'AUTH']) else e.split('=')[0] + '=[REDACTED]' for e in env]
with open('${EVIDENCE_DIR}/current-container-inspect-sanitized.json', 'w') as f:
    json.dump(data, f, indent=2)
" 2>/dev/null || echo "  Warning: Could not sanitize inspect output (python3 not available)"
echo "  ✅ Container config recorded"
echo ""

# --- Step 3: Preserve SSH keys if not already done ---
echo "🔑 Step 3: Preserving SSH keys..."
if [ -d "${SSH_BACKUP}" ] && [ -f "${SSH_BACKUP}/underspan_github_ed25519" ]; then
    echo "  ✅ SSH keys already preserved at ${SSH_BACKUP}"
else
    echo "  Copying SSH keys from container..."
    mkdir -p "${SSH_BACKUP}"
    docker cp "${CURRENT_CONTAINER_ID}:/root/.ssh/." "${SSH_BACKUP}/" 2>/dev/null || echo "  ⚠️  Could not copy SSH keys"
    chmod 700 "${SSH_BACKUP}"
    chmod 600 "${SSH_BACKUP}"/* 2>/dev/null || true
fi
echo ""

# --- Step 4: Build replacement image ---
echo "🔨 Step 4: Building replacement image..."
cd "${BUILD_DIR}"
docker build -t aidilam-management:latest . 2>&1 | tail -5
if [ $? -ne 0 ]; then
    echo "❌ ERROR: Image build failed."
    exit 1
fi
echo "  ✅ Image built: aidilam-management:latest"
echo ""

# --- Step 5: Create replacement container (temporary name) ---
echo "🚀 Step 5: Creating replacement container (temporary)..."

# Remove temp container if it exists from a previous attempt
docker rm -f "${TEMP_CONTAINER_NAME}" 2>/dev/null || true

docker create \
    --name "${TEMP_CONTAINER_NAME}" \
    --hostname aidilam-management \
    --network host \
    --restart unless-stopped \
    --workdir /opt/aidilam \
    --volume /var/run/docker.sock:/var/run/docker.sock \
    --volume /opt:/opt \
    --env DOCKER_HOST=unix:///var/run/docker.sock \
    --env TERM=xterm-256color \
    --label com.aidilam.role=management \
    --label com.aidilam.owner=operations \
    --label "com.aidilam.application-service=false" \
    --security-opt no-new-privileges:true \
    --interactive \
    --tty \
    aidilam-management:latest \
    bash

echo "  ✅ Container created: ${TEMP_CONTAINER_NAME}"
echo ""

# --- Step 6: Validate basic startup ---
echo "✅ Step 6: Validating basic startup..."
docker start "${TEMP_CONTAINER_NAME}"
sleep 3

# Check it's running
if ! docker ps -q --filter "name=^${TEMP_CONTAINER_NAME}$" | grep -q .; then
    echo "❌ ERROR: Replacement container failed to start."
    echo "  Logs:"
    docker logs "${TEMP_CONTAINER_NAME}" 2>&1 | tail -20
    docker rm -f "${TEMP_CONTAINER_NAME}" 2>/dev/null
    exit 1
fi

# Quick validation inside
docker exec "${TEMP_CONTAINER_NAME}" bash -c "
    echo '  Docker CLI:' && docker --version && \
    echo '  Docker Compose:' && docker compose version && \
    echo '  Docker daemon:' && docker info >/dev/null && echo '  reachable' && \
    echo '  Git:' && git --version && \
    echo '  /opt/aidilam:' && ls /opt/aidilam/.kiro/steering >/dev/null && echo '  accessible' && \
    echo '  Kiro:' && test -f /root/.local/bin/kiro-cli && echo '  binary exists'
" 2>&1

echo "  ✅ Basic validation passed"
echo ""

# --- Step 7: Copy SSH keys into replacement ---
echo "🔑 Step 7: Restoring SSH keys..."
docker exec "${TEMP_CONTAINER_NAME}" mkdir -p /root/.ssh
docker cp "${SSH_BACKUP}/config" "${TEMP_CONTAINER_NAME}:/root/.ssh/config"
docker cp "${SSH_BACKUP}/underspan_github_ed25519" "${TEMP_CONTAINER_NAME}:/root/.ssh/underspan_github_ed25519"
docker cp "${SSH_BACKUP}/underspan_github_ed25519.pub" "${TEMP_CONTAINER_NAME}:/root/.ssh/underspan_github_ed25519.pub"
docker cp "${SSH_BACKUP}/known_hosts" "${TEMP_CONTAINER_NAME}:/root/.ssh/known_hosts"
docker exec "${TEMP_CONTAINER_NAME}" chmod 700 /root/.ssh
docker exec "${TEMP_CONTAINER_NAME}" chmod 600 /root/.ssh/config /root/.ssh/underspan_github_ed25519 /root/.ssh/known_hosts
echo "  ✅ SSH keys restored"
echo ""

# --- Step 8: Stop temp, stop old, rename, start final ---
echo "⏹️  Step 8: Performing cutover..."
docker stop "${TEMP_CONTAINER_NAME}"
echo "  Stopped temp container"

docker stop "${CURRENT_CONTAINER_ID}" 2>/dev/null || true
echo "  Stopped old container (${CURRENT_NAME})"

# Rename old container for rollback
docker rename "${CURRENT_NAME}" "${ROLLBACK_NAME}" 2>/dev/null || \
    docker rename "${CURRENT_CONTAINER_ID}" "${ROLLBACK_NAME}" 2>/dev/null || true
echo "  Renamed old → ${ROLLBACK_NAME}"

# Rename new container to final name
docker rename "${TEMP_CONTAINER_NAME}" "${NEW_CONTAINER_NAME}"
echo "  Renamed temp → ${NEW_CONTAINER_NAME}"

# Start final
docker start "${NEW_CONTAINER_NAME}"
sleep 3
echo "  Started ${NEW_CONTAINER_NAME}"
echo ""

# --- Step 9: Final validation ---
echo "✅ Step 9: Final validation..."
if docker ps -q --filter "name=^${NEW_CONTAINER_NAME}$" | grep -q .; then
    echo "  ✅ Container running"
    docker exec "${NEW_CONTAINER_NAME}" bash -c "
        echo '  OS: ' && cat /etc/os-release | grep PRETTY_NAME
        echo '  Docker: ' && docker --version
        echo '  Compose: ' && docker compose version
        echo '  Git: ' && git --version
        echo '  SSH: ' && ssh -V 2>&1
        echo '  Kiro: ' && /root/.local/bin/kiro-cli --version 2>&1 || echo 'needs reinstall'
        echo '  /opt/aidilam: ' && test -d /opt/aidilam/.kiro && echo 'accessible'
    " 2>&1
else
    echo "❌ CUTOVER FAILED — Container not running!"
    echo "  Executing rollback..."
    docker stop "${NEW_CONTAINER_NAME}" 2>/dev/null || true
    docker rename "${NEW_CONTAINER_NAME}" "aidilam-management-failed-$(date +%Y%m%d-%H%M)" 2>/dev/null || true
    docker rename "${ROLLBACK_NAME}" "${CURRENT_NAME}" 2>/dev/null || true
    docker start "${CURRENT_NAME}" 2>/dev/null || docker start "${CURRENT_CONTAINER_ID}"
    echo "  Rollback complete. Old container restored."
    exit 1
fi
echo ""

# --- Step 10: Verify Underspan unchanged ---
echo "🛡️  Step 10: Verifying Underspan unchanged..."
UNDERSPAN_AFTER=$(docker ps -a --filter "name=underspan" --format '{{.ID}}:{{.Names}}:{{.Status}}:{{.Image}}' 2>/dev/null || true)
echo "${UNDERSPAN_AFTER}" > "${EVIDENCE_DIR}/underspan-after-cutover.txt"

if [ "${UNDERSPAN_STATE}" = "${UNDERSPAN_AFTER}" ]; then
    echo "  ✅ Underspan unchanged"
else
    echo "  ⚠️  WARNING: Underspan state may have changed!"
    echo "    Before: ${UNDERSPAN_STATE}"
    echo "    After:  ${UNDERSPAN_AFTER}"
fi
echo ""

# --- Summary ---
echo "=============================================="
echo "CUTOVER COMPLETE"
echo "=============================================="
echo ""
echo "New container: ${NEW_CONTAINER_NAME}"
echo "Rollback container: ${ROLLBACK_NAME} (stopped)"
echo "Evidence: ${EVIDENCE_DIR}/"
echo ""
echo "Next steps:"
echo "  1. Run validation: docker exec -it ${NEW_CONTAINER_NAME} bash /opt/aidilam/ops/management-container/validate-management-container.sh"
echo "  2. Verify Kiro: docker exec -it ${NEW_CONTAINER_NAME} kiro-cli --version"
echo "  3. If issues: bash /opt/aidilam/ops/management-container/rollback-management-container.sh"
echo "=============================================="
