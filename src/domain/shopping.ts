import { z } from "zod";
import {
  SECTION_IDS,
  convertUnit,
  sectionLabel,
  sectionOrder,
  unitInfo,
  type SectionId,
  type Unit,
} from "./constants.ts";
import { clampAmount, needsRestock, restockQuantity, type Item } from "./item.ts";

/**
 * Wie viel kommt beim Einkauf in den Vorrat – in der AKTUELLEN Einheit des Artikels?
 * Ein Listeneintrag kann noch die alte Einheit haben (z. B. kg), wenn der Artikel
 * inzwischen in g geführt wird. Nicht umrechenbar oder ohne Menge → null
 * (dann gilt die übliche Nachkauf-Menge).
 */
export function purchaseAmount(entry: ShoppingEntry, item: Item): number | null {
  if (item.mode !== "exact" || entry.quantity === null || entry.unit === null) return null;
  const converted = convertUnit(entry.quantity, entry.unit, item.unit);
  return converted === null ? null : clampAmount(converted);
}

/**
 * Ein Eintrag auf der Einkaufsliste.
 * - source "auto": automatisch angelegt, weil die Mindestmenge unterschritten ist
 * - source "manual": vom Nutzer hinzugefügt
 * Ist `itemId` gesetzt, wandert der Einkauf beim Abschließen in diesen Vorrats-Artikel.
 */
export interface ShoppingEntry {
  id: number;
  itemId: number | null;
  name: string;
  section: SectionId;
  quantity: number | null;
  unit: Unit | null;
  checked: boolean;
  source: "auto" | "manual";
  createdAt: number;
}

export type NewShoppingEntry = Omit<ShoppingEntry, "id">;

export const ManualEntrySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Bitte einen Namen eingeben.")
      .max(60, "Name ist zu lang (max. 60 Zeichen)."),
    section: z.enum(SECTION_IDS),
  })
  .strict();

export type SyncAction =
  | { type: "none" }
  | { type: "create"; entry: NewShoppingEntry }
  | { type: "update"; id: number; changes: Partial<NewShoppingEntry> }
  | { type: "delete"; id: number };

function autoEntryValues(item: Item) {
  return {
    name: item.name,
    section: item.section,
    quantity: item.mode === "exact" ? restockQuantity(item) : null,
    unit: item.mode === "exact" ? item.unit : null,
  };
}

/**
 * Entscheidet, was nach einer Änderung am Artikel mit der Einkaufsliste passieren soll.
 * Reine Funktion (ohne Datenbank), damit sie gründlich getestet werden kann.
 *
 * @param entries alle Einträge, die zu diesem Artikel gehören
 */
export function planShoppingSync(
  item: Item,
  entries: readonly ShoppingEntry[],
  now: number,
): SyncAction {
  const openAuto = entries.find((e) => e.source === "auto" && !e.checked);

  if (!needsRestock(item)) {
    // Wieder genug da → automatischen Eintrag entfernen (manuelle bleiben)
    return openAuto ? { type: "delete", id: openAuto.id } : { type: "none" };
  }

  const wanted = autoEntryValues(item);
  if (openAuto) {
    const changed =
      openAuto.name !== wanted.name ||
      openAuto.section !== wanted.section ||
      openAuto.quantity !== wanted.quantity ||
      openAuto.unit !== wanted.unit;
    return changed ? { type: "update", id: openAuto.id, changes: wanted } : { type: "none" };
  }

  // Schon auf der Liste (manuell oder bereits im Einkaufswagen) → nichts doppelt anlegen
  if (entries.length > 0) return { type: "none" };

  return {
    type: "create",
    entry: { ...wanted, itemId: item.id, checked: false, source: "auto", createdAt: now },
  };
}

/** Eintrag, wenn ein bestehender Vorrats-Artikel von Hand auf die Liste gesetzt wird */
export function manualEntryForItem(item: Item, now: number): NewShoppingEntry {
  return {
    itemId: item.id,
    name: item.name,
    section: item.section,
    quantity: item.mode === "exact" ? restockQuantity(item) : null,
    unit: item.mode === "exact" ? item.unit : null,
    checked: false,
    source: "manual",
    createdAt: now,
  };
}

export interface SectionGroup {
  section: SectionId;
  label: string;
  entries: ShoppingEntry[];
}

/** Gruppiert die Liste nach Supermarkt-Abteilung (in Laufreihenfolge), innerhalb alphabetisch */
export function groupBySection(entries: readonly ShoppingEntry[]): SectionGroup[] {
  const groups = new Map<SectionId, ShoppingEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.section) ?? [];
    list.push(entry);
    groups.set(entry.section, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => sectionOrder(a) - sectionOrder(b))
    .map(([section, list]) => ({
      section,
      label: sectionLabel(section),
      entries: list.sort((a, b) => a.name.localeCompare(b.name, "de")),
    }));
}

/** Menge für die Anzeige auf der Einkaufsliste, z. B. "2 Stk" */
export function entryAmountText(entry: ShoppingEntry): string | null {
  if (entry.quantity === null || entry.unit === null) return null;
  const formatted = new Intl.NumberFormat("de-AT", { maximumFractionDigits: 3 }).format(
    entry.quantity,
  );
  return `${formatted} ${unitInfo(entry.unit).short}`;
}
