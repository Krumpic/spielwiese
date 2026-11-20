// Browser-Test: Barcode eintippen + Online-Suche ausgeschaltet (Fake-Kamera ohne Barcode)
import { startBrowser } from "./lib.mjs";

const t = await startBrowser(process.argv[2], 9339, {
  extraArgs: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const { step, check, results, send, dialogs } = t;

const offRequests = [];
await send("Fetch.enable", {
  patterns: [{ urlPattern: "*openfoodfacts*", requestStage: "Request" }],
});
t.onMessage = async (msg) => {
  if (msg.method !== "Fetch.requestPaused") return;
  offRequests.push(msg.params.request.url);
  await send("Fetch.failRequest", {
    requestId: msg.params.requestId,
    errorReason: "InternetDisconnected",
  });
};

await t.open("http://localhost:4173/spielwiese/");

// 1. Online-Suche an, aber „offline" → verständliche Meldung, Barcode trotzdem übernommen
await step(`__t.click('Barcode scannen')`, 600);
await step(`__t.aria('Barcode-Nummer', '12345678'); __t.click('OK')`, 300);
await check("Falsche Prüfziffer wird abgelehnt", `__t.scope().innerText.includes('Prüfziffer')`);
await step(`__t.aria('Barcode-Nummer', '9638 5074'); __t.click('OK')`, 1500);
await check(
  "Offline: Hinweis 'nicht erreichbar', Barcode übernommen",
  `__t.dialogText().includes('nicht erreichbar') && __t.dialogText().includes('96385074')`,
);
results.push(`${offRequests.length === 1 ? "OK  " : "FAIL"} Es wurde genau 1 Abfrage versucht`);
await step(`__t.click('Schließen')`);

// 2. Online-Suche ausschalten → keine Anfrage mehr
await step(`__t.nav('Einstellungen')`, 400);
await step(
  `[...document.querySelectorAll('label')].find(l => l.innerText.includes('Produktnamen online')).querySelector('input').click()`,
  500,
);
await step(`__t.nav('Vorrat')`, 400);
await step(`__t.click('Barcode scannen')`, 600);
await step(`__t.aria('Barcode-Nummer', '036000291452'); __t.click('OK')`, 800);
await check(
  "Online-Suche aus: 'Neuer Barcode – bitte Namen eingeben'",
  `__t.dialogText().includes('Neuer Barcode') && __t.dialogText().includes('036000291452')`,
);
results.push(
  `${offRequests.length === 1 ? "OK  " : "FAIL"} Online-Suche aus → wirklich keine weitere Anfrage`,
);

// 3. Barcode im Formular entfernen und speichern
await step(`__t.set('Name', 'Testprodukt')`);
await step(`__t.click('Entfernen')`, 300);
await check(
  "Barcode lässt sich entfernen",
  `!__t.dialogText().includes('036000291452') && __t.dialogText().includes('Barcode scannen')`,
);

results.push(`${dialogs.length === 0 ? "OK  " : "FAIL"} Kein alert()`);
t.finish();
process.exit(0);
