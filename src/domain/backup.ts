import { z } from "zod";
import { SECTION_IDS, UNIT_IDS } from "./constants.ts";
import { StoredItemSchema, recordId, timestamp, type Item } from "./item.ts";
import type { ShoppingEntry } from "./shopping.ts";

/**
 * Backup-Format (Export/Import).
 *
 * ⚠️ Das Format hat eine eigene Versionsnummer (unabhängig vom Datenbank-Schema).
 *    Ändert sich das Format, BACKUP_VERSION erhöhen und in `upgradeBackup` dafür sorgen,
 *    dass ältere Backups weiterhin importiert werden können (siehe CLAUDE.md, Abschnitt 4).
 */
export const BACKUP_FORMAT = "kornspeicher-backup";
export const BACKUP_VERSION = 1;

/** Obergrenzen gegen absichtlich riesige oder kaputte Dateien */
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
const MAX_ITEMS = 5_000;
const MAX_ENTRIES = 5_000;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: number;
  items: Item[];
  shopping: ShoppingEntry[];
}

const StoredShoppingEntrySchema = z
  .object({
    id: recordId,
    itemId: recordId.nullable(),
    name: z.string().trim().min(1).max(60),
    section: z.enum(SECTION_IDS),
    quantity: z.number().min(0).max(100_000).nullable(),
    unit: z.enum(UNIT_IDS).nullable(),
    checked: z.boolean(),
    source: z.enum(["auto", "manual"]),
    createdAt: timestamp,
  })
  .strict();

const BackupV1Schema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    version: z.literal(1),
    exportedAt: timestamp,
    items: z.array(StoredItemSchema).max(MAX_ITEMS),
    shopping: z.array(StoredShoppingEntrySchema).max(MAX_ENTRIES),
  })
  .strict()
  .superRefine((backup, ctx) => {
    // IDs müssen eindeutig sein …
    const itemIds = new Set<number>();
    for (const item of backup.items) {
      if (itemIds.has(item.id)) {
        ctx.addIssue({ code: "custom", message: "Doppelte Artikel-ID im Backup." });
        return;
      }
      itemIds.add(item.id);
    }
    const entryIds = new Set<number>();
    for (const entry of backup.shopping) {
      if (entryIds.has(entry.id)) {
        ctx.addIssue({ code: "custom", message: "Doppelte Listen-ID im Backup." });
        return;
      }
      entryIds.add(entry.id);
      // … und Listeneinträge dürfen nur auf vorhandene Artikel zeigen
      if (entry.itemId !== null && !itemIds.has(entry.itemId)) {
        ctx.addIssue({
          code: "custom",
          message: "Listeneintrag verweist auf unbekannten Artikel.",
        });
        return;
      }
    }
  });

export function createBackup(
  items: readonly Item[],
  shopping: readonly ShoppingEntry[],
  now: number,
): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now,
    items: [...items],
    shopping: [...shopping],
  };
}

/** Nach so vielen Tagen ohne Backup erinnert die App daran */
export const BACKUP_REMINDER_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export function daysSince(timestamp: number, now: number): number {
  return Math.max(0, Math.floor((now - timestamp) / DAY_MS));
}

/** Erinnern, sobald Daten da sind und noch nie bzw. zu lange nicht gesichert wurde */
export function isBackupOverdue(
  lastBackupAt: number | null,
  itemCount: number,
  now: number,
): boolean {
  if (itemCount === 0) return false;
  return lastBackupAt === null || daysSince(lastBackupAt, now) >= BACKUP_REMINDER_DAYS;
}

export function backupFileName(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `kornspeicher-backup-${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

export type ParseResult = { ok: true; backup: Backup } | { ok: false; error: string };

/**
 * Liest und prüft eine Backup-Datei. Wirft nie – gibt bei Problemen eine
 * verständliche Meldung zurück (ohne technische Details).
 */
export function parseBackup(text: string): ParseResult {
  if (text.length > MAX_BACKUP_BYTES) {
    return { ok: false, error: "Die Datei ist zu groß für ein Kornspeicher-Backup." };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "Die Datei ist kein gültiges Backup (kein lesbares Format)." };
  }

  const header = z
    .object({ format: z.literal(BACKUP_FORMAT), version: z.number().int() })
    .safeParse(raw);
  if (!header.success) {
    return { ok: false, error: "Das ist keine Kornspeicher-Backup-Datei." };
  }
  if (header.data.version > BACKUP_VERSION) {
    return {
      ok: false,
      error:
        "Dieses Backup stammt von einer neueren App-Version. Bitte die App zuerst aktualisieren.",
    };
  }

  const result = BackupV1Schema.safeParse(upgradeBackup(raw));
  if (!result.success) {
    const custom = result.error.issues.find((issue) => issue.code === "custom");
    return {
      ok: false,
      error: custom?.message ?? "Das Backup ist beschädigt oder enthält ungültige Daten.",
    };
  }
  return { ok: true, backup: result.data };
}

/**
 * Bringt ältere Backup-Versionen auf den aktuellen Stand.
 * Aktuell gibt es nur Version 1 – künftige Versionen werden hier Schritt für Schritt umgewandelt.
 */
function upgradeBackup(raw: unknown): unknown {
  return raw;
}
