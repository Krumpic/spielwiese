import { z } from "zod";

/**
 * Erscheinungsbild: Signature-Farbe + Hell/Dunkel.
 * ⚠️ IDs werden gespeichert – nicht umbenennen (siehe scripts/generate-theme.mjs).
 */
export const THEME_IDS = ["forest", "ocean", "berry", "pumpkin", "lavender", "slate"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

const THEME_LABELS: ReadonlyMap<ThemeId, string> = new Map([
  ["forest", "Tannengrün"],
  ["ocean", "Ozeanblau"],
  ["berry", "Beere"],
  ["pumpkin", "Kürbis"],
  ["lavender", "Lavendel"],
  ["slate", "Schiefer"],
]);

export function themeLabel(id: ThemeId): string {
  return THEME_LABELS.get(id) ?? id;
}

export const COLOR_MODES = ["auto", "light", "dark"] as const;
export type ColorMode = (typeof COLOR_MODES)[number];

const COLOR_MODE_LABELS: ReadonlyMap<ColorMode, string> = new Map([
  ["auto", "Automatisch"],
  ["light", "Hell"],
  ["dark", "Dunkel"],
]);

export function colorModeLabel(mode: ColorMode): string {
  return COLOR_MODE_LABELS.get(mode) ?? mode;
}

export interface Appearance {
  theme: ThemeId;
  colorMode: ColorMode;
}

export const DEFAULT_APPEARANCE: Appearance = { theme: "forest", colorMode: "auto" };

export const ThemeIdSchema = z.enum(THEME_IDS);
export const ColorModeSchema = z.enum(COLOR_MODES);

/** Gespeicherte Werte prüfen – Unbekanntes fällt auf den Standard zurück */
export function parseAppearance(theme: unknown, colorMode: unknown): Appearance {
  return {
    theme: ThemeIdSchema.safeParse(theme).data ?? DEFAULT_APPEARANCE.theme,
    colorMode: ColorModeSchema.safeParse(colorMode).data ?? DEFAULT_APPEARANCE.colorMode,
  };
}

/** Soll dunkel angezeigt werden? */
export function isDark(mode: ColorMode, systemPrefersDark: boolean): boolean {
  return mode === "dark" || (mode === "auto" && systemPrefersDark);
}
