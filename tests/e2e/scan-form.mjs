// Browser-Test: „Barcode scannen" IM Artikel-Formular übernimmt auch den Namen
import { startBrowser } from "./lib.mjs";

const t = await startBrowser(process.argv[2], 9341, {
  extraArgs: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    `--use-file-for-fake-video-capture=${process.argv[3]}`,
  ],
});
const { step, check, evaluate, results, send, sleep, shot, dialogs } = t;

let requests = 0;
await send("Fetch.enable", {
  patterns: [{ urlPattern: "*openfoodfacts*", requestStage: "Request" }],
});
t.onMessage = async (msg) => {
  if (msg.method !== "Fetch.requestPaused") return;
  requests++;
  const body = JSON.stringify({
    status: 1,
    product: { product_name_de: "Bio-Vollmilch", brands: "Alpenhof", quantity: "1 l" },
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

await t.open("http://localhost:4173/spielwiese/");
const nameValue = `__t.scope().querySelector('input').value`;
const waitForScan = async () => {
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    if (await evaluate(`!document.querySelector('[aria-label="Barcode scannen"][role=dialog]')`))
      break;
  }
  await sleep(800);
};

// 1. Name leer → wird automatisch ausgefüllt
await step(`__t.click('Ersten Artikel anlegen')`, 400);
await step(`__t.click('Barcode scannen')`, 300);
await waitForScan();
await check("Barcode übernommen", `__t.dialogText().includes('4006381333931')`);
await check("Leerer Name → automatisch 'Bio-Vollmilch'", `${nameValue} === 'Bio-Vollmilch'`);
await check(
  "Hinweis 'übernommen – bitte prüfen' mit Marke/Menge",
  `__t.dialogText().includes('Name von Open Food Facts (Alpenhof, 1 l) übernommen')`,
);
await shot("1-name-ausgefuellt");
await step(`__t.click('Speichern')`, 600);
await check("Gespeichert", `__t.rows().includes('Bio-Vollmilch')`);

// 2. Name schon eingetippt → nicht überschreiben, nur Vorschlag
await step(`__t.click('Neuen Artikel anlegen')`, 400);
await step(`__t.set('Name', 'Meine Milch')`);
await step(`__t.click('Barcode scannen')`, 300);
await waitForScan();
await check(
  "Barcode gehört schon zu anderem Artikel → Warnung, Name unverändert",
  `__t.dialogText().includes('gehört schon zu „Bio-Vollmilch“') && ${nameValue} === 'Meine Milch'`,
);
await step(`__t.click('Schließen')`);

// 3. Bestehenden Artikel ohne Barcode bearbeiten, eigener Name → Vorschlag + Übernehmen
await step(`[...document.querySelectorAll('main li button')][0].click()`, 400);
await step(`__t.click('Entfernen')`, 200); // Barcode von Bio-Vollmilch lösen
await step(`__t.click('Speichern')`, 500);
await step(`[...document.querySelectorAll('main li button')][0].click()`, 400);
await step(`__t.set('Name', 'Milch')`);
await step(`__t.click('Barcode scannen')`, 300);
await waitForScan();
await check(
  "Eigener Name bleibt, Vorschlag wird angeboten",
  `${nameValue} === 'Milch' && __t.dialogText().includes('kennt das Produkt als:') && __t.dialogText().includes('„Bio-Vollmilch“')`,
);
await shot("2-vorschlag");
await step(`__t.click('Übernehmen')`, 300);
await check(
  "Nach 'Übernehmen' steht der Vorschlag im Namen",
  `${nameValue} === 'Bio-Vollmilch' && __t.dialogText().includes('Name übernommen')`,
);

results.push(
  `${requests === 2 ? "OK  " : "FAIL"} Online-Abfragen: ${requests} (erwartet 2 – beim Duplikat wird nicht nachgefragt)`,
);
results.push(`${dialogs.length === 0 ? "OK  " : "FAIL"} Kein alert()`);
t.finish();
process.exit(0);
