import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
const dir = path.join(process.env.TEMP ?? "C:\\Users\\Sudo\\AppData\\Local\\Temp\\opencode", "ogedge-test");
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
const dbPath = path.join(dir, "manual-" + Date.now() + ".db");
const d = new Database(dbPath);
d.pragma("foreign_keys = ON");
d.exec(fs.readFileSync(path.join("src","db","migrations","001_initial.sql"), "utf8"));
try {
  d.exec(fs.readFileSync(path.join("src","db","migrations","005_webhook_retry.sql"), "utf8"));
  console.log("005 applied OK");
} catch (e: any) {
  console.log("005 ERROR:", e.message);
}
const cols = d.prepare("PRAGMA table_info(webhook_deliveries)").all().map((c: any) => c.name);
console.log("webhook_deliveries columns:", cols);
d.close();
fs.unlinkSync(dbPath);
