#!/usr/bin/env bash
# Sauvegarde du Studio : base PostgreSQL (pg_dump, format custom) + volume des médias.
# Usage : scripts/backup.sh [dossier]   (défaut : backups/AAAAMMJJ-HHMMSS)
# À lancer depuis Git Bash, WSL, macOS ou Linux, stack démarrée (docker compose up).
set -euo pipefail
cd "$(dirname "$0")/.."
export MSYS_NO_PATHCONV=1

DEST="${1:-backups/$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$DEST"
HOST_DIR="$(cd "$DEST" && (pwd -W 2>/dev/null || pwd))"
PROJECT="$(docker compose config --format json | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(0)).name)")"

echo "Base de données…"
docker compose exec -T postgres pg_dump -U studio -d studio --format=custom > "$DEST/studio.dump"

echo "Médias…"
docker run --rm -v "${PROJECT}_media:/data/media:ro" -v "$HOST_DIR:/backup" alpine:3.22 \
  tar czf /backup/media.tar.gz -C /data/media .

echo "Sauvegarde terminée : $DEST"
ls -l "$DEST"
echo "Rappel : conserve aussi ton fichier .env (dont TOKEN_ENCRYPTION_KEY) en lieu sûr, hors de ce dossier."
