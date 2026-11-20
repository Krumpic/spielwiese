import { describe, expect, it } from "vitest";
import { OFF_ORIGIN } from "../domain/openFoodFacts.ts";
import { CONTENT_SECURITY_POLICY, CSP_DIRECTIVES, OPEN_FOOD_FACTS } from "./csp.ts";

describe("Content Security Policy", () => {
  it("erlaubt standardmäßig nur die eigene Herkunft", () => {
    expect(CSP_DIRECTIVES["default-src"]).toEqual(["'self'"]);
  });

  it("verbietet eval und Inline-Skripte", () => {
    expect(CONTENT_SECURITY_POLICY).not.toContain("unsafe-eval");
    expect(CONTENT_SECURITY_POLICY).not.toContain("unsafe-inline");
    expect(CSP_DIRECTIVES["script-src"]).toEqual(["'self'"]);
  });

  it("blockiert Plugins wie Flash/Java", () => {
    expect(CSP_DIRECTIVES["object-src"]).toEqual(["'none'"]);
  });

  it("erlaubt nur HTTPS für externe Verbindungen", () => {
    for (const source of CSP_DIRECTIVES["connect-src"] ?? []) {
      expect(source === "'self'" || source.startsWith("https://")).toBe(true);
    }
  });

  it("erlaubt nach außen ausschließlich die freigegebene Adresse (Open Food Facts)", () => {
    expect(CSP_DIRECTIVES["connect-src"]).toEqual(["'self'", "https://world.openfoodfacts.org"]);
    expect(OPEN_FOOD_FACTS).toBe(OFF_ORIGIN);
    // Skripte, Styles, Bilder dürfen weiterhin NUR von der eigenen Herkunft kommen
    expect(CSP_DIRECTIVES["script-src"]).toEqual(["'self'"]);
    expect(CSP_DIRECTIVES["style-src"]).toEqual(["'self'"]);
    expect(CSP_DIRECTIVES["font-src"]).toEqual(["'self'"]);
    expect(CSP_DIRECTIVES["default-src"]).toEqual(["'self'"]);
  });

  it("enthält keine Wildcards", () => {
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/(^|\s)\*(\s|;|$)/);
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/(^|\s)(https?:)(\s|;|$)/);
  });
});
