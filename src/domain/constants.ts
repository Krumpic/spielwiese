/**
 * Feste Auswahllisten der App: Lagerorte, Supermarkt-Abteilungen, Einheiten und Füllstände.
 *
 * ⚠️ Die IDs (z. B. "fridge") werden in der Datenbank gespeichert.
 *    Niemals umbenennen oder löschen – nur neue hinzufügen (sonst Migration nötig).
 *    Die Texte (label) dürfen jederzeit geändert werden.
 */

// ---------- Lagerorte ----------
export const LOCATION_IDS = ["pantry", "fridge", "freezer"] as const;
export type LocationId = (typeof LOCATION_IDS)[number];

/**
 * ­ = weiches Trennzeichen: unsichtbar – nur wenn das Wort auf einem schmalen
 * Bildschirm umbrechen muss, wird dort getrennt („Vorrats-schrank" statt „Vorratssch-rank").
 */
const LOCATION_LABELS: ReadonlyMap<LocationId, string> = new Map([
  ["pantry", "Vorrats­schrank"],
  ["fridge", "Kühl­schrank"],
  ["freezer", "Tief­kühler"],
]);

export function locationLabel(id: LocationId): string {
  return LOCATION_LABELS.get(id) ?? id;
}

// ---------- Supermarkt-Abteilungen (Reihenfolge = typischer Weg durch den Markt) ----------
export const SECTION_IDS = [
  "produce",
  "bakery",
  "dairy",
  "meat",
  "frozen",
  "staples",
  "canned",
  "spices",
  "breakfast",
  "drinks",
  "other",
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

const SECTION_LABELS: ReadonlyMap<SectionId, string> = new Map([
  ["produce", "Obst & Gemüse"],
  ["bakery", "Brot & Gebäck"],
  ["dairy", "Milchprodukte & Eier"],
  ["meat", "Fleisch, Wurst & Fisch"],
  ["frozen", "Tiefkühl"],
  ["staples", "Nudeln, Reis & Mehl"],
  ["canned", "Konserven & Fertiggerichte"],
  ["spices", "Gewürze, Öl & Saucen"],
  ["breakfast", "Frühstück & Süßes"],
  ["drinks", "Getränke"],
  ["other", "Sonstiges"],
]);

export function sectionLabel(id: SectionId): string {
  return SECTION_LABELS.get(id) ?? id;
}

export function sectionOrder(id: SectionId): number {
  return SECTION_IDS.indexOf(id);
}

// ---------- Einheiten ----------
export const UNIT_IDS = [
  "piece",
  "g",
  "kg",
  "ml",
  "l",
  "pack",
  "can",
  "bottle",
  "jar",
  "bunch",
] as const;
export type Unit = (typeof UNIT_IDS)[number];

interface UnitInfo {
  /** Kurzform hinter der Zahl, z. B. "2 Stk" */
  short: string;
  /** Langform für Auswahllisten */
  long: string;
  /** Schrittweite der +/- Knöpfe */
  step: number;
}

const UNITS: ReadonlyMap<Unit, UnitInfo> = new Map([
  ["piece", { short: "Stk", long: "Stück", step: 1 }],
  ["g", { short: "g", long: "Gramm (g)", step: 50 }],
  ["kg", { short: "kg", long: "Kilogramm (kg)", step: 0.5 }],
  ["ml", { short: "ml", long: "Milliliter (ml)", step: 100 }],
  ["l", { short: "l", long: "Liter (l)", step: 0.5 }],
  ["pack", { short: "Pkg", long: "Packung", step: 1 }],
  ["can", { short: "Dose", long: "Dose", step: 1 }],
  ["bottle", { short: "Fl.", long: "Flasche", step: 1 }],
  ["jar", { short: "Glas", long: "Glas", step: 1 }],
  ["bunch", { short: "Bund", long: "Bund", step: 1 }],
]);

const FALLBACK_UNIT: UnitInfo = { short: "", long: "", step: 1 };

export function unitInfo(unit: Unit): UnitInfo {
  return UNITS.get(unit) ?? FALLBACK_UNIT;
}

/** Umrechenbare Einheiten: Faktor zur Basiseinheit (g bzw. ml) */
const UNIT_BASE: ReadonlyMap<Unit, { dimension: "mass" | "volume"; factor: number }> = new Map([
  ["g", { dimension: "mass", factor: 1 }],
  ["kg", { dimension: "mass", factor: 1000 }],
  ["ml", { dimension: "volume", factor: 1 }],
  ["l", { dimension: "volume", factor: 1000 }],
] as const);

/**
 * Rechnet eine Menge in eine andere Einheit um (g↔kg, ml↔l).
 * Gleiche Einheit → unverändert. Nicht umrechenbar (z. B. Stück → g) → null.
 */
export function convertUnit(quantity: number, from: Unit, to: Unit): number | null {
  if (from === to) return quantity;
  const a = UNIT_BASE.get(from);
  const b = UNIT_BASE.get(to);
  if (!a || !b) return null;
  if (a.dimension !== b.dimension) return null;
  return Math.round(((quantity * a.factor) / b.factor) * 1000) / 1000;
}

/** Einheiten, in die sich `unit` umrechnen lässt (inklusive sich selbst) */
export function compatibleUnits(unit: Unit): Unit[] {
  return UNIT_IDS.filter((other) => convertUnit(1, unit, other) !== null);
}

// ---------- Füllstände (grobe Schätzung) ----------
/** Reihenfolge von voll nach leer */
export const LEVEL_IDS = ["full", "half", "low", "empty"] as const;
export type Level = (typeof LEVEL_IDS)[number];

const LEVEL_LABELS: ReadonlyMap<Level, string> = new Map([
  ["full", "voll"],
  ["half", "halb"],
  ["low", "wenig"],
  ["empty", "leer"],
]);

export function levelLabel(level: Level): string {
  return LEVEL_LABELS.get(level) ?? level;
}

/** 3 = voll … 0 = leer */
export function levelRank(level: Level): number {
  return LEVEL_IDS.length - 1 - LEVEL_IDS.indexOf(level);
}

/** Nächster Füllstand beim Antippen: voll → halb → wenig → leer → voll */
export function nextLevel(level: Level): Level {
  const next = LEVEL_IDS[(LEVEL_IDS.indexOf(level) + 1) % LEVEL_IDS.length];
  return next ?? "full";
}

// ---------- Typ-Prüfungen für Werte aus Formularen ----------
export const isLocationId = (v: string): v is LocationId =>
  (LOCATION_IDS as readonly string[]).includes(v);
export const isSectionId = (v: string): v is SectionId =>
  (SECTION_IDS as readonly string[]).includes(v);
export const isUnit = (v: string): v is Unit => (UNIT_IDS as readonly string[]).includes(v);
export const isLevel = (v: string): v is Level => (LEVEL_IDS as readonly string[]).includes(v);
