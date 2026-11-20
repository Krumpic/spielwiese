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
import { createBackup, type Backup } from "../domain/backup.ts";
import type { Level } from "../domain/constants.ts";
import {
  MAX_SERVINGS,
  RecipeDataSchema,
  checkRecipe,
  isEmpty,
  missingForShopping,
  planCooking,
  type RecipeData,
} from "../domain/recipe.ts";
import { z } from "zod";
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

/** @returns ID des neuen Artikels */
export async function createItem(input: unknown): Promise<number> {
  const data = ItemDataSchema.parse(input);
  const now = Date.now();
  return db.transaction("rw", db.items, db.shopping, async () => {
    const id = await db.items.add({ ...data, createdAt: now, updatedAt: now });
    const item = await db.items.get(id);
    if (item) await syncShopping(item);
    return id;
  });
}

export async function updateItem(id: number, input: unknown): Promise<void> {
  const data = ItemDataSchema.parse(input);
  await modifyItem(id, (item) => ({ ...item, ...data, updatedAt: Date.now() }));
}

/** Löscht einen Artikel samt Listeneinträgen und entfernt ihn als Zutat aus allen Rezepten. */
export async function deleteItem(id: number): Promise<void> {
  await db.transaction("rw", db.items, db.shopping, db.recipes, async () => {
    await db.items.delete(id);
    await db.shopping.where("itemId").equals(id).delete();
    const recipes = await db.recipes
      .filter((r) => r.ingredients.some((i) => i.itemId === id))
      .toArray();
    for (const recipe of recipes) {
      await db.recipes.put({
        ...recipe,
        ingredients: recipe.ingredients.filter((i) => i.itemId !== id),
        updatedAt: Date.now(),
      });
    }
  });
}

/** In wie vielen Rezepten wird der Artikel verwendet? (für die Rückfrage beim Löschen) */
export async function countRecipesUsingItem(id: number): Promise<number> {
  return db.recipes.filter((r) => r.ingredients.some((i) => i.itemId === id)).count();
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

// ---------- Datensicherung ----------

/** Erstellt ein Backup aller Daten und merkt sich den Zeitpunkt. */
export async function exportBackup(): Promise<Backup> {
  const now = Date.now();
  return db.transaction("r", db.items, db.shopping, db.recipes, async () =>
    createBackup(
      {
        items: await db.items.toArray(),
        shopping: await db.shopping.toArray(),
        recipes: await db.recipes.toArray(),
      },
      now,
    ),
  );
}

export async function markBackupDone(): Promise<void> {
  await db.meta.put({ key: "lastBackupAt", value: Date.now() });
}

/**
 * Ersetzt ALLE Daten durch das Backup – in einer Transaktion:
 * Schlägt etwas fehl, bleiben die bisherigen Daten vollständig erhalten.
 * Das Backup muss vorher mit `parseBackup` geprüft worden sein.
 */
export async function restoreBackup(backup: Backup): Promise<void> {
  await db.transaction("rw", db.items, db.shopping, db.recipes, async () => {
    await db.items.clear();
    await db.shopping.clear();
    await db.recipes.clear();
    await db.items.bulkAdd(backup.items);
    await db.shopping.bulkAdd(backup.shopping);
    await db.recipes.bulkAdd(backup.recipes);
  });
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

// ---------- Rezepte ----------

const ServingsSchema = z.number().int().min(1).max(MAX_SERVINGS);

/** Prüft, dass alle Zutaten auf vorhandene Vorrats-Artikel zeigen (innerhalb einer Transaktion). */
async function assertIngredientsExist(data: RecipeData): Promise<void> {
  const ids = data.ingredients.map((i) => i.itemId);
  const found = await db.items.bulkGet(ids);
  if (found.some((item) => item === undefined)) {
    throw new Error("Zutat verweist auf einen unbekannten Artikel.");
  }
}

export async function createRecipe(input: unknown): Promise<number> {
  const data = RecipeDataSchema.parse(input);
  const now = Date.now();
  return db.transaction("rw", db.items, db.recipes, async () => {
    await assertIngredientsExist(data);
    return db.recipes.add({ ...data, createdAt: now, updatedAt: now });
  });
}

export async function updateRecipe(id: number, input: unknown): Promise<void> {
  const data = RecipeDataSchema.parse(input);
  await db.transaction("rw", db.items, db.recipes, async () => {
    const recipe = await db.recipes.get(id);
    if (!recipe) return;
    await assertIngredientsExist(data);
    await db.recipes.put({ ...recipe, ...data, updatedAt: Date.now() });
  });
}

export async function deleteRecipe(id: number): Promise<void> {
  await db.recipes.delete(id);
}

/** Lädt Rezept + zugehörige Artikel und gleicht sie für die Portionenzahl ab. */
async function loadRecipeCheck(recipeId: number, servings: number) {
  const recipe = await db.recipes.get(recipeId);
  if (!recipe) return null;
  const items = await db.items.bulkGet(recipe.ingredients.map((i) => i.itemId));
  const itemsById = new Map(items.flatMap((item) => (item ? [[item.id, item] as const] : [])));
  return checkRecipe(recipe, itemsById, ServingsSchema.parse(servings));
}

/**
 * Setzt die fehlenden Zutaten auf die Einkaufsliste (nur die Fehlmenge).
 * Steht der Artikel schon offen auf der Liste, wird die Menge bei Bedarf erhöht.
 * @returns Anzahl der Zutaten, die auf die Liste kamen
 */
export async function addMissingIngredientsToShoppingList(
  recipeId: number,
  servings: number,
): Promise<number> {
  return db.transaction("rw", db.items, db.shopping, db.recipes, async () => {
    const result = await loadRecipeCheck(recipeId, servings);
    if (!result) return 0;
    const needs = missingForShopping(result.checks);
    for (const { item, quantity } of needs) {
      const open = (await db.shopping.where("itemId").equals(item.id).toArray()).find(
        (e) => !e.checked,
      );
      if (open) {
        // "manual": sonst würde der automatische Abgleich die Menge wieder zurücksetzen
        const raised = quantity === null ? open.quantity : Math.max(open.quantity ?? 0, quantity);
        await db.shopping.update(open.id, { quantity: raised, source: "manual" });
      } else {
        await db.shopping.add({ ...manualEntryForItem(item, Date.now()), quantity });
      }
    }
    return needs.length;
  });
}

/** Vorschlag für die Einkaufsliste: so viel nachkaufen, wie verbraucht wurde */
export interface Refill {
  item: Item;
  /** in der Einheit des Artikels; null = grob geschätzt (ohne Menge) */
  quantity: number | null;
}

export interface CookResult {
  /** Stand der Artikel vor dem Kochen – für „Rückgängig" */
  before: Item[];
  /** Jetzt leere Artikel, die nicht ohnehin schon auf der Einkaufsliste stehen */
  emptied: Refill[];
}

/**
 * „Jetzt kochen": zieht die Zutaten vom Vorrat ab (in einer Transaktion).
 * @param levelAnswers Antworten auf „Wie viel ist noch da?" für grob geschätzte Zutaten
 */
export async function cookRecipe(
  recipeId: number,
  servings: number,
  levelAnswers: ReadonlyMap<number, Level>,
): Promise<CookResult> {
  return db.transaction("rw", db.items, db.shopping, db.recipes, async () => {
    const result = await loadRecipeCheck(recipeId, servings);
    if (!result) return { before: [], emptied: [] };
    const beforeById = new Map(
      result.checks.flatMap((c) => (c.item ? [[c.item.id, c.item] as const] : [])),
    );
    const updated = planCooking(result.checks, levelAnswers, Date.now());

    const before: Item[] = [];
    const emptied: Refill[] = [];
    for (const item of updated) {
      const original = beforeById.get(item.id);
      if (original) before.push(original);
      await db.items.put(item);
      await syncShopping(item);
      if (isEmpty(item) && (await db.shopping.where("itemId").equals(item.id).count()) === 0) {
        // Verbraucht wurde alles, was vorher da war → genau das wieder einkaufen
        const used = item.mode === "exact" && original ? original.quantity : null;
        emptied.push({ item, quantity: used !== null && used > 0 ? used : null });
      }
    }
    return { before, emptied };
  });
}

/** Macht „Jetzt kochen" rückgängig: stellt den vorherigen Stand der Artikel wieder her. */
export async function undoCooking(before: readonly Item[]): Promise<void> {
  await db.transaction("rw", db.items, db.shopping, async () => {
    for (const original of before) {
      if (!(await db.items.get(original.id))) continue; // inzwischen gelöscht
      await db.items.put(original);
      await syncShopping(original);
    }
  });
}

/**
 * Setzt mehrere Artikel auf die Einkaufsliste (z. B. nach dem Kochen leer gewordene).
 * Ohne Mengenangabe gilt die übliche Nachkauf-Menge des Artikels.
 */
export async function putItemsOnShoppingList(
  refills: readonly { itemId: number; quantity: number | null }[],
): Promise<void> {
  await db.transaction("rw", db.items, db.shopping, async () => {
    for (const { itemId, quantity } of refills) {
      const item = await db.items.get(itemId);
      if (!item) continue;
      if ((await db.shopping.where("itemId").equals(itemId).count()) > 0) continue;
      const entry = manualEntryForItem(item, Date.now());
      await db.shopping.add(
        item.mode === "exact" && quantity !== null && quantity > 0 ? { ...entry, quantity } : entry,
      );
    }
  });
}
