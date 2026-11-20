import { describe, expect, it } from "vitest";
import { ExpiryDateSchema, daysUntil, expiryState, expiryText, todayString } from "./expiry.ts";
import { adjustQuantity, applyPurchase, cycleLevel } from "./item.ts";
import { checkRecipe, planCooking, type Recipe } from "./recipe.ts";
import { makeItem } from "./testing.ts";

const TODAY = "2026-11-20";

describe("Datum", () => {
  it("heute in lokaler Zeit", () => {
    expect(todayString(new Date(2026, 0, 5, 23, 59).getTime())).toBe("2026-01-05");
  });
  it("Tage bis zum Ablauf, auch über Monats- und Jahresgrenzen", () => {
    expect(daysUntil("2026-11-20", TODAY)).toBe(0);
    expect(daysUntil("2026-12-01", TODAY)).toBe(11);
    expect(daysUntil("2027-01-01", "2026-12-31")).toBe(1);
    expect(daysUntil("2026-11-18", TODAY)).toBe(-2);
  });
  it("prüft gültige Daten", () => {
    expect(ExpiryDateSchema.safeParse("2026-02-28").success).toBe(true);
    expect(ExpiryDateSchema.safeParse("2028-02-29").success).toBe(true); // Schaltjahr
    expect(ExpiryDateSchema.safeParse("2026-02-29").success).toBe(false);
    expect(ExpiryDateSchema.safeParse("2026-13-01").success).toBe(false);
    expect(ExpiryDateSchema.safeParse("20.11.2026").success).toBe(false);
    expect(ExpiryDateSchema.safeParse("1900-01-01").success).toBe(false);
  });
});

describe("Ablauf-Status", () => {
  it("abgelaufen / bald / ok", () => {
    expect(expiryState(null, TODAY)).toBeNull();
    expect(expiryState("2026-11-19", TODAY)).toBe("expired");
    expect(expiryState("2026-11-20", TODAY)).toBe("soon");
    expect(expiryState("2026-11-23", TODAY)).toBe("soon");
    expect(expiryState("2026-11-24", TODAY)).toBe("ok");
  });
  it("verständliche Texte", () => {
    expect(expiryText("2026-11-20", TODAY)).toBe("läuft heute ab");
    expect(expiryText("2026-11-21", TODAY)).toBe("läuft morgen ab");
    expect(expiryText("2026-11-23", TODAY)).toBe("läuft in 3 Tagen ab");
    expect(expiryText("2026-11-19", TODAY)).toBe("seit gestern abgelaufen");
    expect(expiryText("2026-11-15", TODAY)).toBe("seit 5 Tagen abgelaufen");
    expect(expiryText("2026-12-24", TODAY)).toBe("haltbar bis 24.12.2026");
  });
});

describe("Ablaufdatum bei leerem Artikel löschen", () => {
  const dated = { expiresOn: "2026-11-25" };

  it("letztes Stück verbraucht → Datum weg", () => {
    expect(
      adjustQuantity(makeItem({ unit: "piece", quantity: 1, ...dated }), -1, 0).expiresOn,
    ).toBeNull();
  });
  it("noch etwas da → Datum bleibt", () => {
    expect(
      adjustQuantity(makeItem({ unit: "piece", quantity: 2, ...dated }), -1, 0).expiresOn,
    ).toBe("2026-11-25");
  });
  it("Füllstand auf leer → Datum weg", () => {
    expect(cycleLevel(makeItem({ mode: "level", level: "low", ...dated }), 0).expiresOn).toBeNull();
  });
  it("Einkauf nach leer → altes Datum weg (neue Packung)", () => {
    expect(applyPurchase(makeItem({ quantity: 0, ...dated }), 1, 0).expiresOn).toBeNull();
  });
  it("Einkauf, solange noch etwas da ist → älteres Datum bleibt", () => {
    expect(applyPurchase(makeItem({ quantity: 1, ...dated }), 1, 0).expiresOn).toBe("2026-11-25");
  });
  it("Kochen bis leer → Datum weg", () => {
    const eggs = makeItem({ id: 1, unit: "piece", quantity: 2, ...dated });
    const recipe: Recipe = {
      id: 1,
      name: "Rührei",
      servings: 1,
      ingredients: [{ itemId: 1, quantity: 2, unit: "piece", basic: false }],
      steps: [],
      createdAt: 0,
      updatedAt: 0,
    };
    const [after] = planCooking(checkRecipe(recipe, new Map([[1, eggs]])).checks, new Map(), 0);
    expect(after?.quantity).toBe(0);
    expect(after?.expiresOn).toBeNull();
  });
});
