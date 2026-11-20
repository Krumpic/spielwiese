import { useMemo, useState } from "react";
import {
  LOCATION_IDS,
  levelLabel,
  locationLabel,
  sectionLabel,
  type LocationId,
} from "../domain/constants.ts";
import { formatQuantity, needsRestock, type Item } from "../domain/item.ts";
import { changeLevel, changeQuantity } from "../db/repository.ts";
import { useItems } from "../db/live.ts";
import { Header } from "./Header.tsx";
import { ItemForm } from "./ItemForm.tsx";
import { Sheet } from "./Sheet.tsx";
import { PlusIcon, SearchIcon } from "./icons.tsx";
import { runSafely } from "./runSafely.ts";

type Filter = "all" | LocationId;

const LEVEL_STYLE: ReadonlyMap<Item["level"], string> = new Map([
  ["full", "bg-emerald-100 text-emerald-900"],
  ["half", "bg-lime-100 text-lime-900"],
  ["low", "bg-amber-100 text-amber-900"],
  ["empty", "bg-red-100 text-red-800"],
]);

function ItemRow({ item, onEdit }: { item: Item; onEdit: () => void }) {
  const restock = needsRestock(item);
  return (
    <li className="flex items-center gap-2 px-4 py-2.5">
      <button type="button" className="min-h-11 min-w-0 flex-1 text-left" onClick={onEdit}>
        <span className="block truncate text-base font-medium text-stone-900">{item.name}</span>
        <span
          className={`block text-xs ${restock ? "font-semibold text-amber-700" : "text-stone-500"}`}
        >
          {restock ? "Nachkaufen" : sectionLabel(item.section)}
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

export function PantryView() {
  const items = useItems();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Item | "new" | null>(null);

  const groups = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("de");
    const visible = (items ?? []).filter(
      (item) =>
        (filter === "all" || item.location === filter) &&
        (term === "" || item.name.toLocaleLowerCase("de").includes(term)),
    );
    return LOCATION_IDS.map((location) => ({
      location,
      items: visible
        .filter((item) => item.location === location)
        .sort((a, b) => a.name.localeCompare(b.name, "de")),
    })).filter((group) => group.items.length > 0);
  }, [items, filter, search]);

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "Alle" },
    ...LOCATION_IDS.map((id) => ({ value: id, label: locationLabel(id) })),
  ];

  return (
    <>
      <Header title="Kornspeicher">
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-white px-3 shadow-sm">
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
                  ? "bg-emerald-800 text-white"
                  : "bg-white text-stone-700 shadow-sm"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Header>

      <main className="px-4 pb-28">
        {items === undefined ? (
          <p className="py-10 text-center text-stone-500">Wird geladen …</p>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-lg font-semibold">Dein Kornspeicher ist noch leer.</p>
            <p className="mt-1 text-stone-600">Leg deine ersten Lebensmittel an.</p>
            <button
              type="button"
              className="mt-6 min-h-12 rounded-xl bg-emerald-800 px-6 font-semibold text-white"
              onClick={() => {
                setEditing("new");
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
              <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm">
                {group.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    onEdit={() => {
                      setEditing(item);
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
        className="fixed right-5 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-800 text-white shadow-lg active:bg-emerald-900"
        onClick={() => {
          setEditing("new");
        }}
      >
        <PlusIcon className="h-7 w-7" />
      </button>

      {editing !== null && (
        <Sheet
          title={editing === "new" ? "Neuer Artikel" : "Artikel bearbeiten"}
          onClose={() => {
            setEditing(null);
          }}
        >
          <ItemForm
            item={editing === "new" ? null : editing}
            defaultLocation={filter === "all" ? "pantry" : filter}
            onDone={() => {
              setEditing(null);
            }}
          />
        </Sheet>
      )}
    </>
  );
}
