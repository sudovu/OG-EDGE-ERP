/**
 * Database adapter layer supporting SQLite (dev) and PostgreSQL (production).
 *
 * Set DB_DRIVER=postgres and DATABASE_URL=postgres://user:pass@host:5432/db
 * to use PostgreSQL. Otherwise SQLite is used (file at DB_PATH).
 *
 * All methods are async (return Promises) so route files can uniformly await.
 * For PostgreSQL, transactions use AsyncLocalStorage so every db.prepare()
 * call inside a transaction() callback shares the same pg client.
 */

import { Pool, type PoolClient, type QueryResult } from "pg";
import Database from "better-sqlite3";
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config";
import { logger } from "../core/logger";

/** Normalize SQLite-style `?` placeholders to PostgreSQL `$1, $2, ...` */
function pgPlaceholders(sql: string): string {
  let idx = 1;
  return sql.replace(/\?/g, () => `$${idx++}`);
}

/** Replace SQLite datetime('now') with PostgreSQL NOW() */
function pgSql(sql: string): string {
  return sql.replace(/datetime\('now'\)/g, "NOW()");
}

export interface DbStatement {
  get(params?: unknown[]): Promise<unknown | undefined>;
  all(params?: unknown[]): Promise<unknown[]>;
  run(params?: unknown[]): Promise<{ changes: number; lastInsertRowid?: string | number | bigint }>;
}

export interface DbAdapter {
  prepare(sql: string): DbStatement;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
  pragma(sql: string): Promise<void>;
}

const als = new AsyncLocalStorage<{ client: PoolClient } | undefined>();

// =====================================================================
// SQLite implementation
// =====================================================================

class SQLiteAdapter implements DbAdapter {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    logger.info({ dbPath }, "sqlite database opened");
  }

  prepare(sql: string): DbStatement {
    const stmt = this.db.prepare(sql);
    return {
      get: async (params?: unknown[]) => Promise.resolve(stmt.get(params ?? [])),
      all: async (params?: unknown[]) => Promise.resolve(stmt.all(params ?? [])),
      run: async (params?: unknown[]) => {
        const info = stmt.run(params ?? []);
        return Promise.resolve({
          changes: info.changes,
          lastInsertRowid: info.lastInsertRowid,
        });
      },
    };
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    // SQLite transactions are synchronous; just run the fn directly.
    // Multi-statement atomicity is guaranteed on PostgreSQL via AsyncLocalStorage client sharing.
    return fn();
  }

  async close(): Promise<void> {
    this.db.close();
  }

  async pragma(sql: string): Promise<void> {
    this.db.pragma(sql);
  }
}

// =====================================================================
// PostgreSQL implementation
// =====================================================================

class PostgresAdapter implements DbAdapter {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
    logger.info({ connectionString }, "postgresql pool created");
  }

  private stmt(sql: string): string {
    return pgSql(pgPlaceholders(sql));
  }

  private async runQuery(sql: string, params: unknown[], useClient?: PoolClient): Promise<QueryResult> {
    const target = useClient ?? this.pool;
    return target.query(this.stmt(sql), params);
  }

  prepare(sql: string): DbStatement {
    const pgSql = this.stmt(sql);
    return {
      get: async (params?: unknown[]) => {
        const store = als.getStore();
        const res = await this.runQuery(pgSql, params ?? [], store?.client);
        return res.rows[0];
      },
      all: async (params?: unknown[]) => {
        const store = als.getStore();
        const res = await this.runQuery(pgSql, params ?? [], store?.client);
        return res.rows;
      },
      run: async (params?: unknown[]) => {
        const store = als.getStore();
        const res = await this.runQuery(pgSql, params ?? [], store?.client);
        return {
          changes: res.rowCount ?? 0,
          lastInsertRowid: res.rows[0]?.last_insert_rowid,
        };
      },
    };
  }

  async exec(sql: string): Promise<void> {
    const statements = sql.split(";").filter((s) => s.trim());
    for (const stmt of statements) {
      await this.pool.query(this.stmt(stmt));
    }
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await als.run({ client }, fn);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async pragma(sql: string): Promise<void> {
    // No-op for PostgreSQL
  }
}

// =====================================================================
// Factory
// =====================================================================

let adapter: DbAdapter | null = null;

export function getDb(): DbAdapter {
  if (adapter) return adapter;

  if (config.dbDriver === "postgres") {
    if (!config.databaseUrl) {
      throw new Error("DATABASE_URL must be set when DB_DRIVER=postgres");
    }
    adapter = new PostgresAdapter(config.databaseUrl);
  } else {
    adapter = new SQLiteAdapter(config.dbPath);
  }

  return adapter;
}

export async function closeDb(): Promise<void> {
  if (adapter) {
    await adapter.close();
    adapter = null;
  }
}

export type Db = DbAdapter;
export type Statement = DbStatement;