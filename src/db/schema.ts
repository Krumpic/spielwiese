import Dexie, { type EntityTable } from "dexie";
import type { ColorMode, ThemeId } from "../domain/appearance.ts";
import type { Item } from "../domain/item.ts";
import type { Recipe } from "../domain/recipe.ts";
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
export const SCHEMA_VERSION = 4;

/**
 * Einfache Einstellungen/Merkwerte (Tabelle `meta`, Schlüssel = key).
 * Neue Schlüssel brauchen keine Migration – die Tabelle hat keinen weiteren Index.
 */
export type MetaEntry =
  | { key: "lastBackupAt"; value: number }
  | { key: "theme"; value: ThemeId }
  | { key: "colorMode"; value: ColorMode };
export type MetaKey = MetaEntry["key"];

export class KornspeicherDB extends Dexie {
  // `declare` statt Feld-Initialisierung: sonst überschreibt die Klasse Dexies Tabellen
  declare items: EntityTable<Item, "id">;
  declare shopping: EntityTable<ShoppingEntry, "id">;
  declare meta: EntityTable<MetaEntry, "key">;
  declare recipes: EntityTable<Recipe, "id">;

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

    // ---------- Version 3 (Phase 3): Rezepte ----------
    // Zutaten und Schritte liegen als Listen im Rezept. Nur neue Tabelle → kein upgrade() nötig.
    this.version(3).stores({
      recipes: "++id, name",
    });

    // ---------- Version 4 (Phase 4): Ablaufdatum ----------
    // Neues Feld `expiresOn` + Index (für „läuft bald ab"). Bestehende Artikel bekommen
    // ausdrücklich `null` (= kein Datum), damit jeder Artikel dem aktuellen Format entspricht.
    this.version(4)
      .stores({
        items: "++id, name, location, section, expiresOn",
      })
      .upgrade(async (tx) => {
        await tx
          .table("items")
          .toCollection()
          .modify((item: Record<string, unknown>) => {
            if (!("expiresOn" in item)) item["expiresOn"] = null;
          });
      });
  }
}

export const db = new KornspeicherDB();
