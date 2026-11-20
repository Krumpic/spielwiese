// Erzeugt src/theme.css (Signature-Farben + Dunkelmodus) aus den Tailwind-Farbpaletten.
// Aufruf: npm run theme   (danach das Ergebnis committen)
import { readFileSync, writeFileSync } from "node:fs";

const source = readFileSync("node_modules/tailwindcss/theme.css", "utf8");
const palette = new Map(
  [...source.matchAll(/--color-([a-z]+)-(\d+):\s*([^;]+);/g)].map((m) => [
    `${m[1]}-${m[2]}`,
    m[3].trim(),
  ]),
);
const color = (name, step) => {
  const value = palette.get(`${name}-${String(step)}`);
  if (!value) throw new Error(`Farbe fehlt: ${name}-${String(step)}`);
  return value;
};

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

/** Signature-Farben: ID → Tailwind-Palette (IDs werden gespeichert – nicht umbenennen) */
const THEMES = [
  ["forest", "emerald"],
  ["ocean", "sky"],
  ["berry", "rose"],
  ["pumpkin", "orange"],
  ["lavender", "violet"],
  ["slate", "slate"],
];

/** Im Dunkelmodus: helle Töne ↔ dunkle Töne, Akzente etwas heller */
const DARK_BRAND_SHIFT = new Map([
  [50, 950],
  [100, 900],
  [200, 800],
  [700, 500],
  [800, 600],
  [900, 700],
]);
const STONE_SWAP = new Map([
  [50, 950],
  [100, 900],
  [200, 800],
  [300, 700],
  [400, 600],
  [600, 400],
  [700, 300],
  [800, 200],
  [900, 100],
  [950, 50],
]);
const HINT_SHIFT = new Map([
  [50, 950],
  [100, 900],
  [200, 800],
  [700, 300],
  [800, 300],
  [900, 200],
]);

const vars = (indent, entries) => entries.map(([k, v]) => `${indent}${k}: ${v};`).join("\n");
const brand = (name, shift) =>
  STEPS.map((s) => [`--color-brand-${String(s)}`, color(name, shift?.get(s) ?? s)]);

let css = `/*
 * AUTOMATISCH ERZEUGT von scripts/generate-theme.mjs – nicht von Hand bearbeiten.
 *
 * - brand-*  = Signature-Farbe (wählbar in den Einstellungen)
 * - green-*  = Ampel/Status – bleibt bei jedem Design gleich
 * - Dunkelmodus: Grautöne und Hinweisfarben werden umgedreht
 */

@theme {
${vars("  ", brand("emerald"))}
  --color-surface: #fff;
}
`;

for (const [id, name] of THEMES) {
  css += `\n[data-theme="${id}"] {\n${vars("  ", brand(name))}\n}\n`;
}

const darkBase = [
  ["color-scheme", "dark"],
  ["--color-surface", color("stone", 800)],
  ...[...STONE_SWAP].map(([from, to]) => [`--color-stone-${String(from)}`, color("stone", to)]),
  ...["amber", "red", "lime", "green"].flatMap((name) =>
    [...HINT_SHIFT].map(([from, to]) => [`--color-${name}-${String(from)}`, color(name, to)]),
  ),
];
css += `\n[data-mode="dark"] {\n${vars("  ", darkBase)}\n}\n`;

for (const [id, name] of THEMES) {
  css += `\n[data-mode="dark"][data-theme="${id}"] {\n${vars("  ", brand(name, DARK_BRAND_SHIFT))}\n}\n`;
}

writeFileSync("src/theme.css", css);
console.log(`src/theme.css erzeugt (${String(THEMES.length)} Designs + Dunkelmodus)`);
