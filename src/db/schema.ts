import Dexie, { type EntityTable } from "dexie";
import type { Item } from "../domain/item.ts";
import type { ShoppingEntry } from "../domain/shopping.ts";

/**
 * Datenbank-Schema (IndexedDB über Dexie).
 *
 * ⚠️ REGELN (siehe CLAUDE.md, Abschnitt 4):
 * - Bestehende Versionen NIEMALS ändern oder löschen – die Daten liegen auf dem iPhone.
 * - Jede Änderung = neue Version mit höherer Nummer, bei Datenumformung mit `.upgrade()`.
 * - Für jede Migration einen Test schreiben.
 *
 * Eindeutiger Name, weil sich alle GitHub-Pages-Projekte eines Accounts eine Origin teilen.
 */
export const DB_NAME = "kornspeicher-db";

export class KornspeicherDB extends Dexie {
  // `declare` statt Feld-Initialisierung: sonst überschreibt die Klasse Dexies Tabellen
  declare items: EntityTable<Item, "id">;
  declare shopping: EntityTable<ShoppingEntry, "id">;

  constructor(name: string = DB_NAME) {
    super(name);

    // ---------- Version 1 (Phase 1): Vorrat + Einkaufsliste ----------
    // Nur indizierte Felder stehen hier; alle anderen Felder werden trotzdem gespeichert.
    // Hinweis: boolesche Felder (checked) sind in IndexedDB nicht indizierbar.
    this.version(1).stores({
      items: "++id, name, location, section",
      shopping: "++id, itemId, section",
    });
  }
}

export const db = new KornspeicherDB();
