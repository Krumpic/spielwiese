# Phasenplan – Vorrat (Arbeitstitel)

Status: ⬜ offen · 🔄 in Arbeit · ✅ fertig

Jede Phase endet mit: `npm run check` grün → Commit auf Feature-Branch → **Nutzer reviewt und pusht**.

---

## Phase 0 – Fundament & Sicherheit 🔄
Ziel: Ein leeres, aber abgesichertes Projekt, das sich auf dem iPhone installieren lässt.

- [x] `.gitignore` (Secrets, Backups, Build-Artefakte)
- [x] `CLAUDE.md` mit Sicherheits- und Commit-Regeln
- [x] Claude-Schutz: `.env` gesperrt, `git push` gesperrt, Commit nur mit grünem `npm run check`
- [ ] Vite + React + TypeScript (strict) aufsetzen
- [ ] Prettier + ESLint (inkl. Security-Plugin) + Vitest
- [ ] `npm run check` (Format, Lint, Typen, Tests, `npm audit`, Secret-Scan)
- [ ] Git-Hook (husky) mit denselben Prüfungen – gilt auch für Commits des Nutzers
- [ ] Content Security Policy in `index.html`
- [ ] PWA-Grundgerüst: Manifest, App-Icon, Service Worker, Offline-Start
- [ ] GitHub-Actions-Workflow für GitHub Pages (Deploy nur aus `main`, nach Push durch Nutzer)
- [ ] `env.example` anlegen (nur Variablennamen, keine Werte)
- [ ] Nutzer: 2FA auf GitHub aktivieren, Branch-Schutz für `main` einrichten

**Ergebnis:** Leere App mit Icon auf dem iPhone-Home-Bildschirm, startet offline.

## Phase 1 – Vorrat & Einkaufsliste (MVP) ⬜
Ziel: Das Hauptproblem lösen – „Was habe ich zuhause, was brauche ich?"

- [ ] Datenmodell v1 in Dexie (Artikel, Kategorien, Einkaufsliste) + Tests
- [ ] Artikel anlegen/bearbeiten/löschen
- [ ] Mengen-Modus pro Artikel: **genau** (Zahl + Einheit) oder **grob** (voll/halb/wenig/leer)
- [ ] Schnelles +/- beim Verbrauchen/Einräumen
- [ ] Mindestmenge pro Artikel → automatisch auf die Einkaufsliste
- [ ] Einkaufsliste: manuell ergänzen, abhaken → abgehakte Artikel wandern in den Vorrat
- [ ] Kategorien (Kühlschrank, Tiefkühler, Vorratsregal …) und Suche
- [ ] Handy-optimierte Oberfläche (große Buttons, Daumen-Bedienung)

## Phase 2 – Datensicherung ⬜
- [ ] Export als JSON-Datei (über iOS-Teilen-Dialog → Dateien/iCloud Drive)
- [ ] Import mit zod-Validierung, Vorschau und Bestätigung
- [ ] Versioniertes Backup-Format + Tests mit alten Backups
- [ ] Erinnerung an regelmäßiges Backup
- [ ] Persistenten Speicher anfragen (`navigator.storage.persist()`)

## Phase 3 – Rezepte ⬜
- [ ] Rezepte mit Zutaten (Verknüpfung zu Vorrats-Artikeln) anlegen
- [ ] Abgleich: „Was fehlt mir für dieses Rezept?"
- [ ] Fehlende Zutaten mit einem Tipp auf die Einkaufsliste
- [ ] „Was kann ich mit meinem Vorrat kochen?"
- [ ] Optional: „Gekocht"-Knopf zieht Zutaten vom Vorrat ab

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
- Endgültiger Name der App
- Kategorien und Einheiten (Vorschlagsliste erstellen und abstimmen)
