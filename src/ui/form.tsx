import type { ReactNode } from "react";
import type { LocationId, SectionId } from "../domain/constants.ts";

/** Gemeinsame Formular-Bausteine */

export const inputClass =
  "w-full rounded-xl border border-stone-300 bg-surface px-3 py-3 text-base outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-700/20";

/** Vorschlag für die Supermarkt-Abteilung je nach Lagerort */
export const DEFAULT_SECTION: ReadonlyMap<LocationId, SectionId> = new Map([
  ["pantry", "staples"],
  ["fridge", "dairy"],
  ["freezer", "frozen"],
]);

export const numberText = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-stone-700">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
      {error && <span className="mt-1 block text-sm text-red-700">{error}</span>}
    </label>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  label,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  label: string;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-xl bg-stone-100 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => {
            onChange(option.value);
          }}
          className={`min-h-11 flex-1 rounded-lg px-2 text-sm font-medium ${
            value === option.value ? "bg-surface text-brand-800 shadow-sm" : "text-stone-600"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
