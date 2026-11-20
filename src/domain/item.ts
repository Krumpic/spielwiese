import { z } from "zod";
import {
  LEVEL_IDS,
  LOCATION_IDS,
  SECTION_IDS,
  UNIT_IDS,
  levelRank,
  nextLevel,
  unitInfo,
  type Level,
  type LocationId,
  type SectionId,
  type Unit,
} from "./constants.ts";
import { BarcodeSchema } from "./barcode.ts";
import { ExpiryDateSchema } from "./expiry.ts";

export type StockMode = "exact" | "level";

/**
 * Ein Lebensmittel im Vorrat.
 * Je nach `mode` zählen die Felder für "genau" (quantity, unit, min/target)
 * oder für "grob" (level, minLevel). Die jeweils anderen bleiben gespeichert,
 * damit beim Umschalten nichts verloren geht.
 */
export interface Item {
  id: number;
  name: string;
  location: LocationId;
  section: SectionId;
  mode: StockMode;
  quantity: number;
  unit: Unit;
  level: Level;
  /** Fällt `quantity` unter diesen Wert, muss nachgekauft werden */
  minQuantity: number | null;
  /** So viel soll normalerweise daheim sein (bestimmt die Einkaufsmenge) */
  targetQuantity: number | null;
  /** Ab diesem Füllstand (inklusive) muss nachgekauft werden */
  minLevel: Level | null;
  /** Nächstes Ablaufdatum "JJJJ-MM-TT" (seit Schema v4); null = keins */
  expiresOn: string | null;
  /** Barcode (EAN/UPC), um den Artikel beim Scannen wiederzufinden (seit Schema v5) */
  barcode: string | null;
  createdAt: number;
  updatedAt: number;
}

export type ItemData = Omit<Item, "id" | "createdAt" | "updatedAt">;

/** Größte erlaubte Menge (gilt auch beim Backup-Import) */
export const MAX_AMOUNT = 100_000;
const amount = z
  .number({ error: "Bitte eine Zahl eingeben." })
  .min(0, "Darf nicht negativ sein.")
  .max(MAX_AMOUNT, "Zahl ist zu groß.");

const itemDataShape = {
  name: z
    .string()
    .trim()
    .min(1, "Bitte einen Namen eingeben.")
    .max(60, "Name ist zu lang (max. 60 Zeichen)."),
  location: z.enum(LOCATION_IDS),
  section: z.enum(SECTION_IDS),
  mode: z.enum(["exact", "level"]),
  quantity: amount,
  unit: z.enum(UNIT_IDS),
  level: z.enum(LEVEL_IDS),
  minQuantity: amount.nullable(),
  targetQuantity: amount.nullable(),
  minLevel: z.enum(LEVEL_IDS).nullable(),
  expiresOn: ExpiryDateSchema.nullable(),
  barcode: BarcodeSchema.nullable(),
};

const targetNotBelowMin = (d: { minQuantity: number | null; targetQuantity: number | null }) =>
  d.minQuantity === null || d.targetQuantity === null || d.targetQuantity >= d.minQuantity;
const targetNotBelowMinError = {
  message: "Die Sollmenge muss mindestens so groß wie die Mindestmenge sein.",
  path: ["targetQuantity"],
};

/** Prüft alle Daten, bevor sie gespeichert werden. */
export const ItemDataSchema = z
  .object(itemDataShape)
  .strict()
  .refine(targetNotBelowMin, targetNotBelowMinError);

/** Zeitstempel in Millisekunden (zwischen 2000 und 2200) */
export const timestamp = z.number().int().min(946_684_800_000).max(7_258_118_400_000);
/** Datenbank-ID */
export const recordId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

/** Prüft einen vollständigen, gespeicherten Artikel (z. B. aus einem Backup). */
export const StoredItemSchema = z
  .object({ ...itemDataShape, id: recordId, createdAt: timestamp, updatedAt: timestamp })
  .strict()
  .refine(targetNotBelowMin, targetNotBelowMinError);

/** Rundet auf 3 Nachkommastellen (vermeidet 0.1 + 0.2 = 0.30000000000000004) */
export function roundAmount(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Muss dieser Artikel nachgekauft werden? */
export function needsRestock(item: Item): boolean {
  if (item.mode === "exact") {
    return item.minQuantity !== null && item.quantity < item.minQuantity;
  }
  return item.minLevel !== null && levelRank(item.level) <= levelRank(item.minLevel);
}

/**
 * Wie viel soll eingekauft werden? (nur bei "genau")
 * Ziel ist die Sollmenge – ist keine gesetzt, die Mindestmenge.
 * Mindestens eine Schrittweite, damit nie "0" auf der Liste steht.
 */
export function restockQuantity(item: Item): number {
  const target = item.targetQuantity ?? item.minQuantity ?? 0;
  const missing = roundAmount(target - item.quantity);
  return missing > 0 ? missing : unitInfo(item.unit).step;
}

/** Ist nichts mehr da? */
export function isEmpty(item: Item): boolean {
  return item.mode === "exact" ? item.quantity <= 0 : item.level === "empty";
}

/** Ist ein Artikel leer, gehört sein Ablaufdatum zur verbrauchten Packung → löschen */
export function clearExpiryIfEmpty(item: Item): Item {
  return isEmpty(item) && item.expiresOn !== null ? { ...item, expiresOn: null } : item;
}

/**
 * Vorrat nach dem Einkauf.
 * War der Artikel leer, gilt das alte Ablaufdatum nicht mehr (neue Packung);
 * war noch etwas da, bleibt das frühere Datum der älteren Packung stehen.
 */
export function applyPurchase(item: Item, purchased: number | null, now: number): Item {
  const fresh = clearExpiryIfEmpty(item);
  if (fresh.mode === "level") {
    return { ...fresh, level: "full", updatedAt: now };
  }
  const added = purchased ?? restockQuantity(fresh);
  return { ...fresh, quantity: clampAmount(fresh.quantity + added), updatedAt: now };
}

/**
 * Hält Mengen im gültigen Bereich 0 … MAX_AMOUNT.
 * Wichtig: Sonst könnte eine Menge über die Grenze wachsen, die der Backup-Import erlaubt –
 * und ein Backup ließe sich nicht mehr einspielen.
 */
export function clampAmount(n: number): number {
  return Math.min(MAX_AMOUNT, Math.max(0, roundAmount(n)));
}

/** +/- Knopf: eine Schrittweite der Einheit, nie unter 0 und nie über die Obergrenze */
export function adjustQuantity(item: Item, direction: 1 | -1, now: number): Item {
  const changed = clampAmount(item.quantity + direction * unitInfo(item.unit).step);
  return clearExpiryIfEmpty({ ...item, quantity: changed, updatedAt: now });
}

/** Füllstand antippen: voll → halb → wenig → leer → voll */
export function cycleLevel(item: Item, now: number): Item {
  return clearExpiryIfEmpty({ ...item, level: nextLevel(item.level), updatedAt: now });
}

const numberFormat = new Intl.NumberFormat("de-AT", { maximumFractionDigits: 3 });

export function formatQuantity(quantity: number, unit: Unit): string {
  return `${numberFormat.format(quantity)} ${unitInfo(unit).short}`;
}

/**
 * Liest eine Zahl aus einem Eingabefeld (Komma oder Punkt erlaubt).
 * Leer → null, ungültig → NaN (wird von der Prüfung abgelehnt).
 */
export function parseDecimal(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  // Erlaubt: Ziffern, optional genau ein Komma/Punkt mit Ziffern davor und danach
  const normalized = trimmed.replace(",", ".");
  const parts = normalized.split(".");
  const valid = parts.length <= 2 && parts.every((part) => /^[0-9]+$/.test(part));
  return valid ? Number(normalized) : Number.NaN;
}
