/**
 * Content Security Policy der App.
 *
 * Legt fest, von wo der Browser Code, Styles, Bilder und Verbindungen laden darf.
 * Alles, was hier nicht erlaubt ist, wird blockiert – auch eingeschleuster Code.
 *
 * Neue externe Domains nur nach Rückfrage hinzufügen und ausschließlich unter `connect-src`.
 *
 * Freigegeben vom Nutzer:
 * - https://world.openfoodfacts.org – Produktname per Barcode (nur die Nummer wird gesendet)
 */
export const OPEN_FOOD_FACTS = "https://world.openfoodfacts.org";

export const CSP_DIRECTIVES: Readonly<Record<string, readonly string[]>> = {
  "default-src": ["'self'"],
  "script-src": ["'self'"],
  "style-src": ["'self'"],
  "img-src": ["'self'", "data:", "blob:"],
  "font-src": ["'self'"],
  "connect-src": ["'self'", OPEN_FOOD_FACTS],
  "manifest-src": ["'self'"],
  "worker-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
};

export const CONTENT_SECURITY_POLICY: string = Object.entries(CSP_DIRECTIVES)
  .map(([directive, sources]) => `${directive} ${sources.join(" ")}`)
  .join("; ");
