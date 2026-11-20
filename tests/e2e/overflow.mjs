// Misst horizontales Überlaufen in allen Fenstern (Modals) bei verschiedenen Breiten.
import { startBrowser } from "./lib.mjs";

const t = await startBrowser(process.argv[2], 9340, {
  extraArgs: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const { step, evaluate, results, send, shot } = t;
await t.open("http://localhost:4173/spielwiese/");
// iPhone nachstellen: Systemschrift ist breiter als die Windows-Schrift → Text künstlich verbreitern
// (über CDP, nicht über die Seite – die CSP der App bleibt unberührt)
await evaluate(
  `(() => { const s = new CSSStyleSheet(); s.replaceSync('* { letter-spacing: 0.06em !important; }'); document.adoptedStyleSheets = [...document.adoptedStyleSheets, s]; return true; })()`,
);

// Messung: ragt etwas über den Rand des Fensters hinaus? Wer ist schuld?
const measure = `(() => {
  const dialog = document.querySelector('[role=dialog]') ?? document.documentElement;
  const vw = document.documentElement.clientWidth;
  const culprits = [...dialog.querySelectorAll('*')]
    .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 0.5 || r.left < -0.5) && !el.closest('.overflow-x-auto'); }) /* absichtlich wischbare Leisten (z. B. Filter) ausnehmen */
    .map(el => el.tagName.toLowerCase() + (el.type ? '[' + el.type + ']' : '') + ' ' + Math.round(el.getBoundingClientRect().width) + 'px')
    .slice(0, 6);
  return { dialogScroll: dialog.scrollWidth - dialog.clientWidth, pageScroll: document.documentElement.scrollWidth - vw, culprits };
})()`;

const report = async (label) => {
  const m = await evaluate(measure);
  const ok = m.dialogScroll <= 0 && m.pageScroll <= 0 && m.culprits.length === 0;
  results.push(
    `${ok ? "OK  " : "FAIL"} ${label}: Überlauf Fenster ${m.dialogScroll}px, Seite ${m.pageScroll}px ${m.culprits.length ? "→ " + m.culprits.join(", ") : ""}`,
  );
};

// Testdaten
await step(`__t.click('Ersten Artikel anlegen')`);
await step(`__t.set('Name', 'Mehl')`);
await step(`__t.click('Speichern')`, 500);

for (const width of [390, 375, 320]) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height: 800,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await t.sleep(400);
  await step(`__t.nav('Vorrat')`, 300);
  await report(`${width}px Vorrat (Seite)`);

  await step(`__t.click('Neuen Artikel anlegen')`, 400);
  await report(`${width}px Neuer Artikel (genau)`);
  results.push(
    `${(await evaluate(`getComputedStyle(document.querySelector('[role=dialog]')).touchAction`)) === "pan-y" ? "OK  " : "FAIL"} ${width}px Fenster erlaubt nur senkrechtes Wischen (touch-action: pan-y)`,
  );
  await step(`__t.radio('Grob schätzen')`, 300);
  await report(`${width}px Neuer Artikel (grob)`);
  if (width === 320) await shot("neuer-artikel-320");
  await step(`__t.click('Schließen')`);

  await step(`[...document.querySelectorAll('main li button')][0].click()`, 400);
  await report(`${width}px Artikel bearbeiten`);
  await step(`__t.click('Schließen')`);

  await step(`__t.nav('Rezepte')`, 300);
  await step(
    `__t.click('${width === 390 ? "Erstes Rezept anlegen" : "Neues Rezept anlegen"}')`,
    400,
  );
  await step(`__t.click('Zutat hinzufügen')`, 300);
  await step(`__t.aria('Zutat 1', 'new')`, 300);
  await report(`${width}px Neues Rezept (inkl. Zutat neu anlegen)`);
  await step(
    `__t.aria('Zutat 1', __t.scope().querySelector('[aria-label="Zutat 1"]').options[1].value)`,
    300,
  );
  await step(`__t.set('Name des Rezepts', 'Test')`);
  await step(`__t.click('Rezept speichern')`, 700);
  await report(`${width}px Rezept-Detail`);
  await step(`__t.click('Schließen')`);

  await step(`__t.nav('Einstellungen')`, 300);
  await report(`${width}px Einstellungen (Seite)`);
  await step(`__t.nav('Vorrat')`, 300);
  await step(`__t.click('Barcode scannen')`, 800);
  await report(`${width}px Barcode-Scanner`);
  await step(`__t.click('Scanner schließen')`, 300);
}

t.finish();
process.exit(0);
