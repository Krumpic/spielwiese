import { startBrowser } from "./lib.mjs";
const t = await startBrowser(process.argv[2], 9337);
const { step, check, shot, evaluate, results, send, sleep } = t;

// ---------- 1. Echter Update-Test: Datenbank im Stand von Phase 3 (Dexie-Version 3 = IndexedDB 30) ----------
await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
});
await send("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-color-scheme", value: "light" }],
});
await send("Page.navigate", { url: "http://localhost:4173/spielwiese/icon-192.png" }); // gleiche Origin, ohne App
await sleep(1000);
const created = await evaluate(`new Promise((resolve, reject) => {
  const req = indexedDB.open("kornspeicher-db", 30);
  req.onupgradeneeded = () => {
    const db = req.result;
    const items = db.createObjectStore("items", { keyPath: "id", autoIncrement: true });
    for (const i of ["name", "location", "section"]) items.createIndex(i, i);
    const shopping = db.createObjectStore("shopping", { keyPath: "id", autoIncrement: true });
    for (const i of ["itemId", "section"]) shopping.createIndex(i, i);
    db.createObjectStore("meta", { keyPath: "key" });
    db.createObjectStore("recipes", { keyPath: "id", autoIncrement: true }).createIndex("name", "name");
  };
  req.onerror = () => reject(req.error);
  req.onsuccess = () => {
    const db = req.result;
    const tx = db.transaction(["items", "recipes", "meta"], "readwrite");
    const base = { location: "fridge", section: "dairy", mode: "exact", unit: "piece", level: "full", minQuantity: null, targetQuantity: null, minLevel: null, createdAt: 1763640000000, updatedAt: 1763640000000 };
    tx.objectStore("items").add({ ...base, id: 1, name: "Joghurt", quantity: 3 });
    tx.objectStore("items").add({ ...base, id: 2, name: "Käse", quantity: 1 });
    tx.objectStore("items").add({ ...base, id: 3, name: "Reis", quantity: 2, location: "pantry", section: "staples", unit: "kg" });
    tx.objectStore("recipes").add({ id: 1, name: "Käsebrot", servings: 1, ingredients: [{ itemId: 2, quantity: 1, unit: "piece", basic: false }], steps: ["Belegen"], createdAt: 1763640000000, updatedAt: 1763640000000 });
    tx.objectStore("meta").put({ key: "theme", value: "ocean" });
    tx.oncomplete = () => { db.close(); resolve(true); };
  };
})`);
results.push(`${created ? "OK  " : "FAIL"} Alte Datenbank (Stand Phase 3) angelegt`);

await t.open("http://localhost:4173/spielwiese/");
await check(
  "Nach Update: alle 3 Artikel noch da",
  `__t.rows().includes('Joghurt') && __t.rows().includes('Käse') && __t.rows().includes('Reis')`,
);
await check(
  "Nach Update: Design 'Ozeanblau' erhalten",
  `document.documentElement.dataset.theme === 'ocean'`,
);
const migrated = await evaluate(
  `new Promise((resolve) => { const r = indexedDB.open("kornspeicher-db"); r.onsuccess = () => { const db = r.result; const out = { version: db.version, hasIndex: db.transaction("items").objectStore("items").indexNames.contains("expiresOn") && db.transaction("items").objectStore("items").indexNames.contains("barcode") }; const g = db.transaction("items").objectStore("items").getAll(); g.onsuccess = () => { out.expires = g.result.map(i => i.expiresOn); out.barcodes = g.result.map(i => i.barcode); db.close(); resolve(out); }; }; })`,
);
results.push(
  `${migrated.version === 50 && migrated.hasIndex && migrated.expires.every((e) => e === null) && migrated.barcodes.every((b) => b === null) ? "OK  " : "FAIL"} Migration v3→v5: Version ${migrated.version}, Indizes ${migrated.hasIndex}, Ablauf ${JSON.stringify(migrated.expires)}, Barcode ${JSON.stringify(migrated.barcodes)}`,
);
await step(`__t.nav('Rezepte')`, 500);
await check("Nach Update: Rezept noch da", `__t.rows().includes('Käsebrot')`);
await step(`__t.nav('Vorrat')`, 400);

// ---------- 2. Ablaufdaten setzen ----------
const dateIn = (days) =>
  `(() => { const d = new Date(); d.setDate(d.getDate() + ${days}); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })()`;
const setDate = async (name, days) => {
  await step(
    `[...document.querySelectorAll('main li button')].find(b => b.innerText.startsWith('${name}')).click()`,
  );
  await step(`__t.set('Ablaufdatum', ${dateIn(days)})`);
  await step(`__t.click('Speichern')`, 500);
};
await setDate("Joghurt", 1);
await setDate("Käse", -2);
await setDate("Reis", 200);

await check("Joghurt: 'läuft morgen ab'", `__t.rows().includes('läuft morgen ab')`);
await check("Käse: 'seit 2 Tagen abgelaufen'", `__t.rows().includes('seit 2 Tagen abgelaufen')`);
await check("Reis: 'haltbar bis …' (nicht als Warnung)", `__t.rows().includes('haltbar bis')`);
await check("Hinweis: 2 Artikel laufen bald ab", `__t.text().includes('2 Artikel laufen bald ab')`);
await shot("1-vorrat-ablauf");

await step(
  `[...document.querySelectorAll('main button')].find(b => b.innerText.includes('laufen bald ab')).click()`,
  400,
);
await check(
  "Filter 'Läuft bald ab' zeigt nur Käse und Joghurt, Käse zuerst",
  `(() => { const r = __t.rows(); return r.indexOf('Käse') >= 0 && r.indexOf('Käse') < r.indexOf('Joghurt') && !r.includes('Reis'); })()`,
);
await shot("2-filter");

// Leer verbraucht → Datum weg
await step(`__t.click('Alle')`, 300);
for (let i = 0; i < 3; i++) await step(`__t.click('Joghurt: weniger')`, 250);
await check(
  "Joghurt leer → Datum gelöscht, nur noch 1 Artikel läuft ab",
  `__t.text().includes('1 Artikel läuft bald ab') && !__t.rows().includes('läuft morgen ab')`,
);

t.finish();
process.exit(0);
