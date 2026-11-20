// Browser-Test Phase 2: Backup erstellen, Daten löschen, wiederherstellen, manipulierte Datei ablehnen.
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2];
const DL = join(OUT, "downloads");
const URL = "http://localhost:4173/spielwiese/";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9334;
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
    problems.push("EXCEPTION: " + msg.params.exceptionDetails.text);
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
  if (r.exceptionDetails)
    throw new Error("Eval: " + JSON.stringify(r.exceptionDetails.exception?.description));
  return r.result.value;
};
const shot = async (name) => {
  await sleep(400);
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, name + ".png"), Buffer.from(data, "base64"));
};
const helpers = `
  window.__t = {
    btn: (text) => [...(document.querySelector('[role=dialog]') ?? document).querySelectorAll('button')].find(b => b.textContent.replace(/\\u00AD/g, '').trim().replace(/^[0-9]+/, '') === text || b.getAttribute('aria-label') === text),
    click: (text) => { const b = window.__t.btn(text); if (!b) throw new Error('Knopf fehlt: ' + text); b.click(); },
    set: (label, value) => { const l = [...document.querySelectorAll('label')].find(l => l.querySelector('span')?.textContent.trim().startsWith(label)); const el = l.querySelector('input,select'); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); },
    text: () => document.body.innerText.replace(/\\u00AD/g, ''),
    items: () => [...document.querySelectorAll('main li')].map(l => l.innerText).join('|'),
  };`;
const step = async (code, wait = 350) => {
  await evaluate(code);
  await sleep(wait);
};
const results = [];
const check = async (name, expr) =>
  results.push(`${(await evaluate(expr)) ? "OK  " : "FAIL"} ${name}`);
const setFile = async (path) => {
  const { root } = await send("DOM.getDocument", { depth: -1, pierce: true });
  const { nodeId } = await send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: "input[type=file]",
  });
  await send("DOM.setFileInputFiles", { nodeId, files: [path] });
  await sleep(1200);
};

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("DOM.enable");
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

// Daten anlegen
await step(`__t.click('Ersten Artikel anlegen')`);
await step(
  `__t.set('Name', 'Milch'); __t.click('Kühlschrank'); __t.set('Menge daheim', '1'); __t.set('Einheit', 'l'); __t.set('Mindestmenge', '2'); __t.set('Sollmenge', '3')`,
);
await step(`__t.click('Speichern')`, 600);
await step(`__t.click('Neuen Artikel anlegen')`);
await step(`__t.set('Name', 'Reis'); __t.set('Menge daheim', '2')`);
await step(`__t.click('Speichern')`, 600);

await check("Backup-Erinnerung im Vorrat sichtbar", `__t.text().includes('Zeit für ein Backup')`);
await check(
  "Roter Punkt am Einstellungen-Tab",
  `!!document.querySelector('[aria-label="Backup fällig"]')`,
);
await shot("1-erinnerung");

await step(`__t.click('Einstellungen')`, 600);
await check("Letztes Backup: noch nie", `__t.text().includes('noch nie')`);
console.log(
  "canShare(files):",
  await evaluate(
    `'canShare' in navigator && navigator.canShare({ files: [new File(['x'], 'a.json', { type: 'application/json' })] })`,
  ),
);
await step(`__t.click('Backup erstellen')`, 2500);
const files = readdirSync(DL).filter((f) => f.endsWith(".json"));
if (files.length === 0) {
  console.log("Keine Datei. Dialoge:", dialogs, "Probleme:", problems);
  await shot("debug");
  ws.close();
  edge.kill();
  process.exit(1);
}
results.push(
  `${files.length === 1 && /^kornspeicher-backup-\d{4}-\d{2}-\d{2}\.json$/.test(files[0]) ? "OK  " : "FAIL"} Backup-Datei heruntergeladen (${files.join(", ")})`,
);
const backupPath = join(DL, files[0]);
const backup = JSON.parse(readFileSync(backupPath, "utf8"));
results.push(
  `${backup.items?.length === 2 && backup.shopping?.length === 1 ? "OK  " : "FAIL"} Backup enthält 2 Artikel + 1 Listeneintrag`,
);
await check(
  "Letztes Backup aktualisiert",
  `!__t.text().includes('noch nie') && __t.text().includes('(heute)')`,
);
await check("Roter Punkt weg", `!document.querySelector('[aria-label="Backup fällig"]')`);
await shot("2-einstellungen");

// Alles löschen
await step(`__t.click('Vorrat')`, 500);
await check("Erinnerung im Vorrat weg", `!__t.text().includes('Zeit für ein Backup')`);
for (const name of ["Milch", "Reis"]) {
  await step(
    `[...document.querySelectorAll('main li button')].find(b => b.innerText.startsWith('${name}')).click()`,
  );
  await step(`__t.click('Löschen')`, 600);
}
await check("Vorrat ist leer", `__t.text().includes('noch leer')`);

// Manipulierte Datei
const evil = join(OUT, "manipuliert.json");
writeFileSync(
  evil,
  JSON.stringify({
    ...backup,
    items: [{ ...backup.items[0], quantity: -999, extra: "<script>alert(1)</script>" }],
  }),
);
await step(`__t.click('Einstellungen')`, 600);
let before = dialogs.length;
await setFile(evil);
results.push(
  `${dialogs.slice(before).some((d) => d.includes("beschädigt") || d.includes("ungültige")) ? "OK  " : "FAIL"} Manipulierte Datei abgelehnt: "${dialogs.slice(before).join(" / ")}"`,
);
const notJson = join(OUT, "kein-backup.json");
writeFileSync(notJson, '{"hallo":"welt"}');
before = dialogs.length;
await setFile(notJson);
results.push(
  `${dialogs.slice(before).some((d) => d.includes("keine Kornspeicher")) ? "OK  " : "FAIL"} Fremde Datei abgelehnt: "${dialogs.slice(before).join(" / ")}"`,
);
await check(
  "Nach abgelehnten Dateien: weiterhin 0 Artikel",
  `__t.text().includes('0 Artikel im Vorrat')`,
);

// Echtes Backup wiederherstellen
before = dialogs.length;
await setFile(backupPath);
const restoreDialogs = dialogs.slice(before);
results.push(
  `${restoreDialogs[0]?.includes("2 Artikel") && restoreDialogs[0]?.includes("ersetzt") ? "OK  " : "FAIL"} Rückfrage mit Vorschau angezeigt`,
);
results.push(
  `${restoreDialogs.some((d) => d.includes("wiederhergestellt")) ? "OK  " : "FAIL"} Erfolgsmeldung`,
);
await step(`__t.click('Vorrat')`, 600);
await check(
  "Milch und Reis wieder da",
  `__t.items().includes('Milch') && __t.items().includes('Reis')`,
);
await check("Milch wieder mit 1 l", `__t.items().includes('1 l')`);
await check(
  "Einkaufsliste wieder mit 1 Eintrag",
  `[...document.querySelectorAll('nav span')].some(s => s.textContent.trim() === '1')`,
);
await shot("3-wiederhergestellt");

console.log(results.join("\n"));
console.log(
  "\nKonsole/CSP-Probleme: " + (problems.length ? "\n  " + problems.join("\n  ") : "keine"),
);
ws.close();
edge.kill();
process.exit(0);
