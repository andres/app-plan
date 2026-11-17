#!/usr/bin/env bash
# Pull the latest code and restart. Run on the droplet: bash deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
docker compose ps
