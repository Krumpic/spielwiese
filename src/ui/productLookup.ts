import {
  MAX_RESPONSE_CHARS,
  buildLookupUrl,
  parseLookupResponse,
  type LookupResult,
} from "../domain/openFoodFacts.ts";

/**
 * Fragt Open Food Facts nach dem Produktnamen.
 * - nur die Barcode-Nummer verlässt das Gerät (keine Cookies, kein Referrer)
 * - Zeitlimit 8 s, keine Weiterleitungen, Größenlimit für die Antwort
 * @returns "error", wenn der Dienst nicht erreichbar ist (z. B. offline)
 */
export async function lookupProduct(barcode: string): Promise<LookupResult | "error"> {
  try {
    const response = await fetch(buildLookupUrl(barcode), {
      method: "GET",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404) return { found: false };
    if (!response.ok) return "error";
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARS) return { found: false };
    return parseLookupResponse(JSON.parse(text));
  } catch {
    return "error";
  }
}
