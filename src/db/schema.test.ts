import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { KornspeicherDB, SCHEMA_VERSION } from "./schema.ts";
import { makeItem } from "../domain/testing.ts";
import type { Item } from "../domain/item.ts";

const TEST_DB = "kornspeicher-migration-test";

afterEach(async () => {
  await Dexie.delete(TEST_DB);
});

/** Artikel im Format vor Schema v4 (ohne `expiresOn`/`barcode`) – so liegt er auf alten iPhones */
function legacyItem(overrides: Partial<Item>): Partial<Item> {
  const legacy: Partial<Item> = makeItem(overrides);
  delete legacy.expiresOn;
  delete legacy.barcode;
  return legacy;
}

/** Eingefrorene Schema-Definitionen früherer Versionen */
const FROZEN_V1 = { items: "++id, name, location, section", shopping: "++id, itemId, section" };
const FROZEN_V2 = { meta: "key" };
const FROZEN_V3 = { recipes: "++id, name" };
const FROZEN_V4 = { items: "++id, name, location, section, expiresOn" };

describe("Datenbank-Schema", () => {
  it("SCHEMA_VERSION passt zur höchsten deklarierten Version", () => {
    expect(new KornspeicherDB(TEST_DB).verno).toBe(SCHEMA_VERSION);
  });
});

describe("Migration v1 → aktuell", () => {
  it("behält alle Vorrats- und Listendaten und legt die neuen Tabellen an", async () => {
    // 1. Datenbank so anlegen, wie sie nach Phase 1 auf dem iPhone liegt
    const v1 = new Dexie(TEST_DB);
    v1.version(1).stores(FROZEN_V1);
    const milk = legacyItem({ id: 1, name: "Milch", quantity: 1, minQuantity: 2 });
    const entry = {
      id: 5,
      itemId: 1,
      name: "Milch",
      section: "dairy",
      quantity: 2,
      unit: "l",
      checked: false,
      source: "auto",
      createdAt: 0,
    };
    await v1.table("items").add(milk);
    await v1.table("shopping").add(entry);
    v1.close();

    // 2. Mit der aktuellen App-Version öffnen → alle Migrationen laufen nacheinander
    const current = new KornspeicherDB(TEST_DB);
    await current.open();

    expect(current.verno).toBe(SCHEMA_VERSION);
    expect(await current.items.toArray()).toEqual([{ ...milk, expiresOn: null, barcode: null }]);
    expect(await current.shopping.toArray()).toEqual([entry]);

    // 3. Neue Tabellen sind nutzbar
    await current.meta.put({ key: "lastBackupAt", value: 123 });
    expect((await current.meta.get("lastBackupAt"))?.value).toBe(123);
    expect(await current.recipes.count()).toBe(0);
    current.close();
  });
});

describe("Migration v2 → aktuell", () => {
  it("behält Vorrat und Backup-Datum und legt die Rezepte-Tabelle an", async () => {
    const v2 = new Dexie(TEST_DB);
    v2.version(1).stores(FROZEN_V1);
    v2.version(2).stores(FROZEN_V2);
    const flour = legacyItem({ id: 7, name: "Mehl", mode: "level", level: "half" });
    await v2.table("items").add(flour);
    await v2.table("meta").put({ key: "lastBackupAt", value: 999 });
    v2.close();

    const current = new KornspeicherDB(TEST_DB);
    await current.open();
    expect(current.verno).toBe(SCHEMA_VERSION);
    expect(await current.items.toArray()).toEqual([{ ...flour, expiresOn: null, barcode: null }]);
    expect((await current.meta.get("lastBackupAt"))?.value).toBe(999);

    const id = await current.recipes.add({
      name: "Palatschinken",
      servings: 2,
      ingredients: [{ itemId: 7, quantity: null, unit: null, basic: false }],
      steps: ["Teig rühren"],
      createdAt: 1,
      updatedAt: 1,
    });
    expect((await current.recipes.get(id))?.name).toBe("Palatschinken");
    current.close();
  });
});

describe("Migration v3 → aktuell (Ablaufdatum, Barcode)", () => {
  it("ergänzt expiresOn = null bei allen Artikeln, alles andere bleibt unverändert", async () => {
    const v3 = new Dexie(TEST_DB);
    v3.version(1).stores(FROZEN_V1);
    v3.version(2).stores(FROZEN_V2);
    v3.version(3).stores(FROZEN_V3);
    const items = [
      legacyItem({ id: 1, name: "Milch" }),
      legacyItem({ id: 2, name: "Reis", location: "pantry", quantity: 2, unit: "kg" }),
    ];
    const recipe = {
      id: 4,
      name: "Milchreis",
      servings: 2,
      ingredients: [{ itemId: 1, quantity: 0.5, unit: "l", basic: false }],
      steps: ["Kochen"],
      createdAt: 1,
      updatedAt: 1,
    };
    await v3.table("items").bulkAdd(items);
    await v3.table("recipes").add(recipe);
    await v3.table("meta").put({ key: "theme", value: "ocean" });
    v3.close();

    const current = new KornspeicherDB(TEST_DB);
    await current.open();
    expect(current.verno).toBe(SCHEMA_VERSION);
    expect(await current.items.toArray()).toEqual(
      items.map((i) => ({ ...i, expiresOn: null, barcode: null })),
    );
    expect(await current.recipes.toArray()).toEqual([recipe]);
    expect((await current.meta.get("theme"))?.value).toBe("ocean");

    // Neuer Index funktioniert
    await current.items.update(1, { expiresOn: "2026-11-22" });
    const soon = await current.items.where("expiresOn").belowOrEqual("2026-11-23").toArray();
    expect(soon.map((i) => i.name)).toEqual(["Milch"]);
    current.close();
  });
});

describe("Migration v4 → v5 (Barcode)", () => {
  it("ergänzt barcode = null, Ablaufdaten bleiben erhalten, Barcode-Suche funktioniert", async () => {
    const v4 = new Dexie(TEST_DB);
    v4.version(1).stores(FROZEN_V1);
    v4.version(2).stores(FROZEN_V2);
    v4.version(3).stores(FROZEN_V3);
    v4.version(4).stores(FROZEN_V4);
    const yoghurt: Partial<Item> = makeItem({ id: 1, name: "Joghurt", expiresOn: "2026-11-25" });
    delete yoghurt.barcode;
    await v4.table("items").add(yoghurt);
    v4.close();

    const current = new KornspeicherDB(TEST_DB);
    await current.open();
    expect(current.verno).toBe(5);
    expect(await current.items.toArray()).toEqual([{ ...yoghurt, barcode: null }]);

    await current.items.update(1, { barcode: "3017620422003" });
    expect((await current.items.where("barcode").equals("3017620422003").first())?.name).toBe(
      "Joghurt",
    );
    current.close();
  });
});
