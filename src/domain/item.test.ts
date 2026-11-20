import { describe, expect, it } from "vitest";
import {
  ItemDataSchema,
  adjustQuantity,
  applyPurchase,
  cycleLevel,
  formatQuantity,
  needsRestock,
  parseDecimal,
  restockQuantity,
  type ItemData,
} from "./item.ts";
import { makeItem } from "./testing.ts";

describe("needsRestock – genau gezählt", () => {
  it("nein, wenn keine Mindestmenge gesetzt ist", () => {
    expect(needsRestock(makeItem({ quantity: 0, minQuantity: null }))).toBe(false);
  });
  it("ja, wenn weniger als die Mindestmenge da ist", () => {
    expect(needsRestock(makeItem({ quantity: 1, minQuantity: 2 }))).toBe(true);
  });
  it("nein, wenn genau die Mindestmenge da ist", () => {
    expect(needsRestock(makeItem({ quantity: 2, minQuantity: 2 }))).toBe(false);
  });
});

describe("needsRestock – grob geschätzt", () => {
  const level = (l: "full" | "half" | "low" | "empty", min: "half" | "low" | "empty" | null) =>
    makeItem({ mode: "level", level: l, minLevel: min });

  it("ja, wenn der Füllstand die Grenze erreicht", () => {
    expect(needsRestock(level("low", "low"))).toBe(true);
    expect(needsRestock(level("empty", "low"))).toBe(true);
  });
  it("nein, wenn noch mehr da ist", () => {
    expect(needsRestock(level("half", "low"))).toBe(false);
  });
  it("nein, wenn 'nie nachkaufen' eingestellt ist", () => {
    expect(needsRestock(level("empty", null))).toBe(false);
  });
});

describe("restockQuantity", () => {
  it("füllt bis zur Sollmenge auf", () => {
    expect(restockQuantity(makeItem({ quantity: 1, minQuantity: 2, targetQuantity: 3 }))).toBe(2);
  });
  it("nimmt ohne Sollmenge die Mindestmenge als Ziel", () => {
    expect(restockQuantity(makeItem({ unit: "piece", quantity: 1, minQuantity: 4 }))).toBe(3);
  });
  it("rechnet Kommazahlen sauber", () => {
    expect(
      restockQuantity(makeItem({ quantity: 0.1, minQuantity: 0.3, targetQuantity: 0.3 })),
    ).toBe(0.2);
  });
  it("liefert nie 0, sondern mindestens eine Schrittweite", () => {
    expect(restockQuantity(makeItem({ unit: "piece", quantity: 5, minQuantity: 2 }))).toBe(1);
  });
});

describe("applyPurchase", () => {
  it("addiert die gekaufte Menge", () => {
    const after = applyPurchase(makeItem({ quantity: 1 }), 2, 99);
    expect(after.quantity).toBe(3);
    expect(after.updatedAt).toBe(99);
  });
  it("setzt grob geschätzte Artikel auf voll", () => {
    expect(applyPurchase(makeItem({ mode: "level", level: "empty" }), null, 0).level).toBe("full");
  });
});

describe("adjustQuantity", () => {
  it("nutzt die Schrittweite der Einheit", () => {
    expect(adjustQuantity(makeItem({ unit: "g", quantity: 200 }), 1, 0).quantity).toBe(250);
    expect(adjustQuantity(makeItem({ unit: "l", quantity: 1 }), -1, 0).quantity).toBe(0.5);
  });
  it("geht nie unter 0", () => {
    expect(adjustQuantity(makeItem({ unit: "piece", quantity: 0 }), -1, 0).quantity).toBe(0);
  });
});

describe("cycleLevel", () => {
  it("geht voll → halb → wenig → leer → voll", () => {
    let item = makeItem({ mode: "level", level: "full" });
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      item = cycleLevel(item, 0);
      seen.push(item.level);
    }
    expect(seen).toEqual(["half", "low", "empty", "full"]);
  });
});

describe("parseDecimal", () => {
  it("versteht Komma und Punkt", () => {
    expect(parseDecimal("1,5")).toBe(1.5);
    expect(parseDecimal("2.25")).toBe(2.25);
    expect(parseDecimal(" 3 ")).toBe(3);
  });
  it("leer → null", () => {
    expect(parseDecimal("")).toBeNull();
  });
  it("Unsinn → NaN (wird von der Prüfung abgelehnt)", () => {
    expect(parseDecimal("abc")).toBeNaN();
    expect(parseDecimal("-1")).toBeNaN();
    expect(parseDecimal("1e9")).toBeNaN();
  });
});

describe("formatQuantity", () => {
  it("formatiert deutsch", () => {
    expect(formatQuantity(1.5, "l")).toBe("1,5 l");
    expect(formatQuantity(6, "piece")).toBe("6 Stk");
  });
});

describe("ItemDataSchema", () => {
  const valid: ItemData = {
    name: "  Milch  ",
    location: "fridge",
    section: "dairy",
    mode: "exact",
    quantity: 1,
    unit: "l",
    level: "full",
    minQuantity: 1,
    targetQuantity: 3,
    minLevel: null,
    expiresOn: null,
    barcode: null,
  };

  it("akzeptiert gültige Daten und entfernt Leerzeichen", () => {
    expect(ItemDataSchema.parse(valid).name).toBe("Milch");
  });
  it("lehnt leere Namen ab", () => {
    expect(ItemDataSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
  });
  it("lehnt negative und ungültige Zahlen ab", () => {
    expect(ItemDataSchema.safeParse({ ...valid, quantity: -1 }).success).toBe(false);
    expect(ItemDataSchema.safeParse({ ...valid, quantity: Number.NaN }).success).toBe(false);
    expect(ItemDataSchema.safeParse({ ...valid, quantity: Infinity }).success).toBe(false);
  });
  it("lehnt unbekannte Lagerorte ab", () => {
    expect(ItemDataSchema.safeParse({ ...valid, location: "keller" }).success).toBe(false);
  });
  it("lehnt zusätzliche, unbekannte Felder ab", () => {
    expect(ItemDataSchema.safeParse({ ...valid, admin: true }).success).toBe(false);
  });
  it("verlangt Sollmenge ≥ Mindestmenge", () => {
    expect(ItemDataSchema.safeParse({ ...valid, minQuantity: 5, targetQuantity: 2 }).success).toBe(
      false,
    );
  });
});
