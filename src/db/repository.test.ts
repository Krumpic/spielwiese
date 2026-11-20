import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { parseBackup } from "../domain/backup.ts";
import type { ItemData } from "../domain/item.ts";
import {
  addManualEntry,
  addMissingIngredientsToShoppingList,
  changeQuantity,
  completePurchase,
  cookRecipe,
  countRecipesUsingItem,
  createItem,
  createRecipe,
  deleteItem,
  loadAppearance,
  putItemsOnShoppingList,
  saveColorMode,
  saveTheme,
  undoCooking,
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
  expiresOn: null,
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
  await db.recipes.clear();
});

/** Legt einen Artikel an und gibt ihn zurück */
const addItem = async (data: Partial<ItemData>) => {
  await createItem({ ...milk, minQuantity: null, targetQuantity: null, ...data });
  const item = await db.items
    .where("name")
    .equals(data.name ?? milk.name)
    .first();
  if (!item) throw new Error("Artikel fehlt");
  return item;
};

describe("Design-Einstellungen", () => {
  it("speichert Farbe und Modus", async () => {
    await saveTheme("berry");
    await saveColorMode("dark");
    expect(await loadAppearance()).toEqual({ theme: "berry", colorMode: "dark" });
  });

  it("lehnt unbekannte Werte ab", async () => {
    await expect(saveTheme("neon")).rejects.toThrow();
    await expect(saveColorMode("bunt")).rejects.toThrow();
  });
});

describe("Rezepte", () => {
  it("Zutaten müssen im Vorrat existieren", async () => {
    await expect(
      createRecipe({
        name: "X",
        servings: 1,
        ingredients: [{ itemId: 999, quantity: 1, unit: "l", basic: false }],
        steps: [],
      }),
    ).rejects.toThrow();
    expect(await db.recipes.count()).toBe(0);
  });

  it("fehlende Zutaten: nur die Fehlmenge, in der Einheit des Vorrats", async () => {
    const mince = await addItem({
      name: "Faschiertes",
      unit: "kg",
      quantity: 0.2,
      section: "meat",
    });
    const pasta = await addItem({ name: "Nudeln", unit: "g", quantity: 1000, section: "staples" });
    const id = await createRecipe({
      name: "Bolognese",
      servings: 4,
      ingredients: [
        { itemId: mince.id, quantity: 500, unit: "g", basic: false },
        { itemId: pasta.id, quantity: 500, unit: "g", basic: false },
      ],
      steps: ["Kochen"],
    });

    expect(await addMissingIngredientsToShoppingList(id, 4)).toBe(1);
    const entries = await db.shopping.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ itemId: mince.id, quantity: 0.3, unit: "kg" });
  });

  it("erhöht einen bestehenden automatischen Eintrag statt ihn zu verdoppeln", async () => {
    // Mindestmenge 2 l, Soll 3 l, 1 l da → automatischer Eintrag über 2 l
    const item = await addItem({ quantity: 1, minQuantity: 2, targetQuantity: 3 });
    const id = await createRecipe({
      name: "Pudding",
      servings: 1,
      ingredients: [{ itemId: item.id, quantity: 4, unit: "l", basic: false }],
      steps: [],
    });
    await addMissingIngredientsToShoppingList(id, 1);
    const entries = await db.shopping.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ quantity: 3, source: "manual" });
  });

  it("Kochen zieht ab, fragt bei Leerem nach und lässt sich rückgängig machen", async () => {
    const eggs = await addItem({ name: "Eier", unit: "piece", quantity: 2 });
    const butter = await addItem({ name: "Butter", unit: "g", quantity: 250, minQuantity: 200 });
    const flour = await addItem({ name: "Mehl", mode: "level", level: "full" });
    const id = await createRecipe({
      name: "Kuchen",
      servings: 1,
      ingredients: [
        { itemId: eggs.id, quantity: 2, unit: "piece", basic: false },
        { itemId: butter.id, quantity: 100, unit: "g", basic: false },
        { itemId: flour.id, quantity: null, unit: null, basic: false },
      ],
      steps: [],
    });

    const result = await cookRecipe(id, 1, new Map([[flour.id, "low"]]));
    const after = new Map((await db.items.toArray()).map((i) => [i.name, i]));
    expect(after.get("Eier")?.quantity).toBe(0);
    expect(after.get("Butter")?.quantity).toBe(150);
    expect(after.get("Mehl")?.level).toBe("low");
    // Butter fällt unter die Mindestmenge → automatisch auf der Liste, daher keine Rückfrage
    // … und kommen mit der verbrauchten Menge (2 Eier) auf die Liste
    expect(result.emptied.map(({ item, quantity }) => [item.name, quantity])).toEqual([
      ["Eier", 2],
    ]);
    expect((await db.shopping.toArray()).map((e) => e.name)).toEqual(["Butter"]);

    await putItemsOnShoppingList(
      result.emptied.map(({ item, quantity }) => ({ itemId: item.id, quantity })),
    );
    expect(await db.shopping.count()).toBe(2);
    expect((await db.shopping.toArray()).find((e) => e.name === "Eier")?.quantity).toBe(2);

    await undoCooking(result.before);
    const undone = new Map((await db.items.toArray()).map((i) => [i.name, i]));
    expect(undone.get("Eier")?.quantity).toBe(2);
    expect(undone.get("Butter")?.quantity).toBe(250);
    expect(undone.get("Mehl")?.level).toBe("full");
    // Der automatische Butter-Eintrag verschwindet wieder, der bestätigte Eier-Eintrag bleibt
    expect((await db.shopping.toArray()).map((e) => e.name)).toEqual(["Eier"]);
  });

  it("Löschen eines Artikels entfernt ihn aus Rezepten", async () => {
    const eggs = await addItem({ name: "Eier", unit: "piece", quantity: 2 });
    const id = await createRecipe({
      name: "Spiegelei",
      servings: 1,
      ingredients: [{ itemId: eggs.id, quantity: 1, unit: "piece", basic: false }],
      steps: [],
    });
    expect(await countRecipesUsingItem(eggs.id)).toBe(1);
    await deleteItem(eggs.id);
    expect((await db.recipes.get(id))?.ingredients).toEqual([]);
  });
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
    const [stored] = await db.items.toArray();
    if (!stored) throw new Error("Artikel fehlt");
    await createRecipe({
      name: "Kakao",
      servings: 1,
      ingredients: [{ itemId: stored.id, quantity: 250, unit: "ml", basic: false }],
      steps: ["Milch erwärmen", "Kakao einrühren"],
    });
    const before = {
      items: await db.items.toArray(),
      shopping: await db.shopping.toArray(),
      recipes: await db.recipes.toArray(),
    };

    const json = JSON.stringify(await exportBackup());
    await db.items.clear();
    await db.shopping.clear();
    await db.recipes.clear();

    const parsed = parseBackup(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await restoreBackup(parsed.backup);

    expect(await db.items.toArray()).toEqual(before.items);
    expect(await db.shopping.toArray()).toEqual(before.shopping);
    expect(await db.recipes.toArray()).toEqual(before.recipes);
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
