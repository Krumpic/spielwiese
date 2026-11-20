import { describe, expect, it } from "vitest";
import {
  MAX_BACKUP_BYTES,
  backupFileName,
  createBackup,
  daysSince,
  isBackupOverdue,
  parseBackup,
} from "./backup.ts";
import { makeEntry, makeItem } from "./testing.ts";

const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);
const item = makeItem({ id: 1, createdAt: NOW, updatedAt: NOW });
const entry = makeEntry({ id: 10, itemId: 1, createdAt: NOW });
const valid = () =>
  JSON.parse(JSON.stringify(createBackup([item], [entry], NOW))) as Record<string, unknown>;
const parse = (value: unknown) => parseBackup(JSON.stringify(value));

describe("Backup – Hin und zurück", () => {
  it("ein exportiertes Backup lässt sich unverändert wieder einlesen", () => {
    const result = parse(valid());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.items).toEqual([item]);
      expect(result.backup.shopping).toEqual([entry]);
    }
  });

  it("leeres Backup ist gültig", () => {
    expect(parse(createBackup([], [], NOW)).ok).toBe(true);
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
