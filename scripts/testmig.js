const D = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const dir = path.join(process.env.TEMP, "freshdb");
if (!fs.existsSync(dir)) fs.mkdirSync(dir);
const dbPath = path.join(dir, "test.db");
const d = new D(dbPath);
d.exec(fs.readFileSync(path.join("src", "db", "migrations", "001_initial.sql"), "utf8"));
const cols = d.prepare("PRAGMA table_info(accounts)").all().map((c) => c.name);
console.log("accounts columns after 001:", JSON.stringify(cols));
try {
  d.exec(fs.readFileSync(path.join("src", "db", "migrations", "006_multi_currency.sql"), "utf8"));
  console.log("006 applied OK");
} catch (e) {
  console.log("006 ERROR:", e.message);
}
const cols2 = d.prepare("PRAGMA table_info(accounts)").all().map((c) => c.name);
console.log("accounts columns after 006:", JSON.stringify(cols2));
d.close();
fs.rmSync(dbPath, { force: true, recursive: true });
fs.rmSync(dir, { force: true, recursive: true });
