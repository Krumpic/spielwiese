import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { parseBackup } from "../domain/backup.ts";
import type { ItemData } from "../domain/item.ts";
import {
  addManualEntry,
  changeQuantity,
  completePurchase,
  createItem,
  deleteItem,
  exportBackup,
  markBackupDone,
  putItemOnShoppingList,
  restoreBackup,
  toggleEntry,
  updateItem,
} from "./repository.ts";
import { db } from "./schema.ts";

const milk: ItemData = {
  name: "Milch",
  location: "fridge",
  section: "dairy",
  mode: "exact",
  quantity: 1,
  unit: "l",
  level: "full",
  minQuantity: 2,
  targetQuantity: 3,
  minLevel: null,
};

const onlyItem = async () => {
  const items = await db.items.toArray();
  expect(items).toHaveLength(1);
  const [item] = items;
  if (!item) throw new Error("kein Artikel");
  return item;
};

beforeEach(async () => {
  await db.items.clear();
  await db.shopping.clear();
  await db.meta.clear();
});

describe("Artikel und automatische Einkaufsliste", () => {
  it("neuer Artikel unter Mindestmenge landet mit Fehlmenge auf der Liste", async () => {
    await createItem(milk);
    const entries = await db.shopping.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ name: "Milch", quantity: 2, unit: "l", source: "auto" });
  });

  it("ungültige Eingaben werden abgelehnt und nichts gespeichert", async () => {
    await expect(createItem({ ...milk, name: "" })).rejects.toThrow();
    await expect(createItem({ ...milk, quantity: -1 })).rejects.toThrow();
    await expect(createItem({ ...milk, extra: "x" })).rejects.toThrow();
    expect(await db.items.count()).toBe(0);
  });

  it("+ bis über die Mindestmenge entfernt den automatischen Eintrag wieder", async () => {
    await createItem(milk);
    const item = await onlyItem();
    await changeQuantity(item.id, 1); // 1 → 1,5 l
    await changeQuantity(item.id, 1); // 1,5 → 2 l = Mindestmenge
    expect(await db.shopping.count()).toBe(0);
  });

  it("Namensänderung wird auf der Liste übernommen", async () => {
    await createItem(milk);
    const item = await onlyItem();
    await updateItem(item.id, { ...milk, name: "Hafermilch" });
    expect((await db.shopping.toArray())[0]?.name).toBe("Hafermilch");
  });

  it("Löschen eines Artikels entfernt auch seine Listeneinträge", async () => {
    await createItem(milk);
    await deleteItem((await onlyItem()).id);
    expect(await db.shopping.count()).toBe(0);
  });

  it("manuell auf die Liste setzen legt keine Duplikate an", async () => {
    await createItem({ ...milk, quantity: 5 });
    const item = await onlyItem();
    await putItemOnShoppingList(item.id);
    await putItemOnShoppingList(item.id);
    expect(await db.shopping.count()).toBe(1);
  });

  it("freier Eintrag wird mit gleichnamigem Artikel verknüpft (Groß/Klein egal)", async () => {
    await createItem({ ...milk, quantity: 5 });
    await addManualEntry({ name: "milch", section: "other" });
    const [entry] = await db.shopping.toArray();
    expect(entry?.itemId).toBe((await onlyItem()).id);
    expect(entry?.section).toBe("dairy");
  });
});

describe("Einkauf abschließen", () => {
  it("abgehakte Einträge wandern in den Vorrat, nicht abgehakte bleiben", async () => {
    await createItem(milk);
    await addManualEntry({ name: "Brot", section: "bakery" });
    const milkEntry = (await db.shopping.toArray()).find((e) => e.name === "Milch");
    if (!milkEntry) throw new Error("Eintrag fehlt");
    await toggleEntry(milkEntry.id);

    expect(await completePurchase()).toBe(1);
    expect((await onlyItem()).quantity).toBe(3);
    expect((await db.shopping.toArray()).map((e) => e.name)).toEqual(["Brot"]);
  });
});

describe("Backup", () => {
  it("Export → Import stellt exakt denselben Stand wieder her", async () => {
    await createItem(milk);
    await addManualEntry({ name: "Brot", section: "bakery" });
    const before = { items: await db.items.toArray(), shopping: await db.shopping.toArray() };

    const json = JSON.stringify(await exportBackup());
    await db.items.clear();
    await db.shopping.clear();

    const parsed = parseBackup(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await restoreBackup(parsed.backup);

    expect(await db.items.toArray()).toEqual(before.items);
    expect(await db.shopping.toArray()).toEqual(before.shopping);
  });

  it("Import ersetzt vorhandene Daten vollständig", async () => {
    await createItem(milk);
    const json = JSON.stringify(await exportBackup());
    await createItem({ ...milk, name: "Butter", minQuantity: null, targetQuantity: null });

    const parsed = parseBackup(json);
    if (!parsed.ok) throw new Error(parsed.error);
    await restoreBackup(parsed.backup);
    expect((await db.items.toArray()).map((i) => i.name)).toEqual(["Milch"]);
  });

  it("schlägt der Import fehl, bleiben die alten Daten erhalten", async () => {
    await createItem(milk);
    const parsed = parseBackup(JSON.stringify(await exportBackup()));
    if (!parsed.ok) throw new Error(parsed.error);
    const item = parsed.backup.items[0];
    if (!item) throw new Error("kein Artikel");
    // Doppelte ID provoziert einen Fehler mitten im Import
    const broken = { ...parsed.backup, items: [item, { ...item }] };

    await expect(restoreBackup(broken)).rejects.toThrow();
    expect((await onlyItem()).name).toBe("Milch");
  });

  it("merkt sich den Zeitpunkt des letzten Backups", async () => {
    await markBackupDone();
    expect((await db.meta.get("lastBackupAt"))?.value).toBeGreaterThan(0);
  });
});
