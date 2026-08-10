#!/usr/bin/env bash
# Revoke a service token via the AIĐiLàm internal API.
# Usage: ./revoke-service-token.sh <API_URL> <ADMIN_TOKEN> <SERVICE_ACCOUNT_ID> <TOKEN_ID>
#
# This action is irreversible. The token will be immediately invalidated.

set -euo pipefail

API_URL="${1:?Usage: $0 <API_URL> <ADMIN_TOKEN> <SERVICE_ACCOUNT_ID> <TOKEN_ID>}"
ADMIN_TOKEN="${2:?Missing admin token}"
ACCOUNT_ID="${3:?Missing service account ID}"
TOKEN_ID="${4:?Missing token ID}"

echo "Revoking token: ${TOKEN_ID}"
echo "Service account: ${ACCOUNT_ID}"
echo "---"
echo "⚠️  This action is IRREVERSIBLE. The token will be immediately invalidated."
read -r -p "Type 'REVOKE' to proceed: " CONFIRM

if [ "$CONFIRM" != "REVOKE" ]; then
  echo "Aborted."
  exit 1
fi

RESPONSE=$(curl -sS -w "\n%{http_code}" \
  -X POST "${API_URL}/api/v1/security/service-accounts/${ACCOUNT_ID}/tokens/${TOKEN_ID}/revoke" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
  echo "✓ Token revoked successfully"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
else
  echo "✗ Failed to revoke token (HTTP ${HTTP_CODE})"
  echo "$BODY"
  exit 1
fi
