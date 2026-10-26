#!/usr/bin/env bash
# Restauration du Studio depuis un dossier créé par scripts/backup.sh.
# Usage : scripts/restore.sh <dossier> --confirmer
# ATTENTION : remplace la base et les médias actuels. Fais d'abord une sauvegarde de l'état présent.
# Variables pour un essai à blanc : RESTORE_DB (défaut studio), MEDIA_VOLUME (défaut <projet>_media).
set -euo pipefail
cd "$(dirname "$0")/.."
export MSYS_NO_PATHCONV=1

SRC="${1:?Indique le dossier de sauvegarde}"
[ "${2:-}" = "--confirmer" ] || { echo "Ajoute --confirmer : la base et les médias actuels seront remplacés."; exit 1; }
[ -f "$SRC/studio.dump" ] && [ -f "$SRC/media.tar.gz" ] || { echo "Sauvegarde incomplète dans $SRC"; exit 1; }
HOST_DIR="$(cd "$SRC" && (pwd -W 2>/dev/null || pwd))"
PROJECT="$(docker compose config --format json | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(0)).name)")"
DB="${RESTORE_DB:-studio}"
VOLUME="${MEDIA_VOLUME:-${PROJECT}_media}"

if [ "$DB" = "studio" ]; then
  echo "Arrêt de l'application (la base reste démarrée)…"
  docker compose stop web worker mcp
fi

echo "Base de données → $DB…"
docker compose exec -T postgres psql -U studio -d postgres -v ON_ERROR_STOP=1 -c "SELECT 1" >/dev/null
docker compose exec -T postgres sh -c "psql -U studio -d postgres -tc \"SELECT 1 FROM pg_database WHERE datname='$DB'\" | grep -q 1 || createdb -U studio $DB"
docker compose exec -T postgres pg_restore -U studio -d "$DB" --clean --if-exists --no-owner < "$SRC/studio.dump"

echo "Médias → volume $VOLUME…"
docker run --rm -v "$VOLUME:/data/media" -v "$HOST_DIR:/backup:ro" alpine:3.22 \
  sh -c "find /data/media -mindepth 1 -delete && tar xzf /backup/media.tar.gz -C /data/media && chown -R 1000:1000 /data/media"

if [ "$DB" = "studio" ]; then
  echo "Redémarrage…"
  docker compose up -d --wait
fi
echo "Restauration terminée."
