import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { daysSince } from "../domain/backup.ts";
import { restoreBackup, saveProductLookup } from "../db/repository.ts";
import {
  useAppearance,
  useItems,
  useLastBackupAt,
  useRecipes,
  useProductLookup,
  useShoppingEntries,
} from "../db/live.ts";
import { AppearanceCard } from "./AppearanceCard.tsx";
import { Header } from "./Header.tsx";
import { readBackupFile, requestPersistentStorage, saveBackupFile } from "./backupFile.ts";
import { runSafely } from "./runSafely.ts";

const dateFormat = new Intl.DateTimeFormat("de-AT", { dateStyle: "long", timeStyle: "short" });

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 rounded-2xl bg-surface p-4 shadow-sm">
      <h2 className="mb-2 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

export function SettingsView() {
  const items = useItems();
  const entries = useShoppingEntries();
  const recipes = useRecipes();
  const appearance = useAppearance();
  const productLookup = useProductLookup();
  const lastBackupAt = useLastBackupAt();
  const fileInput = useRef<HTMLInputElement>(null);
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    void requestPersistentStorage().then(setPersistent);
  }, []);

  const ago = (timestamp: number) => {
    const days = daysSince(timestamp, now);
    return days === 0 ? "heute" : days === 1 ? "gestern" : `vor ${String(days)} Tagen`;
  };
  const lastBackupText =
    lastBackupAt === undefined
      ? "…"
      : lastBackupAt === null
        ? "noch nie"
        : `${dateFormat.format(lastBackupAt)} (${ago(lastBackupAt)})`;

  const onFileChosen = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // gleiche Datei später erneut wählbar
    if (!file) return;

    runSafely(async () => {
      const result = await readBackupFile(file);
      if (!result.ok) {
        window.alert(result.error);
        return;
      }
      const { backup } = result;
      const confirmed = window.confirm(
        `Backup vom ${dateFormat.format(backup.exportedAt)} wiederherstellen?\n\n` +
          `Es enthält ${String(backup.items.length)} Artikel und ${String(backup.shopping.length)} Einträge auf der Einkaufsliste.\n\n` +
          `Achtung: Deine aktuellen Daten (${String(items?.length ?? 0)} Artikel) werden dabei vollständig ersetzt.`,
      );
      if (!confirmed) return;
      await restoreBackup(backup);
      window.alert("Backup wurde wiederhergestellt.");
    });
  };

  return (
    <>
      <Header title="Einstellungen" />
      <main className="px-4 pb-28">
        <Card title="Datensicherung">
          <p className="text-sm text-stone-600">
            Deine Daten liegen nur auf diesem iPhone. Sichere sie regelmäßig – am besten in iCloud
            Drive („In Dateien sichern“).
          </p>
          <p className="mt-3 text-sm">
            <span className="font-semibold">Letztes Backup:</span> {lastBackupText}
          </p>
          <button
            type="button"
            className="mt-4 min-h-12 w-full rounded-xl bg-brand-800 font-semibold text-white active:bg-brand-900"
            disabled={items === undefined || entries === undefined || recipes === undefined}
            onClick={() => {
              if (items === undefined || entries === undefined || recipes === undefined) return;
              runSafely(async () => {
                await saveBackupFile({ items, shopping: entries, recipes });
              });
            }}
          >
            Backup erstellen
          </button>
          <button
            type="button"
            className="mt-3 min-h-12 w-full rounded-xl bg-stone-100 font-semibold text-stone-800 active:bg-stone-200"
            onClick={() => {
              fileInput.current?.click();
            }}
          >
            Backup wiederherstellen
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={onFileChosen}
          />
        </Card>

        {appearance && <AppearanceCard appearance={appearance} />}

        <Card title="Barcode-Scanner">
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              className="h-6 w-6 shrink-0 accent-brand-700"
              checked={productLookup ?? true}
              disabled={productLookup === undefined}
              onChange={(e) => {
                const enabled = e.target.checked;
                runSafely(() => saveProductLookup(enabled));
              }}
            />
            <span className="font-semibold">Produktnamen online nachschlagen</span>
          </label>
          <p className="mt-2 text-sm text-stone-600">
            Bei einem unbekannten Barcode wird <strong>nur die Barcode-Nummer</strong> an Open Food
            Facts (freie, gemeinnützige Lebensmittel-Datenbank) gesendet. Keine Vorratsdaten, kein
            Name, keine Cookies. Ausgeschaltet bleibt der Scanner komplett offline – den Namen
            tippst du dann beim ersten Scan selbst ein.
          </p>
        </Card>

        <Card title="Speicher">
          <p className="text-sm">
            <span className="font-semibold">Vor automatischem Löschen geschützt:</span>{" "}
            {persistent === null ? "…" : persistent ? "ja ✓" : "nicht bestätigt"}
          </p>
          <p className="mt-2 text-sm text-stone-600">
            {persistent === false
              ? "Das System hat den dauerhaften Speicher nicht bestätigt. Das ist bei iOS normal, solange die App nicht zum Home-Bildschirm hinzugefügt ist – Backups sind dann besonders wichtig."
              : "Das System löscht die Daten nicht von selbst, wenn der Speicher knapp wird."}
          </p>
        </Card>

        <Card title="Über Kornspeicher">
          <p className="text-sm text-stone-600">
            {String(items?.length ?? 0)} Artikel im Vorrat · {String(entries?.length ?? 0)} auf der
            Einkaufsliste
          </p>
          <p className="mt-2 text-sm text-stone-600">
            Keine Anmeldung, kein Server, keine Werbung – alles bleibt auf diesem Gerät.
          </p>
        </Card>
      </main>
    </>
  );
}
