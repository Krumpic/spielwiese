import { describe, expect, it } from "vitest";
import { BarcodeSchema, hasValidChecksum, normalizeBarcode } from "./barcode.ts";
import { buildLookupUrl, cleanText, parseLookupResponse } from "./openFoodFacts.ts";

describe("Barcode", () => {
  it("erkennt gültige Barcodes an der Prüfziffer", () => {
    expect(hasValidChecksum("3017620422003")).toBe(true); // EAN-13
    expect(hasValidChecksum("96385074")).toBe(true); // EAN-8
    expect(hasValidChecksum("036000291452")).toBe(true); // UPC-A
  });
  it("erkennt Fehl-Scans und Tippfehler", () => {
    expect(hasValidChecksum("3017620422004")).toBe(false);
    expect(hasValidChecksum("12345")).toBe(false);
    expect(hasValidChecksum("abcdefghijklm")).toBe(false);
  });
  it("Schema lehnt alles außer Ziffern ab", () => {
    expect(BarcodeSchema.safeParse("3017620422003").success).toBe(true);
    expect(BarcodeSchema.safeParse("3017620422003/../../evil").success).toBe(false);
    expect(BarcodeSchema.safeParse("30176204220?3").success).toBe(false);
  });
  it("entfernt Leerzeichen und Bindestriche", () => {
    expect(normalizeBarcode(" 30176 20422-003 ")).toBe("3017620422003");
  });
});

describe("Open Food Facts", () => {
  it("baut die Adresse nur für gültige Barcodes", () => {
    expect(buildLookupUrl("3017620422003")).toBe(
      "https://world.openfoodfacts.org/api/v2/product/3017620422003.json?fields=product_name,product_name_de,brands,quantity",
    );
    expect(() => buildLookupUrl("123?x=1")).toThrow();
    expect(() => buildLookupUrl("https://evil.example")).toThrow();
  });

  it("liest Name, Marke und Menge – deutscher Name bevorzugt", () => {
    expect(
      parseLookupResponse({
        status: 1,
        product: {
          product_name: "Milk",
          product_name_de: "Vollmilch",
          brands: "Alpenmilch",
          quantity: "1 l",
        },
      }),
    ).toEqual({ found: true, name: "Vollmilch", brand: "Alpenmilch", quantity: "1 l" });
  });

  it("nicht gefunden / kaputte Antworten → nicht gefunden", () => {
    expect(parseLookupResponse({ status: 0 })).toEqual({ found: false });
    expect(parseLookupResponse(null)).toEqual({ found: false });
    expect(parseLookupResponse("<html>")).toEqual({ found: false });
    expect(parseLookupResponse({ status: 1, product: { product_name: "   " } })).toEqual({
      found: false,
    });
    expect(parseLookupResponse({ status: 1, product: { product_name: 42 } })).toEqual({
      found: false,
    });
  });

  it("entschärft manipulierte Namen (Steuerzeichen, Überlänge) – HTML bleibt reiner Text", () => {
    const evil = parseLookupResponse({
      status: 1,
      product: { product_name: `<img src=x onerror=alert(1)>\u0000\u001b[31m${"x".repeat(200)}` },
    });
    expect(evil.found).toBe(true);
    if (evil.found) {
      expect(evil.name.length).toBeLessThanOrEqual(60);
      let hasControlChar = false;
      for (const ch of evil.name) if ((ch.codePointAt(0) ?? 0) < 0x20) hasControlChar = true;
      expect(hasControlChar).toBe(false);
    }
  });

  it("cleanText fasst Leerraum zusammen", () => {
    expect(cleanText("  Bio \n  Hafer\tflocken ", 60)).toBe("Bio Hafer flocken");
  });
});
