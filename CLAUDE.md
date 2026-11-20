# CLAUDE.md – Kornspeicher

Private Progressive Web App (PWA) für das iPhone: virtueller Vorratsschrank, Einkaufsliste, Rezepte.
Ein einziger Nutzer, Daten liegen **nur lokal auf dem Gerät** (IndexedDB). Kein Backend.
Phasen und Fortschritt: siehe [docs/PHASENPLAN.md](docs/PHASENPLAN.md).

Sicherheit hat in diesem Projekt **Vorrang vor Komfort und Geschwindigkeit**.

---

## 1. Unverhandelbare Regeln

1. **`.env`-Dateien sind tabu.** Niemals lesen, durchsuchen, ausgeben, bearbeiten oder per Shell anfassen –
   auch nicht „nur kurz prüfen". Nur der Nutzer pflegt sie. Benötigte Variablennamen werden in
   `env.example` (ohne Werte) dokumentiert.
2. **Niemals `git push`.** Pushen macht ausschließlich der Nutzer. Auch kein `gh pr create`, kein Deploy.
3. **Keine Prüfungen umgehen:** kein `--no-verify`, kein `core.hooksPath`, keine `eslint-disable`-Kommentare
   ohne Begründung im Code und Rückfrage beim Nutzer.
4. **Schutzdateien nicht ändern:** `.claude/settings.json` und `.claude/hooks/**` ändert nur der Nutzer.
5. **Keine Geheimnisse im Code oder im Repo.** Das Repo ist öffentlich (GitHub Pages).
   ⚠️ Alles mit `VITE_`-Präfix landet im ausgelieferten JavaScript und ist **öffentlich lesbar** –
   dort niemals Schlüssel oder Passwörter ablegen.
6. **Keine persönlichen Daten committen** (Backups, Exporte, Screenshots mit Inhalten).
7. **Nicht direkt auf `main` committen.** Arbeit auf Feature-Branches (`phase-1/vorrat-liste` o. ä.).

Diese Regeln werden zusätzlich technisch erzwungen (`.claude/settings.json` + `.claude/hooks/guard.mjs`).
Wenn ein Hook etwas blockiert: **nicht umgehen**, sondern dem Nutzer melden.

---

## 2. Pflicht-Check vor JEDEM Commit

Vor jedem `git commit` alle Punkte abarbeiten und das Ergebnis dem Nutzer kurz berichten.
Der Hook führt `npm run check` automatisch aus und blockiert den Commit bei Fehlern.

| #   | Prüfung       | Befehl / Vorgehen                                                                                        |
| --- | ------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | **Formatter** | `npm run format:check` (Prettier)                                                                        |
| 2   | **Linter**    | `npm run lint` (ESLint, inkl. Security-Regeln) – 0 Fehler, 0 Warnungen                                   |
| 3   | **Typen**     | `npm run typecheck` (`tsc --noEmit`, strict)                                                             |
| 4   | **Tests**     | `npm test`                                                                                               |
| 5   | **Security**  | `npm audit --audit-level=moderate` + Secret-Scan (`npm run secrets`) + manueller Diff-Review (siehe 2.1) |
| 6   | **Migration** | siehe Abschnitt 4 – bei jeder Änderung am Datenmodell                                                    |

`npm run check` bündelt 1–5 (und den automatischen Teil von 6).

### 2.1 Manueller Security-Review des Diffs

- Keine Secrets, Tokens, Schlüssel, persönlichen Daten im Diff (`git diff --staged`).
- Kein `dangerouslySetInnerHTML`, `eval`, `new Function`, `innerHTML`, `document.write`.
- Keine neuen externen Domains ohne Eintrag in der Content Security Policy und Rückfrage.
- Neue npm-Pakete: nur nach Rückfrage, nur verbreitete und gepflegte Pakete, exakte Version in `package.json`.
- Alle Daten von außen (Backup-Import, API-Antworten, URL-Parameter) werden mit **zod** validiert.

---

## 3. Technik-Stack

| Bereich     | Technologie                                                          |
| ----------- | -------------------------------------------------------------------- |
| Build       | Vite + React + TypeScript (`strict: true`)                           |
| Daten       | IndexedDB über Dexie.js                                              |
| Validierung | zod                                                                  |
| PWA         | vite-plugin-pwa (Service Worker, Manifest, Offline)                  |
| Styling     | Tailwind CSS                                                         |
| Qualität    | ESLint (+ `eslint-plugin-security`, `eslint-plugin-react`), Prettier |
| Tests       | Vitest                                                               |
| Hosting     | GitHub Pages (nur statische Dateien, HTTPS)                          |

### Sicherheits-Grundsätze im Code

- **Content Security Policy** per `<meta>` in `index.html`: `default-src 'self'`; nur explizit erlaubte
  `connect-src` (z. B. später `https://world.openfoodfacts.org`). Kein `unsafe-eval`, kein `unsafe-inline` für Skripte.
- Keine Skripte, Fonts oder Styles von CDNs – alles wird mitgebündelt.
- Eindeutiger Datenbankname (`kornspeicher-db`), da sich alle GitHub-Pages-Projekte eines Accounts eine Origin teilen.
- Fachlogik als reine Funktionen in `src/domain/` (gut testbar), Datenbankzugriffe nur über
  `src/db/repository.ts` (prüft jede Eingabe mit zod), Oberfläche in `src/ui/`.
- Die IDs in `src/domain/constants.ts` (Lagerorte, Abteilungen, Einheiten) werden gespeichert –
  nie umbenennen oder löschen, nur ergänzen.
- Fehlermeldungen zeigen keine internen Details an.
- Abhängigkeiten minimal halten; `package-lock.json` wird immer committet.
- `.npmrc` verbietet Installations-Skripte fremder Pakete (`ignore-scripts=true`). Nicht ändern;
  braucht ein Paket ein Skript, erst mit dem Nutzer besprechen.
- Verwundbare Unter-Abhängigkeiten werden per `overrides` in `package.json` repariert –
  niemals mit `npm audit fix --force` (stuft Pakete unbemerkt herab).
- Konfiguration des Geheimnis-Scanners liegt unter `config/leakscan*`.
- GitHub Actions nur mit fester Commit-ID (`uses: owner/action@<sha> # vX.Y.Z`) einbinden.

---

## 4. Datenbank-Migrationen (Dexie)

Die Daten liegen auf dem iPhone des Nutzers. **Ein Fehler in einer Migration kann Daten unwiderruflich zerstören.**

1. Das Schema steht ausschließlich in `src/db/schema.ts`.
2. Jede Schemaänderung = **neue Version** (`db.version(n + 1)`). Alte Versionen werden **nie** verändert oder gelöscht.
3. Jede Version, die Daten umformt, hat eine `.upgrade()`-Funktion.
4. Für jede Migration gibt es einen Test: Daten im alten Format anlegen → migrieren → Ergebnis prüfen.
5. Das Backup-Format (Export/Import) hat eine eigene Versionsnummer; ältere Backups müssen importierbar bleiben.
6. Vor dem Commit prüfen: Schema geändert? → Version erhöht? → Upgrade + Test vorhanden? → Backup-Format angepasst?
7. Migrationstests in `src/db/schema.test.ts`: Die alte Schema-Definition wird dort **eingefroren**
   nachgebaut, mit Daten befüllt und dann mit `KornspeicherDB` geöffnet. `SCHEMA_VERSION` mitziehen.
8. Datenbank-Tests nutzen `fake-indexeddb` (nur Entwicklung, landet nicht in der App).

---

## 5. Arbeitsweise

- Sprache: Oberfläche, Commit-Messages und Doku auf **Deutsch**; Code-Bezeichner auf Englisch.
- Kleine, nachvollziehbare Commits; Message beschreibt das _Warum_.
- Nach jeder abgeschlossenen Aufgabe den Phasenplan aktualisieren.
- Bei Unklarheit oder sicherheitsrelevanten Entscheidungen: **erst fragen, dann handeln.**

## 6. Befehle

```bash
npm install          # Abhängigkeiten installieren
npm run hooks:install # Git-Hook aktivieren (einmalig nach dem Klonen)
npm run dev          # Entwicklungsserver
npm run build        # Produktions-Build nach dist/
npm run preview      # Build lokal ansehen (mit aktiver CSP)
npm run check        # Alle Prüfungen (Pflicht vor jedem Commit)
npm run icons        # App-Icons neu erzeugen
```
