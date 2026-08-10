#!/usr/bin/env bash
set -euo pipefail
echo 'Stopping aidilam-worker...'
ssh -F /opt/aidilam/.management-state/ssh/config aidilam-host \
  'docker compose --project-name aidilam --file /opt/aidilam/ops/compose/compose.yaml stop worker'
echo 'Worker stopped.'
