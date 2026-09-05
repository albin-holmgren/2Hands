#!/usr/bin/env bash
# Fly volumes cannot attach to two machines. API and Graphile worker share
# DATA_DIR by running on the same Machine. Object storage is not wired yet.
set -euo pipefail
cd /app
pnpm --filter @rakazo/db migrate

worker_loop() {
  while true; do
    echo "starting graphile worker" >&2
    pnpm --filter @rakazo/worker start || true
    echo "worker exited; retrying in 2s" >&2
    sleep 2
  done
}
worker_loop &
exec pnpm --filter @rakazo/api start
