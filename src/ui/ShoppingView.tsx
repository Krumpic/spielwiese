import { useMemo, useState, type SyntheticEvent } from "react";
import { SECTION_IDS, isSectionId, sectionLabel, type SectionId } from "../domain/constants.ts";
import {
  ManualEntrySchema,
  entryAmountText,
  groupBySection,
  type ShoppingEntry,
} from "../domain/shopping.ts";
import { addManualEntry, completePurchase, removeEntry, toggleEntry } from "../db/repository.ts";
import { useShoppingEntries } from "../db/live.ts";
import { Header } from "./Header.tsx";
import { CheckIcon, CloseIcon } from "./icons.tsx";
import { runSafely } from "./runSafely.ts";

function EntryRow({ entry }: { entry: ShoppingEntry }) {
  const amount = entryAmountText(entry);
  return (
    <li className="flex items-center gap-3 px-4 py-2">
      <button
        type="button"
        role="checkbox"
        aria-checked={entry.checked}
        aria-label={`${entry.name} ${entry.checked ? "ist im Einkaufswagen" : "abhaken"}`}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
        onClick={() => {
          runSafely(() => toggleEntry(entry.id));
        }}
      >
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
            entry.checked ? "border-emerald-700 bg-emerald-700 text-white" : "border-stone-300"
          }`}
        >
          {entry.checked && <CheckIcon className="h-4 w-4" />}
        </span>
        <span
          className={`truncate text-base ${entry.checked ? "text-stone-400 line-through" : "text-stone-900"}`}
        >
          {entry.name}
        </span>
        {amount && (
          <span
            className={`ml-auto shrink-0 text-sm tabular-nums ${entry.checked ? "text-stone-400" : "text-stone-600"}`}
          >
            {amount}
          </span>
        )}
      </button>
      <button
        type="button"
        aria-label={`${entry.name} von der Liste entfernen`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-stone-400 active:bg-stone-100"
        onClick={() => {
          runSafely(() => removeEntry(entry.id));
        }}
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </li>
  );
}

function AddEntryForm() {
  const [name, setName] = useState("");
  const [section, setSection] = useState<SectionId>("other");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    const result = ManualEntrySchema.safeParse({ name, section });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Ungültige Eingabe.");
      return;
    }
    setError(null);
    runSafely(async () => {
      await addManualEntry(result.data);
      setName("");
    });
  };

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-2" noValidate>
      <div className="flex gap-2">
        <input
          className="min-h-11 min-w-0 flex-1 rounded-xl bg-white px-3 text-base shadow-sm outline-none focus:ring-2 focus:ring-emerald-700/30"
          placeholder="Was brauchst du noch?"
          aria-label="Artikel zur Einkaufsliste hinzufügen"
          maxLength={60}
          autoComplete="off"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
        <button
          type="submit"
          className="min-h-11 rounded-xl bg-emerald-800 px-4 font-semibold text-white"
        >
          Dazu
        </button>
      </div>
      <select
        className="min-h-11 w-full rounded-xl bg-white px-3 text-sm text-stone-700 shadow-sm"
        aria-label="Abteilung im Supermarkt"
        value={section}
        onChange={(e) => {
          if (isSectionId(e.target.value)) setSection(e.target.value);
        }}
      >
        {SECTION_IDS.map((id) => (
          <option key={id} value={id}>
            {sectionLabel(id)}
          </option>
        ))}
      </select>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  );
}

export function ShoppingView() {
  const entries = useShoppingEntries();
  const groups = useMemo(() => groupBySection(entries ?? []), [entries]);
  const checkedCount = entries?.filter((e) => e.checked).length ?? 0;

  return (
    <>
      <Header title="Einkaufsliste">
        <AddEntryForm />
      </Header>

      <main className="px-4 pb-44">
        {entries === undefined ? (
          <p className="py-10 text-center text-stone-500">Wird geladen …</p>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-lg font-semibold">Alles da!</p>
            <p className="mt-1 text-stone-600">Gerade musst du nichts einkaufen.</p>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.section} className="mt-4">
              <h2 className="mb-2 px-1 text-xs font-bold tracking-wider text-stone-500 uppercase">
                {group.label}
              </h2>
              <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm">
                {group.entries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} />
                ))}
              </ul>
            </section>
          ))
        )}
      </main>

      {checkedCount > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 px-4 pb-3">
          <button
            type="button"
            className="min-h-13 w-full rounded-2xl bg-emerald-800 text-base font-semibold text-white shadow-lg active:bg-emerald-900"
            onClick={() => {
              runSafely(() => completePurchase());
            }}
          >
            Einkauf abschließen ({checkedCount}) – ab in den Vorrat
          </button>
        </div>
      )}
    </>
  );
}
