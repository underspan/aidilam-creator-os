#!/usr/bin/env bash
set -euo pipefail
ssh -F /opt/aidilam/.management-state/ssh/config aidilam-host \
  'docker inspect aidilam-worker --format "Status: {{.State.Status}} Health: {{.State.Health.Status}} Restarts: {{.RestartCount}}"'
