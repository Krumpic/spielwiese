import { useMemo, useState } from "react";
import {
  LOCATION_IDS,
  levelLabel,
  locationLabel,
  sectionLabel,
  type LocationId,
} from "../domain/constants.ts";
import { expiryState, expiryText, todayString, type ExpiryState } from "../domain/expiry.ts";
import { formatQuantity, needsRestock, type Item } from "../domain/item.ts";
import {
  changeLevel,
  changeQuantity,
  findItemByBarcode,
  loadProductLookup,
} from "../db/repository.ts";
import { useItems } from "../db/live.ts";
import { Header } from "./Header.tsx";
import { BarcodeScanner } from "./BarcodeScanner.tsx";
import { ItemForm, type ItemPrefill } from "./ItemForm.tsx";
import { Sheet } from "./Sheet.tsx";
import { BarcodeIcon, PlusIcon, SearchIcon } from "./icons.tsx";
import { lookupProduct } from "./productLookup.ts";
import { runSafely } from "./runSafely.ts";

type Filter = "all" | "expiring" | LocationId;

type Editing =
  | { type: "edit"; item: Item; prefill?: ItemPrefill }
  | { type: "new"; prefill?: ItemPrefill }
  | null;

const LEVEL_STYLE: ReadonlyMap<Item["level"], string> = new Map([
  ["full", "bg-green-100 text-green-900"],
  ["half", "bg-lime-100 text-lime-900"],
  ["low", "bg-amber-100 text-amber-900"],
  ["empty", "bg-red-100 text-red-800"],
]);

const EXPIRY_STYLE: ReadonlyMap<ExpiryState, string> = new Map([
  ["expired", "font-semibold text-red-700"],
  ["soon", "font-semibold text-amber-700"],
  ["ok", "text-stone-500"],
]);

/** Läuft bald ab oder ist abgelaufen? */
const isExpiring = (item: Item, today: string) => {
  const state = expiryState(item.expiresOn, today);
  return state === "expired" || state === "soon";
};

function ItemRow({ item, today, onEdit }: { item: Item; today: string; onEdit: () => void }) {
  const restock = needsRestock(item);
  const expiry = expiryState(item.expiresOn, today);
  return (
    <li className="flex items-center gap-2 px-4 py-2.5">
      <button type="button" className="min-h-11 min-w-0 flex-1 text-left" onClick={onEdit}>
        <span className="block truncate text-base font-medium text-stone-900">{item.name}</span>
        <span className="block truncate text-xs">
          {expiry !== null && item.expiresOn !== null && (
            <span className={EXPIRY_STYLE.get(expiry) ?? ""}>
              {expiryText(item.expiresOn, today)}
              {restock && " · "}
            </span>
          )}
          {restock ? (
            <span className="font-semibold text-amber-700">Nachkaufen</span>
          ) : (
            expiry === null && <span className="text-stone-500">{sectionLabel(item.section)}</span>
          )}
        </span>
      </button>

      {item.mode === "exact" ? (
        <div className="flex items-center">
          <button
            type="button"
            aria-label={`${item.name}: weniger`}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-100 text-xl text-stone-700 active:bg-stone-200"
            onClick={() => {
              runSafely(() => changeQuantity(item.id, -1));
            }}
          >
            −
          </button>
          <span className="w-20 text-center text-sm font-semibold tabular-nums">
            {formatQuantity(item.quantity, item.unit)}
          </span>
          <button
            type="button"
            aria-label={`${item.name}: mehr`}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-100 text-xl text-stone-700 active:bg-stone-200"
            onClick={() => {
              runSafely(() => changeQuantity(item.id, 1));
            }}
          >
            +
          </button>
        </div>
      ) : (
        <button
          type="button"
          aria-label={`${item.name}: Füllstand ${levelLabel(item.level)}, antippen zum Ändern`}
          className={`min-h-11 w-24 rounded-full text-sm font-semibold ${LEVEL_STYLE.get(item.level) ?? ""}`}
          onClick={() => {
            runSafely(() => changeLevel(item.id));
          }}
        >
          {levelLabel(item.level)}
        </button>
      )}
    </li>
  );
}

interface PantryViewProps {
  backupOverdue: boolean;
  onOpenSettings: () => void;
}

export function PantryView({ backupOverdue, onOpenSettings }: PantryViewProps) {
  const items = useItems();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [scanning, setScanning] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  /** Nach dem Scan: bekannten Artikel öffnen, sonst Produkt nachschlagen und neu anlegen */
  const handleScan = (barcode: string) => {
    setScanning(false);
    runSafely(async () => {
      const existing = await findItemByBarcode(barcode);
      if (existing) {
        setEditing({
          type: "edit",
          item: existing,
          prefill: { note: "Per Barcode gefunden – Menge anpassen und speichern." },
        });
        return;
      }
      if (!(await loadProductLookup())) {
        setEditing({
          type: "new",
          prefill: { barcode, note: "Neuer Barcode – bitte Namen eingeben." },
        });
        return;
      }
      setLookingUp(true);
      const result = await lookupProduct(barcode).finally(() => {
        setLookingUp(false);
      });
      if (result === "error") {
        setEditing({
          type: "new",
          prefill: {
            barcode,
            note: "Die Produktsuche ist gerade nicht erreichbar (offline?). Bitte Namen selbst eingeben.",
          },
        });
      } else if (result.found) {
        const details = [result.brand, result.quantity].filter((d) => d !== null).join(", ");
        setEditing({
          type: "new",
          prefill: {
            barcode,
            name: result.name,
            note: `Gefunden bei Open Food Facts${details ? ` (${details})` : ""}. Bitte Name, Menge und Lagerort prüfen.`,
          },
        });
      } else {
        setEditing({
          type: "new",
          prefill: { barcode, note: "Dieses Produkt ist nicht bekannt – bitte Namen eingeben." },
        });
      }
    });
  };
  const [today] = useState(() => todayString(Date.now()));

  const expiringCount = (items ?? []).filter((item) => isExpiring(item, today)).length;

  const groups = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("de");
    const visible = (items ?? []).filter(
      (item) =>
        (filter === "all" ||
          (filter === "expiring" ? isExpiring(item, today) : item.location === filter)) &&
        (term === "" || item.name.toLocaleLowerCase("de").includes(term)),
    );
    // Bei „Läuft bald ab": was zuerst abläuft, steht oben
    const byDate = (a: Item, b: Item) => (a.expiresOn ?? "").localeCompare(b.expiresOn ?? "");
    const byName = (a: Item, b: Item) => a.name.localeCompare(b.name, "de");
    return LOCATION_IDS.map((location) => ({
      location,
      items: visible
        .filter((item) => item.location === location)
        .sort((a, b) => (filter === "expiring" ? byDate(a, b) || byName(a, b) : byName(a, b))),
    })).filter((group) => group.items.length > 0);
  }, [items, filter, search, today]);

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "Alle" },
    ...(expiringCount > 0
      ? [{ value: "expiring" as const, label: `Läuft bald ab (${String(expiringCount)})` }]
      : []),
    ...LOCATION_IDS.map((id) => ({ value: id, label: locationLabel(id) })),
  ];

  return (
    <>
      <Header title="Kornspeicher">
        <div className="mt-3 flex gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-surface px-3 shadow-sm">
            <SearchIcon className="h-5 w-5 text-stone-400" />
            <input
              type="search"
              className="min-h-11 w-full bg-transparent text-base outline-none"
              placeholder="Suchen"
              aria-label="Vorrat durchsuchen"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
            />
          </div>
          <button
            type="button"
            aria-label="Barcode scannen"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface text-brand-800 shadow-sm active:bg-stone-200"
            onClick={() => {
              setScanning(true);
            }}
          >
            <BarcodeIcon className="h-6 w-6" />
          </button>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => {
                setFilter(f.value);
              }}
              className={`min-h-9 shrink-0 rounded-full px-4 text-sm font-medium ${
                filter === f.value
                  ? "bg-brand-800 text-white"
                  : "bg-surface text-stone-700 shadow-sm"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Header>

      <main className="px-4 pb-28">
        {backupOverdue && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="mt-2 flex w-full items-center justify-between gap-3 rounded-2xl bg-amber-100 px-4 py-3 text-left text-sm text-amber-900"
          >
            <span>
              <span className="block font-semibold">Zeit für ein Backup</span>
              Deine Daten sind nur auf diesem iPhone gespeichert.
            </span>
            <span className="shrink-0 font-semibold">Sichern ›</span>
          </button>
        )}
        {expiringCount > 0 && filter !== "expiring" && (
          <button
            type="button"
            onClick={() => {
              setFilter("expiring");
            }}
            className="mt-2 flex w-full items-center justify-between gap-3 rounded-2xl bg-red-50 px-4 py-3 text-left text-sm text-red-800"
          >
            <span>
              <span className="block font-semibold">
                {expiringCount === 1
                  ? "1 Artikel läuft bald ab"
                  : `${String(expiringCount)} Artikel laufen bald ab`}
              </span>
              Am besten zuerst verbrauchen.
            </span>
            <span className="shrink-0 font-semibold">Zeigen ›</span>
          </button>
        )}
        {items === undefined ? (
          <p className="py-10 text-center text-stone-500">Wird geladen …</p>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-lg font-semibold">Dein Kornspeicher ist noch leer.</p>
            <p className="mt-1 text-stone-600">Leg deine ersten Lebensmittel an.</p>
            <button
              type="button"
              className="mt-6 min-h-12 rounded-xl bg-brand-800 px-6 font-semibold text-white"
              onClick={() => {
                setEditing({ type: "new" });
              }}
            >
              Ersten Artikel anlegen
            </button>
          </div>
        ) : groups.length === 0 ? (
          <p className="py-10 text-center text-stone-500">Nichts gefunden.</p>
        ) : (
          groups.map((group) => (
            <section key={group.location} className="mt-4">
              <h2 className="mb-2 px-1 text-xs font-bold tracking-wider text-stone-500 uppercase">
                {locationLabel(group.location)}
              </h2>
              <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-surface shadow-sm">
                {group.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    today={today}
                    onEdit={() => {
                      setEditing({ type: "edit", item });
                    }}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </main>

      <button
        type="button"
        aria-label="Neuen Artikel anlegen"
        className="fixed right-5 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-800 text-white shadow-lg active:bg-brand-900"
        onClick={() => {
          setEditing({ type: "new" });
        }}
      >
        <PlusIcon className="h-7 w-7" />
      </button>

      {scanning && (
        <BarcodeScanner
          onResult={handleScan}
          onClose={() => {
            setScanning(false);
          }}
        />
      )}

      {lookingUp && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/50"
          role="status"
        >
          <p className="rounded-2xl bg-surface px-6 py-4 font-semibold shadow-lg">
            Produkt wird gesucht …
          </p>
        </div>
      )}

      {editing !== null && (
        <Sheet
          title={editing.type === "new" ? "Neuer Artikel" : "Artikel bearbeiten"}
          onClose={() => {
            setEditing(null);
          }}
        >
          <ItemForm
            key={editing.type === "edit" ? editing.item.id : "new"}
            item={editing.type === "edit" ? editing.item : null}
            prefill={editing.prefill}
            defaultLocation={filter === "all" || filter === "expiring" ? "pantry" : filter}
            onDone={() => {
              setEditing(null);
            }}
          />
        </Sheet>
      )}
    </>
  );
}
