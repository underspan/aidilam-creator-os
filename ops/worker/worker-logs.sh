#!/usr/bin/env bash
set -euo pipefail
LINES="${1:-50}"
ssh -F /opt/aidilam/.management-state/ssh/config aidilam-host \
  "docker logs aidilam-worker --tail $LINES"
