#!/usr/bin/env bash
# One-time setup on a fresh Ubuntu droplet. Run from the repo folder on the droplet:
#   bash deploy/setup-droplet.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

# Firewall: SSH + web only.
if command -v ufw >/dev/null; then
  ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env. Edit it (nano .env): set DOMAIN, APP_PASSWORD, and optionally GITHUB_TOKEN/GITHUB_OWNER."
  echo "Then run this script again."
  exit 0
fi

docker compose up -d --build
docker compose ps
echo "Done. Open https://$(grep '^DOMAIN=' .env | cut -d= -f2)"
