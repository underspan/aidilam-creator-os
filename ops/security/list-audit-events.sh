#!/usr/bin/env bash
# List audit events via the AIĐiLàm internal API.
# Usage: ./list-audit-events.sh <API_URL> <ADMIN_TOKEN> [PAGE] [PAGE_SIZE]

set -euo pipefail

API_URL="${1:?Usage: $0 <API_URL> <ADMIN_TOKEN> [PAGE] [PAGE_SIZE]}"
ADMIN_TOKEN="${2:?Missing admin token}"
PAGE="${3:-1}"
PAGE_SIZE="${4:-20}"

RESPONSE=$(curl -sS -w "\n%{http_code}" \
  -X GET "${API_URL}/api/v1/security/audit-events?page=${PAGE}&pageSize=${PAGE_SIZE}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
else
  echo "✗ Failed to list audit events (HTTP ${HTTP_CODE})"
  echo "$BODY"
  exit 1
fi
