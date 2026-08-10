#!/usr/bin/env bash
# Create a new token for a service account via the AIĐiLàm internal API.
# Usage: ./create-service-token.sh <API_URL> <ADMIN_TOKEN> <SERVICE_ACCOUNT_ID> <TOKEN_NAME> [EXPIRES_IN_DAYS]
#
# ⚠️  The token value is shown ONCE and cannot be retrieved again.
# ⚠️  Store it securely immediately.

set -euo pipefail

API_URL="${1:?Usage: $0 <API_URL> <ADMIN_TOKEN> <SERVICE_ACCOUNT_ID> <TOKEN_NAME> [EXPIRES_IN_DAYS]}"
ADMIN_TOKEN="${2:?Missing admin token}"
ACCOUNT_ID="${3:?Missing service account ID}"
TOKEN_NAME="${4:?Missing token name}"
EXPIRES_IN_DAYS="${5:-}"

echo "Creating token for service account: ${ACCOUNT_ID}"
echo "Token name: ${TOKEN_NAME}"
if [ -n "$EXPIRES_IN_DAYS" ]; then
  echo "Expires in: ${EXPIRES_IN_DAYS} days"
fi
echo "---"
echo "⚠️  Confirm token creation? This action cannot be undone."
read -r -p "Type 'CREATE' to proceed: " CONFIRM

if [ "$CONFIRM" != "CREATE" ]; then
  echo "Aborted."
  exit 1
fi

PAYLOAD="{\"name\": \"${TOKEN_NAME}\""
if [ -n "$EXPIRES_IN_DAYS" ]; then
  PAYLOAD="${PAYLOAD}, \"expiresInDays\": ${EXPIRES_IN_DAYS}"
fi
PAYLOAD="${PAYLOAD}}"

RESPONSE=$(curl -sS -w "\n%{http_code}" \
  -X POST "${API_URL}/api/v1/security/service-accounts/${ACCOUNT_ID}/tokens" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 201 ]; then
  echo ""
  echo "✓ Token created successfully"
  echo ""
  echo "=========================================="
  echo "⚠️  SAVE THIS TOKEN NOW - IT WILL NOT BE SHOWN AGAIN"
  echo "=========================================="
  echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"Token: {d['data']['token']}\")" 2>/dev/null || echo "$BODY"
  echo "=========================================="
else
  echo "✗ Failed to create token (HTTP ${HTTP_CODE})"
  echo "$BODY"
  exit 1
fi
