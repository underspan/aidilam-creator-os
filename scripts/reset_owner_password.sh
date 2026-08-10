#!/bin/bash
# ==============================================================================
# AIĐiLàm Admin: Reset Owner Password
# ==============================================================================
# Resets the password for owner@aidilam.dev in the DEV database.
#
# Usage (on host):
#   bash /opt/aidilam/scripts/reset_owner_password.sh
#
# Usage (inside workspace container):
#   bash /opt/aidilam/scripts/reset_owner_password.sh
#
# Architecture:
#   - Host requires ONLY Docker (no Node.js, no npm, no Python)
#   - All hashing and DB operations execute inside the aidilam-app container
#   - Workspace container uses SSH to reach Docker on the host
#
# Security:
#   - Password entered via hidden interactive prompt (no echo)
#   - Never written to files, logs, or shell history
#   - Hashed with scrypt (N=16384, r=8, p=1, keylen=64) inside container
#   - All prior sessions revoked after reset
# ==============================================================================

set -euo pipefail

REPO_DIR="/opt/aidilam"
SECRETS_DIR="${REPO_DIR}/secrets"
SSH_CONFIG="${REPO_DIR}/.management-state/ssh/config"
EMAIL="owner@aidilam.dev"
APP_CONTAINER="aidilam-app"
DB_CONTAINER="aidilam-postgres"
DB_USER="aidilam_migrator"
DB_NAME="aidilam"

# ==============================================================================
# Detect execution context and establish Docker access
# ==============================================================================

DOCKER_CMD=""

if docker ps &>/dev/null 2>&1; then
  # Running on host (or container with Docker socket — not expected)
  DOCKER_CMD="docker"
elif [ -f "$SSH_CONFIG" ]; then
  # Running inside workspace container — use SSH to host
  if ssh -o BatchMode=yes -o ConnectTimeout=5 -F "$SSH_CONFIG" aidilam-host "docker ps" &>/dev/null 2>&1; then
    DOCKER_CMD="ssh -o BatchMode=yes -o ConnectTimeout=10 -F ${SSH_CONFIG} aidilam-host docker"
  else
    echo "ERROR: Cannot reach Docker on host via SSH." >&2
    exit 1
  fi
else
  echo "ERROR: No Docker access. Run this script on the host or inside the AIĐiLàm workspace." >&2
  exit 1
fi

# ==============================================================================
# Preflight: verify containers are running
# ==============================================================================

if ! $DOCKER_CMD ps --filter "name=${APP_CONTAINER}" --format '{{.Names}}' 2>/dev/null | grep -q "${APP_CONTAINER}"; then
  echo "ERROR: Container ${APP_CONTAINER} is not running." >&2
  exit 1
fi

if ! $DOCKER_CMD ps --filter "name=${DB_CONTAINER}" --format '{{.Names}}' 2>/dev/null | grep -q "${DB_CONTAINER}"; then
  echo "ERROR: Container ${DB_CONTAINER} is not running." >&2
  exit 1
fi

# ==============================================================================
# Interactive password input
# ==============================================================================

echo "AIĐiLàm Admin: Reset password for ${EMAIL}"
echo ""

read -s -p "Enter new password: " PW1
echo ""
read -s -p "Confirm password:  " PW2
echo ""

if [ -z "$PW1" ]; then
  echo "ERROR: Password cannot be empty." >&2
  exit 1
fi

if [ "$PW1" != "$PW2" ]; then
  echo "ERROR: Passwords do not match." >&2
  exit 1
fi

if [ ${#PW1} -lt 8 ]; then
  echo "ERROR: Password must be at least 8 characters." >&2
  exit 1
fi

# ==============================================================================
# Hash password INSIDE the app container (Node.js lives there, not on host)
# ==============================================================================

HASH=$($DOCKER_CMD exec "${APP_CONTAINER}" node -e "
const { randomBytes, scryptSync } = require('crypto');
const password = process.argv[1];
const salt = randomBytes(16).toString('hex');
const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
process.stdout.write('scrypt:' + salt + ':' + hash.toString('hex'));
" "$PW1" 2>/dev/null)

# Clear password from shell variables immediately
PW1=""
PW2=""

if [ -z "$HASH" ] || [[ ! "$HASH" == scrypt:* ]]; then
  echo "ERROR: Password hashing failed." >&2
  exit 1
fi

# ==============================================================================
# Update database and revoke sessions
# ==============================================================================

DB_PASS=$(cat "${SECRETS_DIR}/postgres_migrator_password" 2>/dev/null || true)

if [ -z "$DB_PASS" ]; then
  # Try reading from inside the app container (host execution without secrets mount)
  DB_PASS=$($DOCKER_CMD exec "${APP_CONTAINER}" cat /run/secrets/postgres_migrator_password 2>/dev/null || true)
fi

if [ -z "$DB_PASS" ]; then
  echo "ERROR: Cannot read database password." >&2
  exit 1
fi

RESULT=$($DOCKER_CMD exec -e PGPASSWORD="${DB_PASS}" "${DB_CONTAINER}" \
  psql -U "${DB_USER}" -d "${DB_NAME}" -t -c \
  "UPDATE aidilam_app.users SET password_hash = '${HASH}', password_changed_at = now() WHERE email = '${EMAIL}' RETURNING id;" 2>&1)

if ! echo "$RESULT" | grep -q "[0-9a-f]"; then
  echo "ERROR: Database update failed. User may not exist." >&2
  exit 1
fi

# Revoke all existing sessions
$DOCKER_CMD exec -e PGPASSWORD="${DB_PASS}" "${DB_CONTAINER}" \
  psql -U "${DB_USER}" -d "${DB_NAME}" -t -c \
  "UPDATE aidilam_app.browser_sessions SET revoked_at = now() WHERE user_id = (SELECT id FROM aidilam_app.users WHERE email = '${EMAIL}') AND revoked_at IS NULL;" >/dev/null 2>&1 || true

# Clear sensitive variables
HASH=""
DB_PASS=""

echo ""
echo "Password updated successfully."
