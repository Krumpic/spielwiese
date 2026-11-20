/**
 * Content Security Policy der App.
 *
 * Legt fest, von wo der Browser Code, Styles, Bilder und Verbindungen laden darf.
 * Alles, was hier nicht erlaubt ist, wird blockiert – auch eingeschleuster Code.
 *
 * Neue externe Domains (z. B. Open Food Facts) nur nach Rückfrage hinzufügen
 * und ausschließlich unter `connect-src`.
 */
export const CSP_DIRECTIVES: Readonly<Record<string, readonly string[]>> = {
  "default-src": ["'self'"],
  "script-src": ["'self'"],
  "style-src": ["'self'"],
  "img-src": ["'self'", "data:", "blob:"],
  "font-src": ["'self'"],
  "connect-src": ["'self'"],
  "manifest-src": ["'self'"],
  "worker-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
};

export const CONTENT_SECURITY_POLICY: string = Object.entries(CSP_DIRECTIVES)
  .map(([directive, sources]) => `${directive} ${sources.join(" ")}`)
  .join("; ");
