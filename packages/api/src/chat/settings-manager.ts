import { eq } from "drizzle-orm";
import { db, schema } from "../db";

export function getSetting<T = unknown>(key: string): T | null {
  const row = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .get();
  if (!row) return null;
  return JSON.parse(row.value) as T;
}

export function setSetting(key: string, value: unknown): void {
  const existing = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .get();

  if (existing) {
    db.update(schema.settings)
      .set({ value: JSON.stringify(value) })
      .where(eq(schema.settings.key, key))
      .run();
  } else {
    db.insert(schema.settings)
      .values({ key, value: JSON.stringify(value) })
      .run();
  }
}

export function deleteSetting(key: string): void {
  db.delete(schema.settings).where(eq(schema.settings.key, key)).run();
}

export function getAllSettings(): Record<string, unknown> {
  const rows = db.select().from(schema.settings).all();
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    result[row.key] = JSON.parse(row.value);
  }
  return result;
}
