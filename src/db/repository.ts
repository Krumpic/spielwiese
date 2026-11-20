import {
  ItemDataSchema,
  adjustQuantity,
  applyPurchase,
  cycleLevel,
  type Item,
} from "../domain/item.ts";
import {
  ManualEntrySchema,
  manualEntryForItem,
  planShoppingSync,
  type NewShoppingEntry,
} from "../domain/shopping.ts";
import { db } from "./schema.ts";

/**
 * Alle Schreibzugriffe auf die Datenbank.
 * - Jede Eingabe wird mit zod geprüft, bevor sie gespeichert wird.
 * - Vorrat und Einkaufsliste werden immer in einer Transaktion gemeinsam geändert,
 *   damit sie nie auseinanderlaufen.
 */

/** Gleicht die Einkaufsliste für einen Artikel ab (innerhalb einer Transaktion aufrufen). */
async function syncShopping(item: Item): Promise<void> {
  const entries = await db.shopping.where("itemId").equals(item.id).toArray();
  const action = planShoppingSync(item, entries, Date.now());
  switch (action.type) {
    case "create":
      await db.shopping.add(action.entry);
      break;
    case "update":
      await db.shopping.update(action.id, action.changes);
      break;
    case "delete":
      await db.shopping.delete(action.id);
      break;
    case "none":
      break;
  }
}

/** Liest einen Artikel, ändert ihn und gleicht die Liste ab. */
async function modifyItem(id: number, change: (item: Item) => Item): Promise<void> {
  await db.transaction("rw", db.items, db.shopping, async () => {
    const item = await db.items.get(id);
    if (!item) return;
    const updated = change(item);
    await db.items.put(updated);
    await syncShopping(updated);
  });
}

export async function createItem(input: unknown): Promise<void> {
  const data = ItemDataSchema.parse(input);
  const now = Date.now();
  await db.transaction("rw", db.items, db.shopping, async () => {
    const id = await db.items.add({ ...data, createdAt: now, updatedAt: now });
    const item = await db.items.get(id);
    if (item) await syncShopping(item);
  });
}

export async function updateItem(id: number, input: unknown): Promise<void> {
  const data = ItemDataSchema.parse(input);
  await modifyItem(id, (item) => ({ ...item, ...data, updatedAt: Date.now() }));
}

export async function deleteItem(id: number): Promise<void> {
  await db.transaction("rw", db.items, db.shopping, async () => {
    await db.items.delete(id);
    await db.shopping.where("itemId").equals(id).delete();
  });
}

export async function changeQuantity(id: number, direction: 1 | -1): Promise<void> {
  await modifyItem(id, (item) => adjustQuantity(item, direction, Date.now()));
}

export async function changeLevel(id: number): Promise<void> {
  await modifyItem(id, (item) => cycleLevel(item, Date.now()));
}

/** Setzt einen Vorrats-Artikel von Hand auf die Einkaufsliste (falls nicht schon drauf). */
export async function putItemOnShoppingList(id: number): Promise<void> {
  await db.transaction("rw", db.items, db.shopping, async () => {
    const item = await db.items.get(id);
    if (!item) return;
    const existing = await db.shopping.where("itemId").equals(id).count();
    if (existing > 0) return;
    await db.shopping.add(manualEntryForItem(item, Date.now()));
  });
}

/**
 * Freier Eintrag auf der Einkaufsliste.
 * Gibt es einen Vorrats-Artikel mit gleichem Namen, wird er verknüpft –
 * dann wandert der Einkauf beim Abschließen automatisch in den Vorrat.
 */
export async function addManualEntry(input: unknown): Promise<void> {
  const { name, section } = ManualEntrySchema.parse(input);
  await db.transaction("rw", db.items, db.shopping, async () => {
    const item = await db.items.where("name").equalsIgnoreCase(name).first();
    if (item) {
      const existing = await db.shopping.where("itemId").equals(item.id).count();
      if (existing === 0) await db.shopping.add(manualEntryForItem(item, Date.now()));
      return;
    }
    const entry: NewShoppingEntry = {
      itemId: null,
      name,
      section,
      quantity: null,
      unit: null,
      checked: false,
      source: "manual",
      createdAt: Date.now(),
    };
    await db.shopping.add(entry);
  });
}

export async function toggleEntry(id: number): Promise<void> {
  await db.transaction("rw", db.shopping, async () => {
    const entry = await db.shopping.get(id);
    if (entry) await db.shopping.update(id, { checked: !entry.checked });
  });
}

export async function removeEntry(id: number): Promise<void> {
  await db.shopping.delete(id);
}

/** Alle abgehakten Einträge in den Vorrat übernehmen und von der Liste entfernen. */
export async function completePurchase(): Promise<number> {
  return db.transaction("rw", db.items, db.shopping, async () => {
    const checked = await db.shopping.filter((e) => e.checked).toArray();
    for (const entry of checked) {
      await db.shopping.delete(entry.id);
      if (entry.itemId === null) continue;
      const item = await db.items.get(entry.itemId);
      if (!item) continue;
      const updated = applyPurchase(item, entry.quantity, Date.now());
      await db.items.put(updated);
      await syncShopping(updated);
    }
    return checked.length;
  });
}
