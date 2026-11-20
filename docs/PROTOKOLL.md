# Projektprotokoll – Kornspeicher

> **Für die nächste Sitzung:** Claude zuerst diese Datei, [CLAUDE.md](../CLAUDE.md) und
> [PHASENPLAN.md](PHASENPLAN.md) lesen lassen. Dann ist der komplette Stand bekannt.

Stand: 20.11.2026 · Projekt vorerst abgeschlossen

---

## 1. Worum es geht

**Kornspeicher** ist eine private iPhone-App (Progressive Web App) gegen das Problem „Ich weiß
nie, was ich daheim habe und was ich einkaufen muss“.

|                  |                                                           |
| ---------------- | --------------------------------------------------------- |
| **App (live)**   | https://krumpic.github.io/spielwiese/                     |
| **Repository**   | https://github.com/Krumpic/spielwiese (öffentlich)        |
| **Installation** | Safari → Teilen → „Zum Home-Bildschirm“                   |
| **Nutzer**       | eine Person, nur iPhone                                   |
| **Daten**        | nur lokal am iPhone (IndexedDB) – kein Server, kein Konto |
| **Kosten**       | keine (GitHub Pages kostenlos)                            |

## 2. Was die App kann

**Vorrat** – Lebensmittel mit Lagerort (Vorratsschrank / Kühlschrank / Tiefkühler) und
Supermarkt-Abteilung. Menge **genau** (Zahl + Einheit) oder **grob** (voll/halb/wenig/leer).
+/- bzw. Füllstand antippen. Mindestmenge + Sollmenge. Suche, Filter, Ablaufdatum mit Warnung
(3 Tage vorher), Filter „Läuft bald ab“.

**Einkaufsliste** – füllt sich automatisch (Mindestmenge unterschritten → fehlende Menge bis zur
Sollmenge). Sortiert nach Laufweg im Supermarkt. Freie Einträge. Abhaken → „Einkauf
abschließen“ → alles wandert in den Vorrat (mit Einheiten-Umrechnung).

**Rezepte** – Zutaten aus dem Vorrat, nummerierte Schritte, Portionen umstellbar. Ampel
🟢 alles da / 🟡 teilweise / 🔴 nichts. Grundzutaten (Salz, Öl) blockieren nicht.
Gelb/Rot: fehlende Zutaten auf die Liste (nur Fehlmenge). Grün: „Jetzt kochen“ zieht vom
Vorrat ab, fragt bei grob geschätzten Zutaten nach dem neuen Stand, bietet leer gewordene
Zutaten für die Liste an, „Rückgängig“ möglich.

**Barcode-Scanner** – Rückkamera oder Nummer eintippen. Bekannter Barcode → Artikel öffnet
sich. Unbekannt → Produktname von Open Food Facts (nur die Nummer wird gesendet; in den
Einstellungen abschaltbar). Auch im Artikel-Formular: leerer Name wird ausgefüllt, sonst
Vorschlag mit „Übernehmen“.

**Einstellungen** – Backup erstellen (iOS-Teilen → iCloud Drive) / wiederherstellen (streng
geprüft, Vorschau, Bestätigung), Erinnerung nach 14 Tagen. 6 Signature-Farben + Hell/Dunkel/
Automatisch. Online-Produktsuche an/aus.

## 3. Technik

| Bereich    | Technik                                                         |
| ---------- | --------------------------------------------------------------- |
| Oberfläche | Vite 8, React 19, TypeScript 6 (strict), Tailwind CSS 4         |
| Daten      | IndexedDB über Dexie 4, Prüfung mit zod 4                       |
| PWA        | vite-plugin-pwa (Service Worker, offline)                       |
| Scanner    | @zxing/browser + @zxing/library (nur bei Bedarf geladen)        |
| Qualität   | ESLint 10 (+ Security-Plugin), Prettier, Vitest, fake-indexeddb |
| Sicherheit | npm audit, secretlint, CSP, Husky-Git-Hook, Claude-Wächter-Hook |
| Hosting    | GitHub Pages über GitHub Actions (CI + Deploy)                  |

**Ordner**

```
src/domain/   Fachlogik als reine Funktionen (+ Tests) – Regeln, Umrechnung, Backup-Format
src/db/       Datenbank: schema.ts (Versionen/Migrationen), repository.ts (alle Schreibzugriffe)
src/ui/       Oberfläche (React-Komponenten)
src/security/ Content Security Policy (+ Test)
src/theme.css ERZEUGT von scripts/generate-theme.mjs (npm run theme)
scripts/      Icons, Design-Farben, Test-Starter
.github/      ci.yml (prüft Pull Requests), deploy.yml (veröffentlicht main)
.claude/      Schutzregeln für Claude (nur der Nutzer ändert diese)
```

**Versionen, die sich weiterentwickeln müssen** (siehe CLAUDE.md, Abschnitt 4)

| Was              | Aktuell | Verlauf                                                              |
| ---------------- | ------- | -------------------------------------------------------------------- |
| Datenbank-Schema | **v5**  | v1 Vorrat+Liste · v2 meta · v3 Rezepte · v4 Ablaufdatum · v5 Barcode |
| Backup-Format    | **v4**  | v1 · v2 +Rezepte · v3 +Ablaufdatum · v4 +Barcode (alle importierbar) |

## 4. Sicherheit (Kurzfassung)

- **Daten** bleiben am iPhone. Das Repo enthält nur Code – geprüft: keine Geheimnisse, keine
  persönlichen Daten, keine private E-Mail in der Historie.
- **CSP:** Code/Styles nur von der App selbst; einzige externe Adresse:
  `connect-src https://world.openfoodfacts.org` (vom Nutzer freigegeben, abschaltbar).
- **Pakete:** feste Versionen, keine Installations-Skripte (`.npmrc`), `npm audit` bei jedem
  Commit und Pull Request. GitHub Actions auf Commit-IDs festgenagelt, minimale Rechte.
- **Importe/externe Antworten** werden mit zod streng geprüft und nur als Text angezeigt.
- **Claude-Regeln:** `.env` ist für Claude gesperrt, Claude pusht nie, Commits nur mit grünem
  `npm run check`, nie direkt auf `main` (technisch erzwungen über `.claude/`).

## 5. Arbeitsablauf

```
1. Claude: neuer Branch (z. B. phase-5/…) → Code + Tests
2. Claude: npm run check grün → Commit (Hooks prüfen automatisch nochmal)
3. Du:     git push -u origin <branch>
4. Du:     Pull Request auf GitHub → CI „checks" grün → Merge
5. GitHub: Deploy läuft automatisch → App am iPhone 1–2× schließen/öffnen
```

Wichtige Befehle: `npm run dev` · `npm run build` · `npm run preview` · `npm run check` ·
`npm run icons` · `npm run theme` · nach dem Klonen einmal `npm ci` und `npm run hooks:install`.

**Vor Änderungen an Datenbank oder Backup-Format:** am iPhone ein Backup machen.

## 6. Chronik und Entscheidungen

| Phase     | Inhalt                        | Entscheidungen des Nutzers                                                                                                                                         |
| --------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Start     | Idee, Technik-Wahl            | PWA statt nativer App (kein Mac nötig). Nur ein Nutzer, nur iPhone → keine Cloud. Mengen teils genau, teils grob.                                                  |
| 0         | Fundament & Sicherheit        | `.env` nur für den Nutzer, nur der Nutzer pusht, Checks vor jedem Commit, „so sicher wie möglich“.                                                                 |
| –         | Repo-Bereinigung              | Private E-Mail aus der Historie entfernt (Repo neu angelegt), anonyme GitHub-Adresse eingestellt.                                                                  |
| 1         | Vorrat & Einkaufsliste        | Name **Kornspeicher**, Ähren-Icon. Lagerorte: Vorratsschrank, Kühlschrank, Tiefkühler. Liste nach Supermarkt-Abteilung. Einkauf wandert automatisch in den Vorrat. |
| 2         | Datensicherung                | `fake-indexeddb` für Datenbank-Tests freigegeben.                                                                                                                  |
| 3         | Rezepte                       | Ampel-Idee vom Nutzer. Grob geschätzte Zutaten: nach Kochen nachfragen. Portionen umstellbar. Keine Fotos. Schritte nummeriert.                                    |
| 4         | Designs, Ablaufdatum, Scanner | 6 Farben + Dunkelmodus. Ein Ablaufdatum pro Artikel. Scanner + Open Food Facts nach Sicherheitsbewertung freigegeben. Statistik → später.                          |
| Fix       | Fenster & Scan                | Fenster nur senkrecht scrollbar. Scan im Formular übernimmt den Namen.                                                                                             |
| Abschluss | Review                        | Unabhängiger Review: keine Sicherheitslücke; 2 Datenfehler gefunden und behoben (Obergrenze bei Mengen, Einheiten beim Einkauf).                                   |

**Geprüft beim Abschluss:** 148 automatische Tests, 122 Prüfungen in Browser-Tests (inkl.
echter Datenbank-Migration vom Stand Phase 3, Scanner mit künstlicher Kamera, manipulierter
Open-Food-Facts-Antwort, Überlauf-Messung aller Fenster), `npm audit` 0 Lücken,
Geheimnis-Scan sauber, Live-Seite mit aktiver CSP und ohne Inline-Skripte.

## 7. Bekannte Eigenheiten (für Claude wichtig)

- **Windows + Vitest:** Tests nur über `npm test` starten (Starter `scripts/run-tests.mjs`
  behebt ein Problem mit klein geschriebenem Laufwerksbuchstaben `c:\`).
- **Commit-Messages** über Datei (`git commit -F …`): PowerShell 5.1 zerlegt Anführungszeichen.
  Das Wort „.env“ darf nicht in Befehlen/Commit-Messages stehen (Wächter blockiert).
- **Dateinamen mit „secret“** sind global gesperrt → Konfiguration liegt in `config/leakscan*`.
- **Lagerort-Namen** enthalten weiche Trennzeichen (`\u00AD`) für saubere Umbrüche.
- **zxing** schreibt bei Bildern ohne Barcode harmlose Meldungen in die Konsole.
- **Browser-Tests** (Edge über DevTools-Protokoll) liegen NICHT im Repo – siehe offene Punkte.

## 8. Offene Punkte und Ideen

**Einstellungen auf GitHub (Nutzer)**

- [x] Pages über „GitHub Actions“, Deploy läuft
- [x] Branch-Schutz für `main` aktiv, gilt auch für Admins (kein Umgehen)
- [ ] **Pflicht-Prüfung `checks` auswählen** (Settings → Branches → Regel für `main` →
      „Require status checks to pass“ → `checks`) – laut GitHub-API noch nicht gesetzt
- [ ] **Dependabot-Warnungen einschalten** (Settings → Code security → Dependabot alerts):
      E-Mail, falls in einem Paket eine Lücke bekannt wird – wichtig, solange das Projekt ruht
- [ ] 2FA, „Keep my email private“ – kann Claude nicht prüfen, bitte selbst bestätigen
- [ ] Optional: alte Branches auf GitHub löschen (phase-1 … fix/…) – alle sind gemergt

**Mögliche nächste Schritte**

- **Verbrauchsstatistik** („Was kaufe/verbrauche ich am meisten?“) – vom Nutzer auf später
  verschoben; braucht ein Verbrauchsprotokoll (neue Tabelle → Schema v6, Backup v5).
- **Phase 5 – Angebote:** keine offizielle, frei nutzbare Angebots-Schnittstelle bekannt;
  Fallback wäre ein Link zur Angebotssuche.
- **Rezepte aus dem Internet (Idee vom Nutzer):**
  - _TheMealDB_ – frei, ohne eigenen Schlüssel, aber englisch und nur einige hundert Rezepte;
    neue CSP-Adresse nötig, kommerzielle Nutzung eingeschränkt.
  - _Spoonacular, Edamam_ – brauchen API-Schlüssel; der wäre in einer PWA öffentlich →
    nur mit eigenem kleinem Server sinnvoll.
  - _Chefkoch_ – keine offizielle Schnittstelle. _Open Food Facts_ hat keine Rezepte.
  - **Empfehlung:** „Rezept einfügen“ – Text aus einer Website/App einfügen, die App erkennt
    Zutaten und Schritte. Ganz ohne externen Dienst, kein Sicherheitsrisiko.
- **Browser-Tests ins Repo aufnehmen** – braucht eine begründete Lint-Ausnahme für den
  Testordner (Regeln „Datei an variablen Pfad schreiben“). Nur mit Zustimmung des Nutzers.
- **Kleinere Punkte aus dem Review (niedrig):** Ladefehler der Datenbank wird nicht angezeigt
  (App bleibt bei „Wird geladen …“); „Rückgängig“ nach dem Kochen überschreibt Änderungen,
  die dazwischen am selben Artikel gemacht wurden.
- **Regelmäßige Sicherheitsprüfung:** wöchentlicher `npm audit` als GitHub-Workflow möglich.
