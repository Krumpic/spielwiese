import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE, isDark, parseAppearance } from "./appearance.ts";

describe("Erscheinungsbild", () => {
  it("übernimmt gültige gespeicherte Werte", () => {
    expect(parseAppearance("ocean", "dark")).toEqual({ theme: "ocean", colorMode: "dark" });
  });

  it("fällt bei unbekannten oder manipulierten Werten auf den Standard zurück", () => {
    expect(parseAppearance("neon", 42)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance(undefined, undefined)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('"><script>', "dark").theme).toBe("forest");
  });

  it("Automatisch folgt dem System, Hell/Dunkel nicht", () => {
    expect(isDark("auto", true)).toBe(true);
    expect(isDark("auto", false)).toBe(false);
    expect(isDark("light", true)).toBe(false);
    expect(isDark("dark", false)).toBe(true);
  });
});
