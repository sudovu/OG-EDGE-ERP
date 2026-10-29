#!/usr/bin/env bash
set -euo pipefail
DB_PATH="${DB_PATH:-/data/og-edge.db}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
mkdir -p "$BACKUP_DIR"
TS=$(date +%Y-%m-%d_%H-%M-%S)
OUT="$BACKUP_DIR/og-edge-$TS.db"
sqlite3 "$DB_PATH" ".backup $OUT"
echo "Backup written to $OUT"