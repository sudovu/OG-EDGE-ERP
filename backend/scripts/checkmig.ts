import { runMigrations } from "../src/db/migrate.js";
import { getDb } from "../src/db/database.js";
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.env.TEMP ?? "C:\\Users\\Sudo\\AppData\\Local\\Temp\\opencode", "ogedge-test");
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
const dbPath = path.join(dir, "fresh-" + Date.now() + ".db");
process.env.DB_PATH = dbPath;
process.env.JWT_SECRET = "x";
process.env.NODE_ENV = "test";
runMigrations();
const db = getDb();
const cols = db.prepare("PRAGMA table_info(webhook_deliveries)").all().map((c: any) => c.name);
console.log("columns:", cols);
console.log("migrations:", db.prepare("SELECT filename FROM schema_migrations").all().map((m: any) => m.filename));
db.close();
try { fs.unlinkSync(dbPath); } catch {}
