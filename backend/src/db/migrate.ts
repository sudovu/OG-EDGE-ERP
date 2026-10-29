import fs from "node:fs";
import path from "node:path";
import { getDb, closeDb } from "./database";
import { logger } from "../core/logger";

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

function ensureMigrationsTable(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export function runMigrations(): void {
  const db = getDb();
  ensureMigrationsTable(db);
  const applied = new Set(
    db.prepare("SELECT filename FROM schema_migrations").all().map((r: any) => r.filename),
  );
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (filename) VALUES (?)").run(file);
    });
    tx();
    logger.info({ file }, "migration applied");
  }
  logger.info("migrations complete");
}

if (require.main === module) {
  runMigrations();
  closeDb();
}

