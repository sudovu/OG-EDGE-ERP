import { getDb } from "./database";
import { PERMISSIONS } from "../core/rbac/permissions";
import { newId } from "../shared/ids";

export async function seedPermissionsIfNeeded(): Promise<void> {
  const db = getDb();
  const count = (await db.prepare("SELECT COUNT(*) as c FROM permissions").get()) as { c: number };
  if (count.c >= PERMISSIONS.length) return;
  for (const code of PERMISSIONS) {
    await db.prepare("INSERT OR IGNORE INTO permissions (id, code, description) VALUES (?,?,?)").run([newId(), code, code]);
  }
}
