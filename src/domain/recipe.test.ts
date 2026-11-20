import { describe, expect, it } from "vitest";
import { compatibleUnits, convertUnit } from "./constants.ts";
import {
  RecipeDataSchema,
  checkRecipe,
  isEmpty,
  levelItemsToAsk,
  missingForShopping,
  planCooking,
  scaleQuantity,
  type Recipe,
  type RecipeData,
} from "./recipe.ts";
import { makeItem } from "./testing.ts";
import type { Item } from "./item.ts";

const pasta = makeItem({ id: 1, name: "Spaghetti", unit: "kg", quantity: 1 });
const onion = makeItem({ id: 2, name: "Zwiebel", unit: "piece", quantity: 3 });
const tomatoes = makeItem({ id: 3, name: "Tomaten", unit: "can", quantity: 1 });
const flour = makeItem({ id: 4, name: "Mehl", mode: "level", level: "half" });
const salt = makeItem({ id: 5, name: "Salz", unit: "g", quantity: 0 });
const mince = makeItem({ id: 6, name: "Faschiertes", unit: "g", quantity: 0 });

const recipe: Recipe = {
  id: 1,
  name: "Bolognese",
  servings: 4,
  ingredients: [
    { itemId: 1, quantity: 500, unit: "g", basic: false },
    { itemId: 2, quantity: 1, unit: "piece", basic: false },
    { itemId: 3, quantity: 2, unit: "can", basic: false },
    { itemId: 4, quantity: null, unit: null, basic: false },
    { itemId: 5, quantity: 5, unit: "g", basic: true },
  ],
  steps: ["Kochen"],
  createdAt: 0,
  updatedAt: 0,
};

const byId = (...items: Item[]) => new Map(items.map((i) => [i.id, i]));
const all = byId(pasta, onion, tomatoes, flour, salt, mince);

describe("Einheiten", () => {
  it("rechnet g↔kg und ml↔l um", () => {
    expect(convertUnit(1, "kg", "g")).toBe(1000);
    expect(convertUnit(250, "ml", "l")).toBe(0.25);
  });
  it("rechnet Unvereinbares nicht um", () => {
    expect(convertUnit(1, "piece", "g")).toBeNull();
    expect(convertUnit(1, "can", "bottle")).toBeNull();
  });
  it("kennt kompatible Einheiten", () => {
    expect(compatibleUnits("kg")).toEqual(["g", "kg"]);
    expect(compatibleUnits("can")).toEqual(["can"]);
  });
});

describe("Portionen", () => {
  it("skaliert Mengen", () => {
    expect(scaleQuantity(500, 4, 2)).toBe(250);
    expect(scaleQuantity(1, 4, 6)).toBe(1.5);
    expect(scaleQuantity(100, 3, 1)).toBe(33.333);
  });
});

describe("Ampel", () => {
  it("gelb, wenn manches da ist und manches fehlt (Teilmenge zählt als fehlend)", () => {
    const { status, missingCount, checks } = checkRecipe(recipe, all);
    expect(status).toBe("yellow");
    expect(missingCount).toBe(1);
    expect(checks[2]?.state).toEqual({ kind: "partial", missing: 1 });
  });

  it("grün, wenn alles da ist – Grundzutaten blockieren nicht", () => {
    const enough = byId(pasta, onion, { ...tomatoes, quantity: 2 }, flour, salt);
    expect(checkRecipe(recipe, enough).status).toBe("green");
  });

  it("rechnet in die Einheit des Vorrats um (1 kg Vorrat, 500 g gebraucht)", () => {
    expect(checkRecipe(recipe, all).checks[0]?.state).toEqual({ kind: "ok" });
  });

  it("rot, wenn nichts da ist", () => {
    const nothing = byId(
      { ...pasta, quantity: 0 },
      { ...onion, quantity: 0 },
      { ...tomatoes, quantity: 0 },
      { ...flour, level: "empty" },
      salt,
    );
    expect(checkRecipe(recipe, nothing).status).toBe("red");
  });

  it("mehr Portionen → mehr Bedarf", () => {
    const enoughFor4 = byId(pasta, onion, { ...tomatoes, quantity: 2 }, flour, salt);
    const { status, checks } = checkRecipe(recipe, enoughFor4, 8);
    expect(status).toBe("yellow");
    expect(checks[0]?.state).toEqual({ kind: "ok" }); // 1000 g von 1 kg reicht genau
    expect(checks[2]?.state).toEqual({ kind: "partial", missing: 2 }); // 4 Dosen, 2 da
  });

  it("gelöschte Artikel zählen als fehlend (ungültig)", () => {
    const { checks, status } = checkRecipe(recipe, byId(onion, tomatoes, flour, salt));
    expect(checks[0]?.state).toEqual({ kind: "invalid" });
    expect(status).not.toBe("green");
  });

  it("Rezept ohne Zutaten ist grün", () => {
    expect(checkRecipe({ ...recipe, ingredients: [] }, all).status).toBe("green");
  });
});

describe("Fehlende Zutaten für die Einkaufsliste", () => {
  it("nur die Fehlmenge, umgerechnet in die Einheit des Vorrats", () => {
    const r: Recipe = {
      ...recipe,
      ingredients: [
        { itemId: 6, quantity: 500, unit: "g", basic: false },
        { itemId: 3, quantity: 2, unit: "can", basic: false },
        { itemId: 1, quantity: 500, unit: "g", basic: false },
      ],
    };
    const kgMince = { ...mince, unit: "kg" as const };
    const needs = missingForShopping(checkRecipe(r, byId(kgMince, tomatoes, pasta)).checks);
    expect(needs.map((n) => [n.item.name, n.quantity])).toEqual([
      ["Faschiertes", 0.5],
      ["Tomaten", 1],
    ]);
  });

  it("grob geschätzte Artikel ohne Menge", () => {
    const needs = missingForShopping(
      checkRecipe(recipe, byId({ ...flour, level: "empty" })).checks,
    );
    expect(needs).toEqual([{ item: { ...flour, level: "empty" }, quantity: null }]);
  });

  it("Grundzutaten kommen nicht auf die Liste", () => {
    const needs = missingForShopping(checkRecipe(recipe, all).checks);
    expect(needs.some((n) => n.item.name === "Salz")).toBe(false);
  });
});

describe("Kochen", () => {
  const enough = byId(pasta, onion, { ...tomatoes, quantity: 2 }, flour, salt);

  it("fragt nur bei grob geschätzten Zutaten (ohne Grundzutaten)", () => {
    expect(levelItemsToAsk(checkRecipe(recipe, enough).checks).map((i) => i.name)).toEqual([
      "Mehl",
    ]);
  });

  it("zieht Mengen ab (umgerechnet), setzt Füllstände, lässt Grundzutaten in Ruhe", () => {
    const { checks } = checkRecipe(recipe, enough);
    const after = planCooking(checks, new Map([[4, "low"]]), 42);
    const byName = new Map(after.map((i) => [i.name, i]));
    expect(byName.get("Spaghetti")?.quantity).toBe(0.5);
    expect(byName.get("Zwiebel")?.quantity).toBe(2);
    expect(byName.get("Tomaten")?.quantity).toBe(0);
    expect(byName.get("Mehl")?.level).toBe("low");
    expect(byName.has("Salz")).toBe(false);
    expect(byName.get("Spaghetti")?.updatedAt).toBe(42);
  });

  it("halbe Portionen → halbe Menge", () => {
    const after = planCooking(checkRecipe(recipe, enough, 2).checks, new Map(), 0);
    expect(after.find((i) => i.name === "Spaghetti")?.quantity).toBe(0.75);
  });

  it("geht nie unter 0", () => {
    const little = byId({ ...pasta, quantity: 0.1 });
    const after = planCooking(checkRecipe(recipe, little).checks, new Map(), 0);
    expect(after.find((i) => i.name === "Spaghetti")?.quantity).toBe(0);
  });

  it("erkennt leere Artikel", () => {
    expect(isEmpty({ ...tomatoes, quantity: 0 })).toBe(true);
    expect(isEmpty({ ...flour, level: "empty" })).toBe(true);
    expect(isEmpty(onion)).toBe(false);
  });
});

describe("RecipeDataSchema", () => {
  const valid: RecipeData = {
    name: "  Palatschinken ",
    servings: 2,
    ingredients: [{ itemId: 1, quantity: 200, unit: "g", basic: false }],
    steps: ["Teig rühren", "Ausbacken"],
  };
  it("akzeptiert gültige Rezepte", () => {
    expect(RecipeDataSchema.parse(valid).name).toBe("Palatschinken");
  });
  it("lehnt doppelte Zutaten ab", () => {
    const dup = { ...valid, ingredients: [...valid.ingredients, ...valid.ingredients] };
    expect(RecipeDataSchema.safeParse(dup).success).toBe(false);
  });
  it("lehnt ungültige Portionen und leere Schritte ab", () => {
    expect(RecipeDataSchema.safeParse({ ...valid, servings: 0 }).success).toBe(false);
    expect(RecipeDataSchema.safeParse({ ...valid, servings: 1.5 }).success).toBe(false);
    expect(RecipeDataSchema.safeParse({ ...valid, steps: ["  "] }).success).toBe(false);
  });
  it("Menge und Einheit gehören zusammen", () => {
    const bad = { ...valid, ingredients: [{ itemId: 1, quantity: 2, unit: null, basic: false }] };
    expect(RecipeDataSchema.safeParse(bad).success).toBe(false);
  });
});
