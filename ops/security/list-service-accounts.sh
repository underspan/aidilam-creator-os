#!/usr/bin/env bash
# List service accounts via the AIĐiLàm internal API.
# Usage: ./list-service-accounts.sh <API_URL> <ADMIN_TOKEN>

set -euo pipefail

API_URL="${1:?Usage: $0 <API_URL> <ADMIN_TOKEN>}"
ADMIN_TOKEN="${2:?Missing admin token}"

RESPONSE=$(curl -sS -w "\n%{http_code}" \
  -X GET "${API_URL}/api/v1/security/service-accounts" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
else
  echo "✗ Failed to list service accounts (HTTP ${HTTP_CODE})"
  echo "$BODY"
  exit 1
fi
