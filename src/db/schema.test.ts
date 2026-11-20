import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { KornspeicherDB, SCHEMA_VERSION } from "./schema.ts";
import { makeItem } from "../domain/testing.ts";

const TEST_DB = "kornspeicher-migration-test";

afterEach(async () => {
  await Dexie.delete(TEST_DB);
});

describe("Datenbank-Schema", () => {
  it("SCHEMA_VERSION passt zur höchsten deklarierten Version", () => {
    expect(new KornspeicherDB(TEST_DB).verno).toBe(SCHEMA_VERSION);
  });
});

describe("Migration v1 → aktuell", () => {
  it("behält alle Vorrats- und Listendaten und legt die neuen Tabellen an", async () => {
    // 1. Datenbank so anlegen, wie sie nach Phase 1 auf dem iPhone liegt (Schema v1, eingefroren)
    const v1 = new Dexie(TEST_DB);
    v1.version(1).stores({
      items: "++id, name, location, section",
      shopping: "++id, itemId, section",
    });
    const milk = makeItem({ id: 1, name: "Milch", quantity: 1, minQuantity: 2 });
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

    // 2. Mit der aktuellen App-Version öffnen → Migration läuft
    const current = new KornspeicherDB(TEST_DB);
    await current.open();

    expect(current.verno).toBe(SCHEMA_VERSION);
    expect(await current.items.toArray()).toEqual([milk]);
    expect(await current.shopping.toArray()).toEqual([entry]);

    // 3. Neue Tabellen sind nutzbar
    await current.meta.put({ key: "lastBackupAt", value: 123 });
    expect((await current.meta.get("lastBackupAt"))?.value).toBe(123);
    expect(await current.recipes.count()).toBe(0);
    current.close();
  });
});

describe("Migration v2 → v3", () => {
  it("behält Vorrat, Liste und Backup-Datum und legt die Rezepte-Tabelle an", async () => {
    // Stand nach Phase 2 (Schema v2, eingefroren)
    const v2 = new Dexie(TEST_DB);
    v2.version(1).stores({
      items: "++id, name, location, section",
      shopping: "++id, itemId, section",
    });
    v2.version(2).stores({ meta: "key" });
    const flour = makeItem({ id: 7, name: "Mehl", mode: "level", level: "half" });
    await v2.table("items").add(flour);
    await v2.table("meta").put({ key: "lastBackupAt", value: 999 });
    v2.close();

    const current = new KornspeicherDB(TEST_DB);
    await current.open();
    expect(current.verno).toBe(3);
    expect(await current.items.toArray()).toEqual([flour]);
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
