import { describe, expect, it } from "vitest";
import {
  ManualEntrySchema,
  entryAmountText,
  groupBySection,
  planShoppingSync,
  purchaseAmount,
} from "./shopping.ts";
import { makeEntry, makeItem } from "./testing.ts";

const lowMilk = makeItem({ quantity: 1, minQuantity: 2, targetQuantity: 3 });
const enoughMilk = makeItem({ quantity: 3, minQuantity: 2, targetQuantity: 3 });

describe("planShoppingSync", () => {
  it("legt einen Eintrag an, wenn nachgekauft werden muss", () => {
    const action = planShoppingSync(lowMilk, [], 5);
    expect(action).toEqual({
      type: "create",
      entry: {
        itemId: 1,
        name: "Milch",
        section: "dairy",
        quantity: 2,
        unit: "l",
        checked: false,
        source: "auto",
        createdAt: 5,
      },
    });
  });

  it("macht nichts, wenn genug da ist", () => {
    expect(planShoppingSync(enoughMilk, [], 0)).toEqual({ type: "none" });
  });

  it("entfernt den automatischen Eintrag, wenn wieder genug da ist", () => {
    expect(planShoppingSync(enoughMilk, [makeEntry({ id: 7 })], 0)).toEqual({
      type: "delete",
      id: 7,
    });
  });

  it("lässt manuelle Einträge stehen, auch wenn genug da ist", () => {
    expect(planShoppingSync(enoughMilk, [makeEntry({ source: "manual" })], 0)).toEqual({
      type: "none",
    });
  });

  it("aktualisiert die Menge, wenn noch mehr verbraucht wurde", () => {
    const emptyMilk = makeItem({ quantity: 0, minQuantity: 2, targetQuantity: 3 });
    expect(planShoppingSync(emptyMilk, [makeEntry({ id: 7, quantity: 2 })], 0)).toEqual({
      type: "update",
      id: 7,
      changes: { name: "Milch", section: "dairy", quantity: 3, unit: "l" },
    });
  });

  it("legt nichts doppelt an, wenn der Artikel schon im Einkaufswagen ist", () => {
    expect(planShoppingSync(lowMilk, [makeEntry({ checked: true })], 0)).toEqual({ type: "none" });
  });

  it("legt nichts doppelt an, wenn er manuell auf der Liste steht", () => {
    expect(planShoppingSync(lowMilk, [makeEntry({ source: "manual" })], 0)).toEqual({
      type: "none",
    });
  });

  it("verändert abgehakte Einträge nicht", () => {
    expect(planShoppingSync(enoughMilk, [makeEntry({ checked: true })], 0)).toEqual({
      type: "none",
    });
  });

  it("legt bei grob geschätzten Artikeln einen Eintrag ohne Menge an", () => {
    const flour = makeItem({
      name: "Mehl",
      section: "staples",
      mode: "level",
      level: "low",
      minLevel: "low",
    });
    const action = planShoppingSync(flour, [], 0);
    expect(action.type).toBe("create");
    if (action.type === "create") {
      expect(action.entry.quantity).toBeNull();
      expect(action.entry.unit).toBeNull();
    }
  });
});

describe("groupBySection", () => {
  it("sortiert nach Laufweg im Supermarkt und innerhalb alphabetisch", () => {
    const groups = groupBySection([
      makeEntry({ id: 1, name: "Saft", section: "drinks" }),
      makeEntry({ id: 2, name: "Joghurt", section: "dairy" }),
      makeEntry({ id: 3, name: "Äpfel", section: "produce" }),
      makeEntry({ id: 4, name: "Butter", section: "dairy" }),
    ]);
    expect(groups.map((g) => g.label)).toEqual([
      "Obst & Gemüse",
      "Milchprodukte & Eier",
      "Getränke",
    ]);
    expect(groups[1]?.entries.map((e) => e.name)).toEqual(["Butter", "Joghurt"]);
  });
});

describe("entryAmountText", () => {
  it("zeigt Menge und Einheit", () => {
    expect(entryAmountText(makeEntry({ quantity: 1.5, unit: "kg" }))).toBe("1,5 kg");
  });
  it("zeigt nichts ohne Menge", () => {
    expect(entryAmountText(makeEntry({ quantity: null, unit: null }))).toBeNull();
  });
});

describe("purchaseAmount (Einkauf in der Einheit des Vorrats)", () => {
  it("rechnet die Einheit des Eintrags um (1,8 kg → 1800 g)", () => {
    const item = makeItem({ unit: "g" });
    expect(purchaseAmount(makeEntry({ quantity: 1.8, unit: "kg" }), item)).toBe(1800);
  });
  it("gleiche Einheit bleibt gleich", () => {
    expect(purchaseAmount(makeEntry({ quantity: 2, unit: "l" }), makeItem({ unit: "l" }))).toBe(2);
  });
  it("nicht umrechenbar (Stück → g) oder ohne Menge → null (übliche Nachkauf-Menge)", () => {
    expect(
      purchaseAmount(makeEntry({ quantity: 2, unit: "piece" }), makeItem({ unit: "g" })),
    ).toBeNull();
    expect(purchaseAmount(makeEntry({ quantity: null, unit: null }), makeItem())).toBeNull();
  });
  it("grob geschätzte Artikel → null (werden auf 'voll' gesetzt)", () => {
    expect(purchaseAmount(makeEntry(), makeItem({ mode: "level" }))).toBeNull();
  });
  it("begrenzt auf die Obergrenze", () => {
    expect(purchaseAmount(makeEntry({ quantity: 500, unit: "l" }), makeItem({ unit: "ml" }))).toBe(
      100_000,
    );
  });
});

describe("ManualEntrySchema", () => {
  it("prüft Name und Abteilung", () => {
    expect(ManualEntrySchema.safeParse({ name: "Brot", section: "bakery" }).success).toBe(true);
    expect(ManualEntrySchema.safeParse({ name: "", section: "bakery" }).success).toBe(false);
    expect(ManualEntrySchema.safeParse({ name: "Brot", section: "x" }).success).toBe(false);
  });
});
