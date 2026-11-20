import { describe, expect, it } from "vitest";
import {
  MAX_BACKUP_BYTES,
  backupFileName,
  createBackup,
  daysSince,
  isBackupOverdue,
  parseBackup,
} from "./backup.ts";
import type { Item } from "./item.ts";
import type { Recipe } from "./recipe.ts";
import { makeEntry, makeItem } from "./testing.ts";

const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);
const item = makeItem({ id: 1, createdAt: NOW, updatedAt: NOW });
const entry = makeEntry({ id: 10, itemId: 1, createdAt: NOW });
const recipe: Recipe = {
  id: 3,
  name: "Milchreis",
  servings: 2,
  ingredients: [{ itemId: 1, quantity: 0.5, unit: "l", basic: false }],
  steps: ["Milch aufkochen", "Reis einrühren"],
  createdAt: NOW,
  updatedAt: NOW,
};
const valid = () =>
  JSON.parse(
    JSON.stringify(createBackup({ items: [item], shopping: [entry], recipes: [recipe] }, NOW)),
  ) as Record<string, unknown>;
const parse = (value: unknown) => parseBackup(JSON.stringify(value));

describe("Backup – Hin und zurück", () => {
  it("ein exportiertes Backup lässt sich unverändert wieder einlesen", () => {
    const result = parse(valid());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.items).toEqual([item]);
      expect(result.backup.shopping).toEqual([entry]);
      expect(result.backup.recipes).toEqual([recipe]);
    }
  });

  it("leeres Backup ist gültig", () => {
    expect(parse(createBackup({ items: [], shopping: [], recipes: [] }, NOW)).ok).toBe(true);
  });

  // Artikel im Format vor Backup v3 – ohne Ablaufdatum (eingefroren)
  const legacyItem: Partial<Item> = { ...item };
  delete legacyItem.expiresOn;
  delete legacyItem.barcode;

  it("altes Backup (Format v1, Phase 2) lässt sich weiterhin importieren", () => {
    const v1 = {
      format: "kornspeicher-backup",
      version: 1,
      exportedAt: NOW,
      items: [legacyItem],
      shopping: [entry],
    };
    const result = parse(v1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.version).toBe(4);
      expect(result.backup.items).toEqual([{ ...legacyItem, expiresOn: null, barcode: null }]);
      expect(result.backup.recipes).toEqual([]);
    }
  });

  it("altes Backup (Format v2, Phase 3) lässt sich weiterhin importieren", () => {
    const v2 = {
      format: "kornspeicher-backup",
      version: 2,
      exportedAt: NOW,
      items: [legacyItem],
      shopping: [entry],
      recipes: [recipe],
    };
    const result = parse(v2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.items).toEqual([{ ...legacyItem, expiresOn: null, barcode: null }]);
      expect(result.backup.recipes).toEqual([recipe]);
    }
  });

  it("altes Backup (Format v3, mit Ablaufdatum, ohne Barcode) lässt sich importieren", () => {
    const v3 = {
      format: "kornspeicher-backup",
      version: 3,
      exportedAt: NOW,
      items: [{ ...legacyItem, expiresOn: "2026-12-01" }],
      shopping: [entry],
      recipes: [recipe],
    };
    const result = parse(v3);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.items).toEqual([
        { ...legacyItem, expiresOn: "2026-12-01", barcode: null },
      ]);
    }
  });

  it("Barcode wird mitgesichert und geprüft", () => {
    const ok = parse({ ...valid(), items: [{ ...item, barcode: "3017620422003" }] });
    expect(ok.ok && ok.backup.items[0]?.barcode).toBe("3017620422003");
    expect(parse({ ...valid(), items: [{ ...item, barcode: "3017620422004" }] }).ok).toBe(false);
    expect(parse({ ...valid(), items: [{ ...item, barcode: "<script>" }] }).ok).toBe(false);
  });

  it("Ablaufdatum wird mitgesichert und geprüft", () => {
    const withDate = { ...valid(), items: [{ ...item, expiresOn: "2026-12-24" }] };
    const result = parse(withDate);
    expect(result.ok && result.backup.items[0]?.expiresOn).toBe("2026-12-24");
    expect(parse({ ...valid(), items: [{ ...item, expiresOn: "2026-02-30" }] }).ok).toBe(false);
    expect(parse({ ...valid(), items: [{ ...item, expiresOn: "morgen" }] }).ok).toBe(false);
  });

  it("altes Backup v1 mit Manipulation wird trotzdem abgelehnt", () => {
    const v1 = {
      format: "kornspeicher-backup",
      version: 1,
      exportedAt: NOW,
      items: [{ ...legacyItem, quantity: -1 }],
      shopping: [],
    };
    expect(parse(v1).ok).toBe(false);
  });

  it("lehnt Rezepte ab, die auf unbekannte Artikel verweisen", () => {
    const bad = {
      ...valid(),
      recipes: [{ ...recipe, ingredients: [{ itemId: 99, quantity: 1, unit: "l", basic: false }] }],
    };
    const result = parse(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("unbekannten Artikel");
  });

  it("Dateiname enthält das Datum", () => {
    expect(backupFileName(new Date(2026, 0, 5).getTime())).toBe(
      "kornspeicher-backup-2026-01-05.json",
    );
  });
});

describe("Backup-Erinnerung", () => {
  const day = 24 * 60 * 60 * 1000;
  it("erinnert nicht, solange der Vorrat leer ist", () => {
    expect(isBackupOverdue(null, 0, NOW)).toBe(false);
  });
  it("erinnert, wenn noch nie gesichert wurde", () => {
    expect(isBackupOverdue(null, 3, NOW)).toBe(true);
  });
  it("erinnert erst nach 14 Tagen", () => {
    expect(isBackupOverdue(NOW - 13 * day, 3, NOW)).toBe(false);
    expect(isBackupOverdue(NOW - 14 * day, 3, NOW)).toBe(true);
  });
  it("zählt volle Tage", () => {
    expect(daysSince(NOW - 2.5 * day, NOW)).toBe(2);
  });
});

describe("Backup – Schutz vor kaputten oder manipulierten Dateien", () => {
  const expectError = (value: unknown, text?: string) => {
    const result = typeof value === "string" ? parseBackup(value) : parse(value);
    expect(result.ok).toBe(false);
    if (!result.ok && text) expect(result.error).toContain(text);
  };

  it("lehnt Nicht-JSON ab", () => {
    expectError("hallo welt", "kein gültiges Backup");
  });
  it("lehnt fremde JSON-Dateien ab", () => {
    expectError({ foo: 1 }, "keine Kornspeicher-Backup-Datei");
  });
  it("lehnt zu große Dateien ab, ohne sie einzulesen", () => {
    expectError(" ".repeat(MAX_BACKUP_BYTES + 1), "zu groß");
  });
  it("lehnt Backups einer neueren App-Version ab", () => {
    expectError({ ...valid(), version: 99 }, "neueren App-Version");
  });
  it("lehnt unbekannte Felder ab (z. B. __proto__-Tricks)", () => {
    expectError(
      '{"format":"kornspeicher-backup","version":1,"exportedAt":1763640000000,"items":[],"shopping":[],"__proto__":{"admin":true}}',
    );
  });
  it("lehnt ungültige Artikel ab", () => {
    expectError({ ...valid(), items: [{ ...item, quantity: -5 }] });
    expectError({ ...valid(), items: [{ ...item, location: "keller" }] });
    expectError({ ...valid(), items: [{ ...item, name: "x".repeat(500) }] });
    expectError({ ...valid(), items: [{ ...item, id: "1; DROP TABLE" }] });
  });
  it("lehnt doppelte IDs ab", () => {
    expectError({ ...valid(), items: [item, item] }, "Doppelte Artikel-ID");
  });
  it("lehnt Listeneinträge ab, die auf fehlende Artikel zeigen", () => {
    expectError({ ...valid(), shopping: [{ ...entry, itemId: 999 }] }, "unbekannten Artikel");
  });
  it("lehnt zu viele Artikel ab", () => {
    const many = Array.from({ length: 5001 }, (_, i) => ({ ...item, id: i + 1 }));
    expectError({ ...valid(), items: many, shopping: [] });
  });
});
