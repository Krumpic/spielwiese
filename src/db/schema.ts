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

/** Aktuelle Schema-Version – bei jeder neuen Version hochzählen (Test prüft das). */
export const SCHEMA_VERSION = 2;

/** Einfache Einstellungen/Merkwerte, z. B. Zeitpunkt des letzten Backups */
export interface MetaEntry {
  key: MetaKey;
  value: number;
}
export type MetaKey = "lastBackupAt";

export class KornspeicherDB extends Dexie {
  // `declare` statt Feld-Initialisierung: sonst überschreibt die Klasse Dexies Tabellen
  declare items: EntityTable<Item, "id">;
  declare shopping: EntityTable<ShoppingEntry, "id">;
  declare meta: EntityTable<MetaEntry, "key">;

  constructor(name: string = DB_NAME) {
    super(name);

    // ---------- Version 1 (Phase 1): Vorrat + Einkaufsliste ----------
    // Nur indizierte Felder stehen hier; alle anderen Felder werden trotzdem gespeichert.
    // Hinweis: boolesche Felder (checked) sind in IndexedDB nicht indizierbar.
    this.version(1).stores({
      items: "++id, name, location, section",
      shopping: "++id, itemId, section",
    });

    // ---------- Version 2 (Phase 2): Tabelle für Merkwerte (letztes Backup) ----------
    // Nur eine neue Tabelle; bestehende Daten bleiben unverändert → kein upgrade() nötig.
    this.version(2).stores({
      meta: "key",
    });
  }
}

export const db = new KornspeicherDB();
