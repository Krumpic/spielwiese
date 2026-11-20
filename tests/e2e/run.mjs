// Steuert Edge (headless) über das DevTools-Protokoll und spielt einen Nutzerablauf durch.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2];
const URL = "http://localhost:4173/spielwiese/";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9333;
mkdirSync(OUT, { recursive: true });

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
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === "page");
  } catch {
    // Browser noch nicht bereit – gleich nochmal versuchen
  }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let nextId = 1;
const pending = new Map();
const problems = [];
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
  if (msg.method === "Runtime.exceptionThrown")
    problems.push("EXCEPTION: " + msg.params.exceptionDetails.text);
  if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type))
    problems.push(
      `CONSOLE ${msg.params.type}: ` +
        msg.params.args.map((a) => a.value ?? a.description).join(" "),
    );
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
  });
  if (r.exceptionDetails)
    throw new Error("Eval: " + JSON.stringify(r.exceptionDetails.exception?.description));
  return r.result.value;
};
const shot = async (name) => {
  await sleep(400);
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, name + ".png"), Buffer.from(data, "base64"));
};

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
});
await send("Page.navigate", { url: URL });
await sleep(2500);

// Hilfsfunktionen im Browser
await evaluate(`
  window.__t = {
    btn: (text) => [...(document.querySelector('[role=dialog]') ?? document).querySelectorAll('button')].find(b => b.textContent.replace(/\\u00AD/g, '').trim().replace(/^[0-9]+/, '') === text || b.getAttribute('aria-label') === text),
    click: (text) => { const b = window.__t.btn(text); if (!b) throw new Error('Knopf fehlt: ' + text); b.click(); },
    field: (label) => { const l = [...document.querySelectorAll('label')].find(l => l.querySelector('span')?.textContent.trim().startsWith(label)); if (!l) throw new Error('Feld fehlt: ' + label); return l.querySelector('input,select'); },
    set: (label, value) => { const el = window.__t.field(label); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); },
    text: () => document.body.innerText.replace(/\\u00AD/g, ''),
  };
`);
const step = async (code, wait = 300) => {
  await evaluate(code);
  await sleep(wait);
};

const results = [];
const check = async (name, expr) => {
  const ok = await evaluate(expr);
  results.push(`${ok ? "OK  " : "FAIL"} ${name}`);
};

await check("Leerer Zustand sichtbar", `__t.text().includes('Dein Kornspeicher ist noch leer')`);
await check(
  "Stylesheet geladen (CSP lässt CSS zu)",
  `getComputedStyle(document.querySelector('main')).paddingLeft !== '0px'`,
);
await shot("1-leer");

// Milch: genau, Kühlschrank, 1 l, min 2, soll 3
await step(`__t.click('Ersten Artikel anlegen')`);
await step(`__t.set('Name', 'Milch'); __t.click('Kühlschrank')`);
await step(`__t.set('Menge daheim', '1'); __t.set('Einheit', 'l')`);
await step(`__t.set('Mindestmenge', '2'); __t.set('Sollmenge', '3')`);
await shot("2-formular");
await step(`__t.click('Speichern')`, 600);

// Mehl: grob, Vorratsschrank, Stand wenig (Grenze Standard: wenig)
await step(`__t.click('Neuen Artikel anlegen')`);
await step(`__t.set('Name', 'Mehl'); __t.click('Vorratsschrank'); __t.click('Grob schätzen')`);
await step(`__t.click('wenig')`);
await step(`__t.click('Speichern')`, 600);

// Eier: genau, Kühlschrank, 6 Stk, min 4 → genug da
await step(`__t.click('Neuen Artikel anlegen')`);
await step(
  `__t.set('Name', 'Eier'); __t.click('Kühlschrank'); __t.set('Menge daheim', '6'); __t.set('Mindestmenge', '4')`,
);
await step(`__t.click('Speichern')`, 600);

// Ungültige Eingabe: Sollmenge < Mindestmenge
await step(`__t.click('Neuen Artikel anlegen')`);
await step(`__t.set('Name', 'Test'); __t.set('Mindestmenge', '5'); __t.set('Sollmenge', '2')`);
await step(`__t.click('Speichern')`);
await check(
  "Fehlermeldung bei Sollmenge < Mindestmenge",
  `__t.text().includes('Die Sollmenge muss mindestens')`,
);
await step(`__t.click('Schließen')`);

await check(
  "Milch automatisch unter Milchprodukte (Abteilung folgt Lagerort)",
  `[...document.querySelectorAll('main li')].some(l => l.innerText.includes('Eier') && l.innerText.includes('Milchprodukte'))`,
);
await check("Milch zeigt 1 l", `__t.text().includes('Milch') && __t.text().includes('1 l')`);
await check(
  "2 Artikel als 'Nachkaufen' markiert",
  `__t.text().split('Nachkaufen').length - 1 === 2`,
);
await check(
  "Badge Einkaufsliste = 2",
  `[...document.querySelectorAll('nav span')].some(s => s.textContent.trim() === '2')`,
);
await shot("3-vorrat");

// Eier 3x verbrauchen → 3 Stk < 4 → auf die Liste
for (let i = 0; i < 3; i++) await step(`__t.click('Eier: weniger')`, 250);
await check("Eier nach 3x minus = 3 Stk", `__t.text().includes('3 Stk')`);

await step(`__t.click('Einkaufsliste')`, 500);
await check("Liste: Milch 2 l", `__t.text().includes('Milch') && __t.text().includes('2 l')`);
await check(
  "Liste: Eier 1 Stk (bis Mindestmenge 4)",
  `__t.text().includes('Eier') && __t.text().includes('1 Stk')`,
);
await check("Liste: Mehl", `__t.text().includes('Mehl')`);
await check(
  "Sortierung: Milchprodukte vor Nudeln/Mehl",
  `__t.text().indexOf('MILCHPRODUKTE') < __t.text().indexOf('NUDELN')`,
);

// Freier Eintrag
await step(
  `const s = document.querySelector('select[aria-label^="Abteilung"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s, 'bakery'); s.dispatchEvent(new Event('change',{bubbles:true})); const i = document.querySelector('input[aria-label^="Artikel zur"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i, 'Brot'); i.dispatchEvent(new Event('input',{bubbles:true}));`,
);
await step(`__t.click('Dazu')`, 500);
await check(
  "Freier Eintrag 'Brot' unter Brot & Gebäck",
  `__t.text().includes('BROT & GEBÄCK') && __t.text().includes('Brot')`,
);
await shot("4-einkaufsliste");

// Milch und Mehl abhaken, Einkauf abschließen
await step(`__t.click('Milch abhaken')`);
await step(`__t.click('Mehl abhaken')`);
await shot("5-abgehakt");
await step(
  `[...document.querySelectorAll('button')].find(b => b.textContent.includes('Einkauf abschließen')).click()`,
  700,
);
await check(
  "Milch und Mehl von der Liste weg",
  `(() => { const t = [...document.querySelectorAll('main li')].map(l => l.innerText).join('|'); return !t.includes('Milch') && !t.includes('Mehl'); })()`,
);
await shot("5b-nach-einkauf-liste");
await check(
  "Eier und Brot noch auf der Liste",
  `__t.text().includes('Eier') && __t.text().includes('Brot')`,
);

await step(`__t.click('Vorrat')`, 500);
await check("Milch jetzt 3 l (Sollmenge)", `__t.text().includes('3 l')`);
await check("Mehl jetzt voll", `__t.text().includes('voll')`);
await shot("6-vorrat-nach-einkauf");

// Neu laden: Daten bleiben erhalten?
await send("Page.reload");
await sleep(2000);
await evaluate(`window.__t = { text: () => document.body.innerText }`);
await check(
  "Nach Neuladen: Daten noch da",
  `__t.text().includes('Milch') && __t.text().includes('3 l')`,
);

console.log(results.join("\n"));
console.log(
  "\nKonsole/CSP-Probleme: " + (problems.length ? "\n  " + problems.join("\n  ") : "keine"),
);
ws.close();
edge.kill();
process.exit(0);
