import { getDb } from "./database";
import { PERMISSIONS } from "../core/rbac/permissions";
import { newId } from "../shared/ids";

export function seedPermissionsIfNeeded() {
  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) as c FROM permissions").get() as { c: number }).c;
  if (count >= PERMISSIONS.length) return;
  for (const code of PERMISSIONS) {
    db.prepare("INSERT OR IGNORE INTO permissions (id, code, description) VALUES (?,?,?)").run(newId(), code, code);
  }
}

