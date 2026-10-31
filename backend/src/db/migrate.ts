import fs from "node:fs";
import path from "node:path";
import { getDb, closeDb, type DbAdapter } from "./database";
import { config } from "../config";
import { logger } from "../core/logger";

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

/** Transform SQLite-specific SQL to PostgreSQL-compatible SQL */
function toPostgres(sql: string): string {
  return sql
    .replace(/AUTOINCREMENT/g, "")
    .replace(/datetime\('now'\)/g, "NOW()")
    .replace(/INTEGER PRIMARY KEY/g, "SERIAL PRIMARY KEY");
}

function toSqlite(sql: string): string {
  return sql;
}

function transformSql(db: DbAdapter, sql: string): string {
  return config.dbDriver === "postgres" ? toPostgres(sql) : toSqlite(sql);
}

async function ensureMigrationsTable(db: DbAdapter): Promise<void> {
  const nowSql = config.dbDriver === "postgres" ? "NOW()" : "datetime('now')";
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id ${config.dbDriver === "postgres" ? "SERIAL PRIMARY KEY" : "INTEGER PRIMARY KEY AUTOINCREMENT"},
      filename TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (${nowSql})
    );
  `);
}

export async function runMigrations(): Promise<void> {
  const db = getDb();
  await ensureMigrationsTable(db);
  const appliedRows = await db.prepare("SELECT filename FROM schema_migrations").all();
  const applied = new Set(appliedRows.map((r: any) => r.filename));
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    let sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    sql = transformSql(db, sql);
    await db.transaction(async () => {
      await db.exec(sql);
      await db.prepare("INSERT INTO schema_migrations (filename) VALUES (?)").run([file]);
    });
    logger.info({ file }, "migration applied");
  }
  logger.info("migrations complete");
}

if (require.main === module) {
  runMigrations()
    .then(() => closeDb())
    .catch((e) => {
      logger.error({ err: e?.message }, "migration failed");
      process.exit(1);
    });
}
