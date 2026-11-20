import { z } from "zod";
import { UNIT_IDS, convertUnit, unitInfo, type Level, type Unit } from "./constants.ts";
import { recordId, roundAmount, timestamp, type Item } from "./item.ts";

/**
 * Rezepte.
 * Zutaten verweisen per `itemId` auf Vorrats-Artikel – so klappt der Abgleich
 * auch nach dem Umbenennen eines Artikels.
 */
export interface RecipeIngredient {
  itemId: number;
  /** Menge für `recipe.servings` Portionen; null = ohne Mengenangabe (z. B. grob geschätzte Artikel) */
  quantity: number | null;
  unit: Unit | null;
  /** Grundzutat (Salz, Öl …): wird angezeigt, blockiert aber nie und wird nicht abgezogen */
  basic: boolean;
}

export interface Recipe {
  id: number;
  name: string;
  servings: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  createdAt: number;
  updatedAt: number;
}

export type RecipeData = Omit<Recipe, "id" | "createdAt" | "updatedAt">;

export const MAX_SERVINGS = 50;

const ingredientSchema = z
  .object({
    itemId: recordId,
    quantity: z
      .number({ error: "Bitte eine gültige Menge eingeben." })
      .gt(0, "Menge muss größer als 0 sein.")
      .max(100_000, "Menge ist zu groß.")
      .nullable(),
    unit: z.enum(UNIT_IDS).nullable(),
    basic: z.boolean(),
  })
  .strict()
  .refine((i) => (i.quantity === null) === (i.unit === null), {
    message: "Menge und Einheit gehören zusammen.",
  });

const recipeDataShape = {
  name: z
    .string()
    .trim()
    .min(1, "Bitte einen Namen eingeben.")
    .max(80, "Name ist zu lang (max. 80 Zeichen)."),
  servings: z
    .number({ error: "Bitte eine Zahl eingeben." })
    .int("Bitte eine ganze Zahl eingeben.")
    .min(1, "Mindestens 1 Portion.")
    .max(MAX_SERVINGS, `Höchstens ${String(MAX_SERVINGS)} Portionen.`),
  ingredients: z.array(ingredientSchema).max(60, "Höchstens 60 Zutaten."),
  steps: z
    .array(
      z.string().trim().min(1, "Leere Schritte bitte entfernen.").max(2000, "Schritt ist zu lang."),
    )
    .max(50, "Höchstens 50 Schritte."),
};

const noDuplicateIngredients = (r: { ingredients: { itemId: number }[] }) =>
  new Set(r.ingredients.map((i) => i.itemId)).size === r.ingredients.length;
const duplicateError = { message: "Eine Zutat ist doppelt eingetragen.", path: ["ingredients"] };

export const RecipeDataSchema = z
  .object(recipeDataShape)
  .strict()
  .refine(noDuplicateIngredients, duplicateError);

export const StoredRecipeSchema = z
  .object({ ...recipeDataShape, id: recordId, createdAt: timestamp, updatedAt: timestamp })
  .strict()
  .refine(noDuplicateIngredients, duplicateError);

// ---------- Abgleich mit dem Vorrat ----------

export type IngredientState =
  /** genug da */
  | { kind: "ok" }
  /** etwas da, aber zu wenig – `missing` in der Einheit der Zutat */
  | { kind: "partial"; missing: number }
  /** nichts da */
  | { kind: "missing" }
  /** Grundzutat – blockiert nicht */
  | { kind: "basic" }
  /** Artikel gelöscht oder Einheit passt nicht mehr zum Vorrat */
  | { kind: "invalid" };

export interface IngredientCheck {
  ingredient: RecipeIngredient;
  item: Item | undefined;
  /** Menge für die gewählte Portionenzahl */
  needed: number | null;
  state: IngredientState;
}

export type RecipeStatus = "green" | "yellow" | "red";

/** Menge für eine andere Portionenzahl */
export function scaleQuantity(quantity: number, from: number, to: number): number {
  return roundAmount((quantity * to) / from);
}

export function checkIngredient(
  ingredient: RecipeIngredient,
  item: Item | undefined,
  recipeServings: number,
  servings: number,
): IngredientCheck {
  const needed =
    ingredient.quantity === null
      ? null
      : scaleQuantity(ingredient.quantity, recipeServings, servings);
  const result = (state: IngredientState): IngredientCheck => ({ ingredient, item, needed, state });

  if (!item) return result({ kind: "invalid" });
  if (ingredient.basic) return result({ kind: "basic" });

  // Grob geschätzt: da ist da, solange nicht "leer"
  if (item.mode === "level") {
    return result(item.level === "empty" ? { kind: "missing" } : { kind: "ok" });
  }
  // Zutat ohne Mengenangabe: da, solange etwas im Vorrat ist
  if (needed === null || ingredient.unit === null) {
    return result(item.quantity > 0 ? { kind: "ok" } : { kind: "missing" });
  }

  const available = convertUnit(item.quantity, item.unit, ingredient.unit);
  if (available === null) return result({ kind: "invalid" });
  if (available >= needed) return result({ kind: "ok" });
  if (available > 0) return result({ kind: "partial", missing: roundAmount(needed - available) });
  return result({ kind: "missing" });
}

export function checkRecipe(
  recipe: Recipe,
  itemsById: ReadonlyMap<number, Item>,
  servings: number = recipe.servings,
): { checks: IngredientCheck[]; status: RecipeStatus; missingCount: number } {
  const checks = recipe.ingredients.map((ingredient) =>
    checkIngredient(ingredient, itemsById.get(ingredient.itemId), recipe.servings, servings),
  );
  const relevant = checks.filter((c) => c.state.kind !== "basic");
  const okCount = relevant.filter((c) => c.state.kind === "ok").length;
  const someThere = relevant.some((c) => c.state.kind === "ok" || c.state.kind === "partial");
  const missingCount = relevant.length - okCount;
  const status: RecipeStatus = missingCount === 0 ? "green" : someThere ? "yellow" : "red";
  return { checks, status, missingCount };
}

// ---------- Fehlende Zutaten → Einkaufsliste ----------

export interface ShoppingNeed {
  item: Item;
  /** in der Einheit des Vorrats-Artikels; null = ohne Menge (grob geschätzt) */
  quantity: number | null;
}

/** Was muss für dieses Rezept eingekauft werden? (Menge immer in der Einheit des Vorrats) */
export function missingForShopping(checks: readonly IngredientCheck[]): ShoppingNeed[] {
  const needs: ShoppingNeed[] = [];
  for (const check of checks) {
    const { item, ingredient, state, needed } = check;
    if (!item || (state.kind !== "missing" && state.kind !== "partial")) continue;
    if (item.mode === "level" || ingredient.unit === null || needed === null) {
      needs.push({ item, quantity: item.mode === "exact" ? unitInfo(item.unit).step : null });
      continue;
    }
    const missing = state.kind === "partial" ? state.missing : needed;
    const inItemUnit = convertUnit(missing, ingredient.unit, item.unit);
    if (inItemUnit !== null) needs.push({ item, quantity: inItemUnit });
  }
  return needs;
}

// ---------- Kochen ----------

/** Grob geschätzte Zutaten, nach deren Füllstand beim Kochen gefragt wird */
export function levelItemsToAsk(checks: readonly IngredientCheck[]): Item[] {
  return checks
    .filter((c) => c.state.kind !== "basic" && c.item?.mode === "level")
    .flatMap((c) => (c.item ? [c.item] : []));
}

/**
 * Berechnet den Vorrat nach dem Kochen (reine Funktion, ändert nichts).
 * - genau gezählte Zutaten: Menge abziehen (nie unter 0)
 * - grob geschätzte Zutaten: Füllstand aus der Antwort des Nutzers
 * - Grundzutaten: unverändert
 */
export function planCooking(
  checks: readonly IngredientCheck[],
  levelAnswers: ReadonlyMap<number, Level>,
  now: number,
): Item[] {
  const updated: Item[] = [];
  for (const { item, ingredient, needed, state } of checks) {
    if (!item || state.kind === "basic" || state.kind === "invalid") continue;
    if (item.mode === "level") {
      const level = levelAnswers.get(item.id);
      if (level !== undefined && level !== item.level)
        updated.push({ ...item, level, updatedAt: now });
      continue;
    }
    if (needed === null || ingredient.unit === null) continue;
    const used = convertUnit(needed, ingredient.unit, item.unit);
    if (used === null) continue;
    updated.push({
      ...item,
      quantity: Math.max(0, roundAmount(item.quantity - used)),
      updatedAt: now,
    });
  }
  return updated;
}

/** Ist der Artikel nach dem Kochen leer? */
export function isEmpty(item: Item): boolean {
  return item.mode === "exact" ? item.quantity <= 0 : item.level === "empty";
}
