#!/usr/bin/env bash
# Fly volumes cannot attach to two machines. API and Graphile worker share
# DATA_DIR by running on the same Machine. Object storage is not wired yet.
set -euo pipefail
cd /app
pnpm --filter @rakazo/db migrate

exec node infra/fly/supervise.mjs
