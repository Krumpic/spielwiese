# Phasenplan – Kornspeicher

Status: ⬜ offen · 🔄 in Arbeit · ✅ fertig

Jede Phase endet mit: `npm run check` grün → Commit auf Feature-Branch → **Nutzer reviewt und pusht**.

---

## Phase 0 – Fundament & Sicherheit ✅

Ziel: Ein leeres, aber abgesichertes Projekt, das sich auf dem iPhone installieren lässt.

- [x] `.gitignore` (Secrets, Backups, Build-Artefakte)
- [x] `CLAUDE.md` mit Sicherheits- und Commit-Regeln
- [x] Claude-Schutz: `.env` gesperrt, `git push` gesperrt, Commit nur mit grünem `npm run check`
- [x] Vite + React + TypeScript (strict) aufsetzen
- [x] Prettier + ESLint (inkl. Security-Plugin) + Vitest
- [x] `npm run check` (Format, Lint, Typen, Tests, `npm audit`, Secret-Scan)
- [x] Git-Hook (husky) mit denselben Prüfungen – gilt auch für Commits des Nutzers
- [x] Content Security Policy (wird beim Build in `index.html` eingefügt, mit Tests)
- [x] PWA-Grundgerüst: Manifest, App-Icon, Service Worker, Offline-Start
- [x] GitHub-Actions-Workflow für GitHub Pages (Actions auf Commit-IDs festgenagelt, minimale Rechte)
- [x] `env.example` anlegen (nur Variablennamen, keine Werte)
- [x] `.npmrc`: exakte Versionen, keine Installations-Skripte fremder Pakete
- [x] Repo bereinigt: private E-Mail aus der Historie entfernt, anonyme GitHub-Adresse eingestellt
- [x] Nutzer: GitHub Pages auf „GitHub Actions" umgestellt, gepusht, auf dem iPhone getestet
- [ ] Nutzer: 2FA auf GitHub aktivieren, Branch-Schutz für `main` einrichten

**Ergebnis:** Leere App mit Icon auf dem iPhone-Home-Bildschirm, startet offline.

## Phase 1 – Vorrat & Einkaufsliste (MVP) ✅

Ziel: Das Hauptproblem lösen – „Was habe ich zuhause, was brauche ich?"

- [x] Name „Kornspeicher" + Ähren-Icon
- [x] Datenmodell v1 in Dexie (Artikel, Einkaufsliste); Fachlogik als getestete reine Funktionen
- [x] Artikel anlegen/bearbeiten/löschen (Eingaben mit zod geprüft)
- [x] Lagerorte: Vorratsschrank, Kühlschrank, Tiefkühler (vom Nutzer zugewiesen)
- [x] Supermarkt-Abteilungen pro Artikel (folgt beim Anlegen dem Lagerort, bis von Hand gewählt)
- [x] Mengen-Modus pro Artikel: **genau** (Zahl + Einheit) oder **grob** (voll/halb/wenig/leer)
- [x] Schnelles +/- bzw. Füllstand antippen
- [x] Mindestmenge + Sollmenge → automatisch mit richtiger Menge auf die Einkaufsliste
- [x] Einkaufsliste nach Abteilungen sortiert, freie Einträge, abhaken, „Einkauf abschließen" → Vorrat
- [x] Suche und Filter nach Lagerort
- [x] Handy-optimierte Oberfläche (große Buttons, Daumen-Bedienung, Safe-Area)
- [x] Browser-Test des kompletten Ablaufs (18 Prüfungen, keine Konsolen-/CSP-Fehler)
- [x] Nutzer: auf dem iPhone ausprobiert („gefällt mir richtig gut")

## Phase 2 – Datensicherung ✅

- [x] Datenbank-Tests mit `fake-indexeddb` (vom Nutzer freigegeben) inkl. erstem Migrationstest v1 → v2
- [x] Schema v2: Tabelle `meta` (Zeitpunkt des letzten Backups)
- [x] Export als JSON-Datei: iOS-Teilen-Dialog → Dateien/iCloud Drive, sonst Download als Ersatz
- [x] Import: Größenlimit, strenge zod-Prüfung (unbekannte Felder, IDs, Verweise), Vorschau + Bestätigung,
      Ersetzen in einer Transaktion (bei Fehler bleibt alles beim Alten)
- [x] Versioniertes Backup-Format (v1), neuere Versionen werden mit Hinweis abgelehnt
- [x] Erinnerung nach 14 Tagen ohne Backup (Hinweis im Vorrat + roter Punkt am Tab)
- [x] Persistenten Speicher anfragen (`navigator.storage.persist()`) + Anzeige in den Einstellungen
- [x] CI-Workflow: Prüfungen laufen bei jedem Pull Request (als Pflicht-Prüfung für `main` nutzbar)
- [x] Browser-Test: Backup → alles löschen → manipulierte/fremde Datei abgelehnt → Wiederherstellen (17 Prüfungen)
- [x] Nutzer: am iPhone ausprobiert („das funktioniert alles")
- [ ] Nutzer: in den Branch-Regeln „checks" als Pflicht-Prüfung + „Do not allow bypassing" aktivieren

## Phase 3 – Rezepte 🔄

- [x] Rezepte mit Name, Portionen, Zutaten (aus dem Vorrat gewählt) und nummerierten Schritten
- [x] Zutat direkt im Rezept neu im Vorrat anlegen
- [x] Einheiten-Umrechnung g↔kg, ml↔l; Auswahl nur kompatibler Einheiten
- [x] Grundzutaten (Salz, Öl …): blockieren nicht, werden nicht abgezogen
- [x] Ampel: grün = alles da, gelb = teilweise, rot = nichts da; Liste sortiert, Filter „Kann ich kochen"
- [x] Portionen umstellbar, Mengen rechnen mit
- [x] Gelb/Rot: „Fehlende Zutaten auf die Einkaufsliste" (nur Fehlmenge, in Vorrats-Einheit)
- [x] Grün: „Jetzt kochen" → Abzug vom Vorrat; grob geschätzte Zutaten: „Wie viel ist noch da?"
- [x] Nach dem Kochen leere Zutaten (ohne Mindestmenge) → Rückfrage, verbrauchte Menge auf die Liste
- [x] „Rückgängig" nach dem Kochen
- [x] Artikel löschen warnt, wenn er in Rezepten steckt, und entfernt ihn dort
- [x] Schema v3 (Tabelle `recipes`) + Migrationstests v1 → v3 und v2 → v3
- [x] Backup-Format v2 mit Rezepten; Backups v1 bleiben importierbar (Test)
- [x] Browser-Tests: Rezepte 34, Backup 17, Phase 1 18 Prüfungen – alle grün, keine Konsolen-/CSP-Fehler
- [ ] Nutzer: am iPhone ausprobieren

## Phase 4 – Komfort ⬜

- [ ] Barcode-Scanner (Kamera) + Produktname über Open Food Facts (nur Barcode wird gesendet)
- [ ] Ablaufdatum + Hinweis auf bald ablaufende Artikel
- [ ] Verbrauchsstatistik („Was kaufe ich am häufigsten?")

## Phase 5 – Angebote (Recherche) ⬜

- [ ] Prüfen, ob es eine legale, offizielle Schnittstelle für Angebote gibt
- [ ] Falls API-Schlüssel nötig: Lösung **ohne** Schlüssel im Frontend (z. B. kleiner Proxy) – eigene Sicherheitsbewertung
- [ ] Fallback: Link aus der Einkaufsliste zur Angebotssuche

---

## Offene Entscheidungen

- Kategorien und Einheiten (Vorschlagsliste erstellen und abstimmen)
