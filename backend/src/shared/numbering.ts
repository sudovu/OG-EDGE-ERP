import { getDb } from "../db/database";
import { newId } from "./ids";

export async function nextNumber(orgId: string, entityType: string, prefix = "", padding = 6): Promise<string> {
  const db = getDb();
  let row: { id: string; next_number: number; prefix: string; padding: number } | undefined = (await db.prepare(
    "SELECT id, next_number, prefix, padding FROM numbering_sequences WHERE organization_id = ? AND entity_type = ?",
  ).get([orgId, entityType])) as { id: string; next_number: number; prefix: string; padding: number } | undefined;

  if (!row) {
    const id = newId();
    await db.prepare(
      "INSERT INTO numbering_sequences (id, organization_id, entity_type, prefix, next_number, padding) VALUES (?,?,?,?,?,?)",
    ).run([id, orgId, entityType, prefix, 2, padding]);
    row = { id, next_number: 1, prefix, padding };
  }
  const num = row.next_number;
  await db.prepare("UPDATE numbering_sequences SET next_number = next_number + 1 WHERE id = ?").run([row.id]);
  const padded = String(num).padStart(row.padding, "0");
  return `${row.prefix}${padded}`;
}
