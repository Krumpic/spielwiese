import { z } from "zod";

/**
 * Barcodes auf Lebensmitteln: EAN-8, UPC-A (12), EAN-13, GTIN-14.
 * Die letzte Ziffer ist eine Prüfziffer – damit werden Fehl-Scans und Tippfehler erkannt.
 */
export function hasValidChecksum(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = Array.from(code, Number); // nur Ziffern (oben geprüft)
  const check = digits.pop();
  // Von rechts: abwechselnd ×3 und ×1
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export const BarcodeSchema = z
  .string()
  .regex(/^\d{8}$|^\d{12,14}$/, "Ein Barcode hat 8, 12, 13 oder 14 Ziffern.")
  .refine(hasValidChecksum, "Dieser Barcode ist ungültig (Prüfziffer stimmt nicht).");

/** Entfernt Leerzeichen und Bindestriche aus einer Eingabe */
export function normalizeBarcode(input: string): string {
  return input.replace(/[\s-]/g, "");
}
