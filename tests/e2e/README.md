# Browser-Tests

Echte Abläufe in einem echten Browser (Edge, ohne Fenster), so wie man die App am iPhone bedient:
Artikel anlegen, einkaufen, kochen, Backup, Designs, Scanner mit künstlicher Kamera.

```bash
npm run test:e2e
```

Baut die App, startet die Vorschau (mit aktiver Content Security Policy), führt alle Testreihen
aus und zeigt eine Zusammenfassung. Screenshots und Ergebnisse landen in `test-results/e2e/`
(nicht im Repo).

**Voraussetzungen:** Windows mit Microsoft Edge am Standardort. Anderer Chromium-Browser:
Pfad über die Umgebungsvariable `EDGE_PATH` angeben. Port 4173 muss frei sein.

| Datei                    | Prüft                                                                            |
| ------------------------ | -------------------------------------------------------------------------------- |
| `run.mjs`                | Vorrat, Mindest-/Sollmenge, Einkaufsliste, Einkauf abschließen, Neuladen         |
| `recipes.mjs`            | Rezepte, Ampel, Einheiten, Portionen, Kochen, Rückgängig, Löschen-Warnung        |
| `backup.mjs`             | Backup erstellen, alles löschen, manipulierte Dateien ablehnen, Wiederherstellen |
| `designs.mjs`            | 6 Farben, Hell/Dunkel/Automatisch, bleibt nach Neuladen erhalten                 |
| `expiry.mjs`             | Echte Migration einer alten Datenbank (Stand Phase 3), Ablaufdatum, Filter       |
| `scanner.mjs`            | Barcode aus Kamerabild, abgefangene + manipulierte Open-Food-Facts-Antwort, CSP  |
| `scanner-manual.mjs`     | Nummer eintippen, Prüfziffer, offline, Online-Suche abgeschaltet                 |
| `scan-form.mjs`          | Scan im Artikel-Formular übernimmt den Namen / macht einen Vorschlag             |
| `overflow.mjs`           | Kein seitliches Verschieben in allen Fenstern bei 390/375/320 px                 |
| `lib.mjs`                | Gemeinsame Hilfen (Browser steuern über das DevTools-Protokoll)                  |
| `make-barcode-video.mjs` | Erzeugt das künstliche Kamerabild mit einem EAN-13-Barcode                       |

**Gut zu wissen**

- Anfragen an Open Food Facts werden in den Tests **abgefangen** – es geht nichts ins Internet.
- Die Meldung „MultiFormatReader: non-ReaderException“ in der Konsole stammt aus der
  Scanner-Bibliothek, wenn ein Bild keinen Barcode enthält – harmlos.
- In `eslint.config.js` ist für diesen Ordner die Regel „Dateizugriff mit variablem Pfad“
  abgeschaltet (vom Nutzer freigegeben): Die Skripte schreiben bewusst in übergebene Ordner.
