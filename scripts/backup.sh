#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DB_PATH="${DB_PATH:-$REPO_DIR/backend/data/og-edge.db}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_DIR/backups}"
mkdir -p "$BACKUP_DIR"
TS=$(date +%Y-%m-%d_%H-%M-%S)
OUT="$BACKUP_DIR/og-edge-$TS.db"
sqlite3 "$DB_PATH" ".backup $OUT"
echo "Backup written to $OUT"