import { z } from "zod";
import { BarcodeSchema } from "./barcode.ts";

/**
 * Produktsuche über Open Food Facts (freie, gemeinnützige Lebensmittel-Datenbank).
 *
 * Datenschutz: Es wird NUR die Barcode-Nummer gesendet – keine Vorratsdaten,
 * keine Cookies, kein Referrer. Die Antwort gilt als nicht vertrauenswürdig und
 * wird streng geprüft, gekürzt und nur als Text angezeigt.
 *
 * ⚠️ Die Domain muss in der Content Security Policy (connect-src) erlaubt sein.
 */
export const OFF_ORIGIN = "https://world.openfoodfacts.org";
export const MAX_RESPONSE_CHARS = 100_000;
const MAX_NAME = 60;

/** Baut die Abfrage-Adresse – nur für gültige Barcodes (keine Einschleusung möglich) */
export function buildLookupUrl(barcode: string): string {
  const code = BarcodeSchema.parse(barcode);
  return `${OFF_ORIGIN}/api/v2/product/${code}.json?fields=product_name,product_name_de,brands,quantity`;
}

const optionalText = z.string().max(2000).optional().catch(undefined);

const ResponseSchema = z.object({
  status: z.number(),
  product: z
    .object({
      product_name: optionalText,
      product_name_de: optionalText,
      brands: optionalText,
      quantity: optionalText,
    })
    .optional()
    .catch(undefined),
});

/** Leerraum zusammenfassen, Steuerzeichen raus, Länge begrenzen */
export function cleanText(value: string | undefined, max: number): string | null {
  if (value === undefined) return null;
  let kept = "";
  // for…of läuft über ganze Unicode-Zeichen (Emojis, Umlaute bleiben heil)
  for (const ch of value.replace(/\s+/g, " ")) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x20 && code !== 0x7f && !(code >= 0x80 && code < 0xa0)) kept += ch;
  }
  const cleaned = kept.trim();
  if (cleaned === "") return null;
  return cleaned.length > max ? `${cleaned.slice(0, max - 1).trimEnd()}…` : cleaned;
}

export type LookupResult =
  { found: true; name: string; brand: string | null; quantity: string | null } | { found: false };

/** Wertet die Antwort aus. Alles Unerwartete zählt als „nicht gefunden". */
export function parseLookupResponse(raw: unknown): LookupResult {
  const parsed = ResponseSchema.safeParse(raw);
  if (!parsed.success || parsed.data.status !== 1 || !parsed.data.product) return { found: false };
  const p = parsed.data.product;
  const name = cleanText(p.product_name_de, MAX_NAME) ?? cleanText(p.product_name, MAX_NAME);
  if (name === null) return { found: false };
  return {
    found: true,
    name,
    brand: cleanText(p.brands, 60),
    quantity: cleanText(p.quantity, 30),
  };
}
