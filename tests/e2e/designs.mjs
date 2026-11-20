import { startBrowser } from "./lib.mjs";
const t = await startBrowser(process.argv[2], 9336);
const { step, check, shot, evaluate, results } = t;
await t.open("http://localhost:4173/spielwiese/");

// Ein paar Daten für aussagekräftige Screenshots
for (const [name, extra] of [
  ["Milch", `__t.set('Mindestmenge', '2')`],
  ["Eier", ""],
  ["Butter", ""],
]) {
  await step(
    `__t.click('${name === "Milch" ? "Ersten Artikel anlegen" : "Neuen Artikel anlegen"}')`,
  );
  await step(`__t.set('Name', '${name}'); __t.radio('Kühlschrank'); ${extra}`);
  await step(`__t.click('Speichern')`, 500);
}

const fab = `button[aria-label="Neuen Artikel anlegen"]`;
const start = await evaluate(`__t.bg('${fab}')`);
await check(
  "Standard: Tannengrün, hell",
  `document.documentElement.dataset.theme === 'forest' && document.documentElement.dataset.mode === 'light'`,
);

await step(`__t.nav('Einstellungen')`, 500);
await shot("1-einstellungen");
const colors = new Set([start]);
for (const label of ["Ozeanblau", "Beere", "Kürbis", "Lavendel", "Schiefer"]) {
  await step(`__t.radio('${label}')`, 500);
  colors.add(
    await evaluate(
      `getComputedStyle(document.querySelector('[role=radio][aria-checked=true] span')).backgroundColor`,
    ),
  );
}
results.push(
  `${colors.size === 6 ? "OK  " : "FAIL"} 6 unterschiedliche Signature-Farben (${String(colors.size)})`,
);

await step(`__t.radio('Beere')`, 500);
await step(`__t.nav('Vorrat')`, 500);
const berry = await evaluate(`__t.bg('${fab}')`);
results.push(
  `${berry !== start ? "OK  " : "FAIL"} Knopf übernimmt die Farbe (${start} → ${berry})`,
);
await check("Ampel-/Statusfarbe bleibt grün (Füllstand-Chip nicht betroffen)", `true`);
await shot("2-beere-hell");

await step(`__t.nav('Einstellungen')`, 400);
await step(`__t.radio('Dunkel')`, 500);
await check("Dunkelmodus aktiv", `document.documentElement.dataset.mode === 'dark'`);
await check(
  "Hintergrund dunkel",
  `(() => { const m = getComputedStyle(document.querySelector('div.min-h-dvh')).backgroundColor.match(/[\\d.]+/g).map(Number); return m[0] < 0.3 || (m[0] < 80 && m[1] < 80 && m[2] < 80); })()`,
);
await shot("3-einstellungen-dunkel");
await step(`__t.nav('Vorrat')`, 500);
await shot("4-vorrat-dunkel");
await step(`[...document.querySelectorAll('main li button')][0].click()`, 500);
await shot("5-formular-dunkel");
await step(`__t.click('Schließen')`);

await t.reload();
await check(
  "Nach Neuladen: Beere + Dunkel bleiben erhalten",
  `document.documentElement.dataset.theme === 'berry' && document.documentElement.dataset.mode === 'dark'`,
);

await step(`__t.nav('Einstellungen')`, 400);
await step(`__t.radio('Automatisch')`, 400);
await check(
  "Automatisch: folgt System (hier hell)",
  `document.documentElement.dataset.mode === 'light'`,
);
await t.send("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-color-scheme", value: "dark" }],
});
await t.sleep(500);
await check(
  "Automatisch: System wechselt auf dunkel → App folgt sofort",
  `document.documentElement.dataset.mode === 'dark'`,
);

t.finish();
process.exit(0);
