import type { Item } from "./item.ts";
import type { ShoppingEntry } from "./shopping.ts";

/** Testdaten-Fabriken (nur für Tests) */
export function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    name: "Milch",
    location: "fridge",
    section: "dairy",
    mode: "exact",
    quantity: 1,
    unit: "l",
    level: "full",
    minQuantity: null,
    targetQuantity: null,
    minLevel: null,
    expiresOn: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

export function makeEntry(overrides: Partial<ShoppingEntry> = {}): ShoppingEntry {
  return {
    id: 10,
    itemId: 1,
    name: "Milch",
    section: "dairy",
    quantity: 2,
    unit: "l",
    checked: false,
    source: "auto",
    createdAt: 0,
    ...overrides,
  };
}
