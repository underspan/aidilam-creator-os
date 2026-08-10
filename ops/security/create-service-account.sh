#!/usr/bin/env bash
# Create a new service account via the AIĐiLàm internal API.
# Usage: ./create-service-account.sh <API_URL> <ADMIN_TOKEN> <CODE> <NAME> [DESCRIPTION]
#
# The admin token must have service_accounts.create permission.
# Never log or expose the admin token.

set -euo pipefail

API_URL="${1:?Usage: $0 <API_URL> <ADMIN_TOKEN> <CODE> <NAME> [DESCRIPTION]}"
ADMIN_TOKEN="${2:?Missing admin token}"
CODE="${3:?Missing service account code}"
NAME="${4:?Missing service account name}"
DESCRIPTION="${5:-}"

echo "Creating service account: ${CODE}"
echo "Name: ${NAME}"
echo "---"

RESPONSE=$(curl -sS -w "\n%{http_code}" \
  -X POST "${API_URL}/api/v1/security/service-accounts" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"code\": \"${CODE}\", \"name\": \"${NAME}\", \"description\": \"${DESCRIPTION}\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 201 ]; then
  echo "✓ Service account created successfully"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
else
  echo "✗ Failed to create service account (HTTP ${HTTP_CODE})"
  echo "$BODY"
  exit 1
fi
