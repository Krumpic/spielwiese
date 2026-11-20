// Startet alle Browser-Tests nacheinander und fasst das Ergebnis zusammen.
// Aufruf: npm run test:e2e   (baut vorher die App)
// Ergebnisse/Screenshots: test-results/e2e/ (nicht im Repo)
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const out = join(root, "test-results", "e2e");
mkdirSync(out, { recursive: true });

// Künstliches Kamerabild mit echtem EAN-13-Barcode für die Scanner-Tests
const video = join(out, "barcode.y4m");
spawnSync(process.execPath, [join(here, "make-barcode-video.mjs"), video, "4006381333931"], {
  stdio: "inherit",
});

// Vorschau der gebauten App (mit aktiver CSP) starten und warten, bis sie antwortet
const preview = spawn(
  process.execPath,
  [
    join(root, "node_modules", "vite", "bin", "vite.js"),
    "preview",
    "--port",
    "4173",
    "--strictPort",
  ],
  { cwd: root, stdio: "ignore" },
);
let ready = false;
for (let i = 0; i < 50 && !ready; i++) {
  try {
    ready = (await fetch("http://localhost:4173/spielwiese/")).ok;
  } catch {
    // Vorschau startet noch – gleich nochmal versuchen
  }
  if (!ready) await new Promise((resolve) => setTimeout(resolve, 200));
}
if (!ready) {
  preview.kill();
  console.error("Die Vorschau ist nicht gestartet (läuft schon etwas auf Port 4173?).");
  process.exit(1);
}

const suites = [
  ["run"],
  ["recipes"],
  ["backup"],
  ["designs"],
  ["expiry"],
  ["scanner-manual"],
  ["overflow"],
  ["scanner", video],
  ["scan-form", video],
];

let passed = 0;
let failed = 0;
for (const [name, ...args] of suites) {
  const result = spawnSync(
    process.execPath,
    [join(here, `${name}.mjs`), join(out, name), ...args],
    {
      encoding: "utf8",
      timeout: 300_000,
    },
  );
  const lines = (result.stdout ?? "").split("\n");
  const ok = lines.filter((line) => line.startsWith("OK")).length;
  const fails = lines.filter((line) => line.startsWith("FAIL"));
  passed += ok;
  failed += fails.length;
  console.log(`${name.padEnd(15)} ${String(ok)} OK, ${String(fails.length)} FAIL`);
  for (const line of fails) console.log(`   ${line}`);
  if (result.status !== 0) {
    failed++;
    const reason = (result.stderr ?? "").split("\n").find((line) => line.includes("Error"));
    console.log(`   ABBRUCH: ${reason ?? "unbekannter Fehler"}`);
  }
}

preview.kill();
console.log(`\nGESAMT: ${String(passed + failed)} Prüfungen, ${String(failed)} fehlgeschlagen`);
process.exit(failed > 0 ? 1 : 0);
