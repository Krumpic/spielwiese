// Browser-Test Phase 3: Rezepte anlegen, Ampel, Fehlendes auf Liste, Kochen, Rückgängig, Portionen.
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2];
const DL = join(OUT, "downloads");
const URL = "http://localhost:4173/spielwiese/";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9335;
mkdirSync(DL, { recursive: true });

const edge = spawn(EDGE, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(OUT, "profile")}`,
  "--no-first-run",
  "--disable-extensions",
  "about:blank",
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try {
    target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(
      (t) => t.type === "page",
    );
  } catch {
    // Browser noch nicht bereit – gleich nochmal versuchen
  }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let nextId = 1;
const pending = new Map();
const problems = [];
const dialogs = [];
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
  if (msg.method === "Page.javascriptDialogOpening") {
    dialogs.push(msg.params.message);
    ws.send(
      JSON.stringify({
        id: nextId++,
        method: "Page.handleJavaScriptDialog",
        params: { accept: true },
      }),
    );
  }
  if (msg.method === "Runtime.exceptionThrown")
    problems.push(
      "EXCEPTION: " +
        msg.params.exceptionDetails.text +
        " " +
        (msg.params.exceptionDetails.exception?.description ?? ""),
    );
  if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type))
    problems.push("CONSOLE: " + msg.params.args.map((a) => a.value ?? a.description).join(" "));
  if (msg.method === "Log.entryAdded" && ["error", "warning"].includes(msg.params.entry.level))
    problems.push(`LOG ${msg.params.entry.source}: ${msg.params.entry.text}`);
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, (m) =>
      m.error ? reject(new Error(method + ": " + m.error.message)) : resolve(m.result),
    );
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expr) => {
  const r = await send("Runtime.evaluate", {
    expression: expr,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (r.exceptionDetails) {
    console.log(results.join("\n"));
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(OUT, "fehler.png"), Buffer.from(data, "base64"));
  }
  if (r.exceptionDetails)
    throw new Error(
      "Eval: " +
        JSON.stringify(r.exceptionDetails.exception?.description) +
        "\n  bei: " +
        expr.slice(0, 160),
    );
  return r.result.value;
};
const shot = async (name) => {
  await sleep(400);
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, name + ".png"), Buffer.from(data, "base64"));
};
const helpers = `
  window.__t = {
    scope: () => document.querySelector('[role=dialog]') ?? document,
    btn: (text) => [...__t.scope().querySelectorAll('button')].find(b => b.textContent.replace(/\\u00AD/g, '').trim().replace(/^[0-9]+/, '') === text || b.getAttribute('aria-label') === text),
    click: (text) => { const b = __t.btn(text); if (!b) throw new Error('Knopf fehlt: ' + text); b.click(); },
    nav: (text) => { const b = [...document.querySelectorAll('nav button')].find(b => b.textContent.replace(/\\u00AD/g, '').trim().replace(/^[0-9]+/, '') === text); b.click(); },
    setEl: (el, value) => { const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); },
    set: (label, value) => { const l = [...__t.scope().querySelectorAll('label')].find(l => l.querySelector('span')?.textContent.trim().startsWith(label)); if (!l) throw new Error('Feld fehlt: ' + label); __t.setEl(l.querySelector('input,select,textarea'), value); },
    aria: (label, value) => { const el = __t.scope().querySelector('[aria-label="' + label + '"]'); if (!el) throw new Error('aria fehlt: ' + label); __t.setEl(el, value); },
    optionValue: (label, text) => { const el = __t.scope().querySelector('[aria-label="' + label + '"]'); const o = [...el.options].find(o => o.text === text); if (!o) throw new Error('Option fehlt: ' + text); return o.value; },
    pick: (label, text) => __t.aria(label, __t.optionValue(label, text)),
    text: () => document.body.innerText.replace(/\\u00AD/g, ''),
    dialogText: () => __t.scope().innerText.replace(/\\u00AD/g, ''),
    rows: () => [...document.querySelectorAll('main li')].map(l => l.innerText.replace(/\\n/g, ' ')).join(' | '),
  };`;
const step = async (code, wait = 350) => {
  await evaluate(code);
  await sleep(wait);
};
const results = [];
const check = async (name, expr) =>
  results.push(`${(await evaluate(expr)) ? "OK  " : "FAIL"} ${name}`);
const addItem = async (...fields) => {
  await step(`__t.click('Neuen Artikel anlegen')`);
  for (const f of fields) await step(f);
  await step(`__t.click('Speichern')`, 500);
};

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DL });
await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
});
await send("Page.navigate", { url: URL });
await sleep(2500);
await evaluate(helpers);

// ---------- Vorrat ----------
await addItem(
  `__t.set('Name', 'Spaghetti'); __t.set('Menge daheim', '1'); __t.set('Einheit', 'kg')`,
);
await addItem(`__t.set('Name', 'Zwiebel'); __t.set('Menge daheim', '2')`);
await addItem(
  `__t.set('Name', 'Tomaten'); __t.set('Menge daheim', '1'); __t.set('Einheit', 'can')`,
);
await addItem(
  `__t.set('Name', 'Salz'); __t.click('Grob schätzen')`,
  `__t.set('Auf die Einkaufsliste ab', 'never')`,
);
await addItem(`__t.set('Name', 'Mehl'); __t.click('Grob schätzen')`);

// ---------- Rezept 1 ----------
await step(`__t.nav('Rezepte')`, 500);
await check("Leerer Zustand bei Rezepten", `__t.text().includes('Noch keine Rezepte')`);
await step(`__t.click('Erstes Rezept anlegen')`);
await step(`__t.set('Name des Rezepts', 'Bolognese'); __t.set('Portionen', '4')`);
for (let i = 0; i < 5; i++) await step(`__t.click('Zutat hinzufügen')`, 150);
await step(`__t.pick('Zutat 1', 'Spaghetti')`);
await step(`__t.aria('Menge für Spaghetti', '500'); __t.aria('Einheit für Spaghetti', 'g')`);
await check(
  "Einheiten-Auswahl nur kompatibel (g/kg bei kg-Artikel)",
  `[...__t.scope().querySelector('[aria-label="Einheit für Spaghetti"]').options].map(o => o.value).join(',') === 'g,kg'`,
);
await step(`__t.pick('Zutat 2', 'Zwiebel'); `);
await step(`__t.aria('Menge für Zwiebel', '1')`);
await step(`__t.pick('Zutat 3', 'Tomaten')`);
await step(`__t.aria('Menge für Tomaten', '2')`);
await step(`__t.pick('Zutat 4', 'Salz')`);
await step(
  `[...__t.scope().querySelectorAll('form > section ul > li')][3].querySelector('input[type=checkbox]').click()`,
);
await step(`__t.aria('Zutat 5', 'new')`);
await step(
  `__t.aria('Name der neuen Zutat', 'Faschiertes'); [...__t.scope().querySelectorAll('[role=radio]')].find(b => b.textContent.replace(/\\u00AD/g, '') === 'Kühlschrank' && b.closest('.bg-brand-50')).click(); __t.aria('Einheit im Vorrat', 'g')`,
);
await step(`__t.click('Anlegen')`, 700);
await step(`__t.aria('Menge für Faschiertes', '500')`);
await step(`__t.aria('Schritt 1', 'Zwiebel fein hacken und anbraten.')`);
await step(`__t.click('Schritt hinzufügen')`);
await step(`__t.aria('Schritt 2', 'Faschiertes und Tomaten dazu, 30 Minuten köcheln.')`);
await shot("1-formular");
await step(`__t.click('Rezept speichern')`, 900);

await check(
  "Detail öffnet sich nach dem Speichern",
  `__t.dialogText().includes('ZUBEREITUNG') || __t.dialogText().includes('Zubereitung')`,
);
await check(
  "Ampel gelb: 2 von 4 Zutaten fehlen (Salz zählt nicht)",
  `__t.dialogText().includes('2 von 4 Zutaten fehlen')`,
);
await check("Teilmenge sichtbar: Tomaten 'Da: 1 Dose'", `__t.dialogText().includes('Da: 1 Dose')`);
await check("Umrechnung: Spaghetti 500 g ok bei 1 kg Vorrat", `__t.dialogText().includes('500 g')`);
await check("Salz als Grundzutat markiert", `__t.dialogText().includes('Grundzutat')`);
await check(
  "Schritte nummeriert",
  `__t.dialogText().includes('Zwiebel fein hacken') && __t.dialogText().includes('30 Minuten')`,
);
await shot("2-detail-gelb");

await step(`__t.click('Fehlende Zutaten auf die Einkaufsliste')`, 600);
await check(
  "Meldung: 2 Zutaten auf der Liste",
  `__t.dialogText().includes('2 Zutaten stehen jetzt auf der Einkaufsliste')`,
);
await step(`__t.click('Schließen')`);

await step(`__t.nav('Einkaufsliste')`, 500);
await check("Liste: Tomaten 1 Dose (nur Fehlmenge)", `__t.rows().includes('Tomaten 1 Dose')`);
await check("Liste: Faschiertes 500 g", `__t.rows().includes('Faschiertes 500 g')`);
await step(`__t.click('Tomaten abhaken')`);
await step(`__t.click('Faschiertes abhaken')`);
await step(
  `[...document.querySelectorAll('button')].find(b => b.textContent.includes('Einkauf abschließen')).click()`,
  700,
);

await step(`__t.nav('Rezepte')`, 500);
await check(
  "Nach dem Einkauf: Bolognese grün",
  `__t.text().includes('Alles da – kann gekocht werden')`,
);
await step(`__t.click('Kann ich kochen')`, 300);
await check("Filter 'Kann ich kochen' zeigt Bolognese", `__t.rows().includes('Bolognese')`);
await shot("3-liste-gruen");

// ---------- Kochen ----------
await step(
  `[...document.querySelectorAll('main li button')].find(b => b.innerText.includes('Bolognese')).click()`,
  500,
);
await step(`__t.click('Jetzt kochen')`, 800);
await check("Kochen: Erfolgsmeldung", `__t.dialogText().includes('Guten Appetit')`);
await check(
  "Kochen: Tomaten + Faschiertes leer → Rückfrage",
  `__t.dialogText().includes('Jetzt leer') && __t.dialogText().includes('Tomaten') && __t.dialogText().includes('Faschiertes')`,
);
await shot("4-gekocht");
await step(`__t.click('Auf die Einkaufsliste')`, 600);
await check(
  "Leere Zutaten auf die Liste gesetzt",
  `__t.dialogText().includes('Steht jetzt auf der Einkaufsliste')`,
);
await step(`__t.click('Schließen')`);
await step(`__t.nav('Vorrat')`, 500);
await check(
  "Vorrat: Spaghetti 0,5 kg, Zwiebel 1 Stk, Tomaten 0",
  `__t.rows().includes('Spaghetti') && __t.rows().includes('0,5 kg') && __t.rows().includes('1 Stk') && __t.rows().includes('0 Dose')`,
);
await check(
  "Einkaufsliste-Zähler = 2",
  `[...document.querySelectorAll('nav span')].some(s => s.textContent.trim() === '2')`,
);
await step(`__t.nav('Einkaufsliste')`, 400);
await check(
  "Nach dem Kochen: verbrauchte Menge auf der Liste (Faschiertes 500 g, Tomaten 2 Dose)",
  `__t.rows().includes('Faschiertes 500 g') && __t.rows().includes('Tomaten 2 Dose')`,
);

// ---------- Rückgängig ----------
await step(`__t.nav('Rezepte')`, 400);
await step(`__t.click('Alle')`);
await step(
  `[...document.querySelectorAll('main li button')].find(b => b.innerText.includes('Bolognese')).click()`,
  400,
);
await check("Nach Kochen: Bolognese nicht mehr grün", `!__t.dialogText().includes('Alles da')`);
await step(`__t.click('Schließen')`);
// Rückgängig direkt nach einem neuen Kochvorgang testen: erst einkaufen, dann kochen + rückgängig
await step(`__t.nav('Einkaufsliste')`, 400);
await step(`__t.click('Tomaten abhaken'); __t.click('Faschiertes abhaken')`, 300);
await step(
  `[...document.querySelectorAll('button')].find(b => b.textContent.includes('Einkauf abschließen')).click()`,
  700,
);
await step(`__t.nav('Vorrat')`, 400);
const beforeCook = await evaluate(`__t.rows()`);
await step(`__t.nav('Rezepte')`, 400);
await step(
  `[...document.querySelectorAll('main li button')].find(b => b.innerText.includes('Bolognese')).click()`,
  400,
);
await step(`__t.click('Jetzt kochen')`, 800);
await step(`__t.click('Rückgängig')`, 800);
await check("Rückgängig: Meldung", `__t.dialogText().includes('Rückgängig gemacht')`);
await check("Rückgängig: Rezept wieder grün", `__t.dialogText().includes('Alles da')`);
await step(`__t.click('Schließen')`);
await step(`__t.nav('Vorrat')`, 400);
const afterUndo = await evaluate(`__t.rows()`);
results.push(
  `${beforeCook === afterUndo ? "OK  " : "FAIL"} Rückgängig: Vorrat exakt wie vor dem Kochen`,
);

// ---------- Portionen ----------
await step(`__t.nav('Rezepte')`, 400);
await step(
  `[...document.querySelectorAll('main li button')].find(b => b.innerText.includes('Bolognese')).click()`,
  400,
);
for (let i = 0; i < 4; i++) await step(`__t.click('Mehr Portionen')`, 150);
await check(
  "8 Portionen: Mengen verdoppelt (1 000 g Spaghetti, 4 Dosen), Rezept für 4 angezeigt",
  `__t.dialogText().includes('8 Portionen') && __t.dialogText().includes('Rezept für 4') && /1\\s000 g/.test(__t.dialogText()) && __t.dialogText().includes('4 Dose')`,
);
await check(
  "8 Portionen: Ampel gelb, alle 4 reichen nicht (0,5 kg Spaghetti, 1 Zwiebel da)",
  `__t.dialogText().includes('4 von 4 Zutaten fehlen')`,
);
await shot("5-portionen");
await step(`__t.click('Schließen')`);

// ---------- Rezept 2 mit grob geschätzter Zutat ----------
await step(`__t.click('Neues Rezept anlegen')`);
await step(`__t.set('Name des Rezepts', 'Palatschinken'); __t.set('Portionen', '2')`);
await step(`__t.click('Zutat hinzufügen')`);
await step(`__t.pick('Zutat 1', 'Mehl')`);
await check(
  "Grob geschätzte Zutat: Hinweis statt Menge",
  `__t.dialogText().includes('beim Kochen fragt die App')`,
);
await step(`__t.click('Rezept speichern')`, 900);
await step(`__t.click('Jetzt kochen')`, 500);
await check(
  "Frage 'Wie viel ist noch da?'",
  `__t.dialogText().includes('Wie viel ist nach dem Kochen noch da?')`,
);
await step(
  `[...__t.scope().querySelectorAll('[role=radio]')].find(b => b.textContent === 'leer').click()`,
);
await step(`__t.click('Fertig – vom Vorrat abziehen')`, 800);
await check(
  "Mehl mit Mindeststand → automatisch auf der Liste, keine Rückfrage",
  `__t.dialogText().includes('Guten Appetit') && !__t.dialogText().includes('Jetzt leer')`,
);
await step(`__t.click('Schließen')`);
await step(`__t.nav('Vorrat')`, 400);
await check("Mehl jetzt 'leer'", `__t.rows().includes('Mehl') && __t.rows().includes('leer')`);

// ---------- Validierung ----------
await step(`__t.nav('Rezepte')`, 400);
await step(`__t.click('Neues Rezept anlegen')`);
await step(`__t.click('Rezept speichern')`, 300);
await check(
  "Leeres Rezept wird abgelehnt",
  `__t.dialogText().includes('Bitte einen Namen eingeben')`,
);
await step(`__t.set('Name des Rezepts', 'Test')`);
await step(`__t.click('Zutat hinzufügen')`);
await step(`__t.pick('Zutat 1', 'Zwiebel')`);
await step(`__t.aria('Menge für Zwiebel', 'abc')`);
await step(`__t.click('Rezept speichern')`, 300);
await check(
  "Ungültige Menge wird abgelehnt",
  `__t.dialogText().includes('Zutat 1: Bitte eine gültige Menge eingeben')`,
);
await step(`__t.click('Schließen')`);

// ---------- Backup enthält Rezepte ----------
await step(`__t.nav('Einstellungen')`, 500);
await step(`__t.click('Backup erstellen')`, 2500);
const file = readdirSync(DL).find((f) => f.endsWith(".json"));
const backup = file ? JSON.parse(readFileSync(join(DL, file), "utf8")) : null;
results.push(
  `${backup?.version === 4 && backup.recipes?.length === 2 ? "OK  " : "FAIL"} Backup v4 enthält beide Rezepte`,
);

// ---------- Artikel löschen, der in einem Rezept steckt ----------
await step(`__t.nav('Vorrat')`, 400);
await step(
  `[...document.querySelectorAll('main li button')].find(b => b.innerText.startsWith('Zwiebel')).click()`,
);
const before = dialogs.length;
await step(`__t.click('Löschen')`, 800);
results.push(
  `${dialogs.slice(before).some((d) => d.includes("in 1 Rezept verwendet")) ? "OK  " : "FAIL"} Löschen warnt: "in 1 Rezept verwendet"`,
);
await step(`__t.nav('Rezepte')`, 400);
await step(
  `[...document.querySelectorAll('main li button')].find(b => b.innerText.includes('Bolognese')).click()`,
  400,
);
await check(
  "Zwiebel aus der Zutatenliste entfernt",
  `![...__t.scope().querySelectorAll('section ul li')].some(li => li.innerText.includes('Zwiebel'))`,
);

console.log(results.join("\n"));
console.log(
  "\nKonsole/CSP-Probleme: " + (problems.length ? "\n  " + problems.join("\n  ") : "keine"),
);
ws.close();
edge.kill();
process.exit(0);
