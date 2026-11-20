import { useState, type SyntheticEvent, type ReactNode } from "react";
import {
  LEVEL_IDS,
  LOCATION_IDS,
  SECTION_IDS,
  UNIT_IDS,
  isLevel,
  isSectionId,
  isUnit,
  levelLabel,
  locationLabel,
  sectionLabel,
  unitInfo,
  type Level,
  type LocationId,
  type SectionId,
  type Unit,
} from "../domain/constants.ts";
import { ItemDataSchema, parseDecimal, type Item, type StockMode } from "../domain/item.ts";
import { createItem, deleteItem, putItemOnShoppingList, updateItem } from "../db/repository.ts";
import { runSafely } from "./runSafely.ts";

interface FormState {
  name: string;
  location: LocationId;
  section: SectionId;
  mode: StockMode;
  quantity: string;
  unit: Unit;
  level: Level;
  minQuantity: string;
  targetQuantity: string;
  minLevel: Level | "never";
}

const DEFAULT_SECTION: ReadonlyMap<LocationId, SectionId> = new Map([
  ["pantry", "staples"],
  ["fridge", "dairy"],
  ["freezer", "frozen"],
]);

const numberText = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

function toFormState(item: Item | null, location: LocationId): FormState {
  if (!item) {
    return {
      name: "",
      location,
      section: DEFAULT_SECTION.get(location) ?? "other",
      mode: "exact",
      quantity: "1",
      unit: "piece",
      level: "full",
      minQuantity: "",
      targetQuantity: "",
      minLevel: "low",
    };
  }
  return {
    name: item.name,
    location: item.location,
    section: item.section,
    mode: item.mode,
    quantity: numberText(item.quantity),
    unit: item.unit,
    level: item.level,
    minQuantity: numberText(item.minQuantity),
    targetQuantity: numberText(item.targetQuantity),
    minLevel: item.minLevel ?? "never",
  };
}

function toItemData(form: FormState) {
  return {
    name: form.name,
    location: form.location,
    section: form.section,
    mode: form.mode,
    quantity: parseDecimal(form.quantity) ?? 0,
    unit: form.unit,
    level: form.level,
    minQuantity: parseDecimal(form.minQuantity),
    targetQuantity: parseDecimal(form.targetQuantity),
    minLevel: form.minLevel === "never" ? null : form.minLevel,
  };
}

const inputClass =
  "w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-base outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20";

function Field({
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

function Segmented<T extends string>({
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
            value === option.value ? "bg-white text-emerald-800 shadow-sm" : "text-stone-600"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface ItemFormProps {
  item: Item | null;
  defaultLocation: LocationId;
  onDone: () => void;
}

export function ItemForm({ item, defaultLocation, onDone }: ItemFormProps) {
  const [form, setForm] = useState<FormState>(() => toFormState(item, defaultLocation));
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  // Bei neuen Artikeln folgt die Abteilung dem Lagerort, bis sie von Hand gewählt wurde
  const [sectionChosen, setSectionChosen] = useState(item !== null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    const result = ItemDataSchema.safeParse(toItemData(form));
    if (!result.success) {
      const next = new Map<string, string>();
      for (const issue of result.error.issues) {
        const field = String(issue.path[0] ?? "");
        if (!next.has(field)) next.set(field, issue.message);
      }
      setErrors(next);
      return;
    }
    runSafely(async () => {
      if (item) await updateItem(item.id, result.data);
      else await createItem(result.data);
      onDone();
    });
  };

  const unitShort = unitInfo(form.unit).short;

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field label="Name" error={errors.get("name")}>
        <input
          className={inputClass}
          value={form.name}
          maxLength={60}
          autoComplete="off"
          placeholder="z. B. Milch"
          onChange={(e) => {
            set("name", e.target.value);
          }}
        />
      </Field>

      <Field label="Lagerort">
        <Segmented
          label="Lagerort"
          value={form.location}
          options={LOCATION_IDS.map((id) => ({ value: id, label: locationLabel(id) }))}
          onChange={(value) => {
            set("location", value);
            if (!sectionChosen) set("section", DEFAULT_SECTION.get(value) ?? "other");
          }}
        />
      </Field>

      <Field label="Abteilung im Supermarkt" hint="Danach wird die Einkaufsliste sortiert.">
        <select
          className={inputClass}
          value={form.section}
          onChange={(e) => {
            if (isSectionId(e.target.value)) {
              set("section", e.target.value);
              setSectionChosen(true);
            }
          }}
        >
          {SECTION_IDS.map((id) => (
            <option key={id} value={id}>
              {sectionLabel(id)}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Wie willst du die Menge erfassen?">
        <Segmented
          label="Mengenart"
          value={form.mode}
          options={[
            { value: "exact", label: "Genau zählen" },
            { value: "level", label: "Grob schätzen" },
          ]}
          onChange={(value) => {
            set("mode", value);
          }}
        />
      </Field>

      {form.mode === "exact" ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Menge daheim" error={errors.get("quantity")}>
              <input
                className={inputClass}
                inputMode="decimal"
                value={form.quantity}
                onChange={(e) => {
                  set("quantity", e.target.value);
                }}
              />
            </Field>
            <Field label="Einheit">
              <select
                className={inputClass}
                value={form.unit}
                onChange={(e) => {
                  if (isUnit(e.target.value)) set("unit", e.target.value);
                }}
              >
                {UNIT_IDS.map((id) => (
                  <option key={id} value={id}>
                    {unitInfo(id).long}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field
            label={`Mindestmenge (${unitShort})`}
            hint="Ist weniger da, kommt der Artikel auf die Einkaufsliste. Leer lassen = nie."
            error={errors.get("minQuantity")}
          >
            <input
              className={inputClass}
              inputMode="decimal"
              placeholder="z. B. 2"
              value={form.minQuantity}
              onChange={(e) => {
                set("minQuantity", e.target.value);
              }}
            />
          </Field>
          <Field
            label={`Sollmenge (${unitShort})`}
            hint="So viel willst du normalerweise daheim haben – bestimmt die Einkaufsmenge."
            error={errors.get("targetQuantity")}
          >
            <input
              className={inputClass}
              inputMode="decimal"
              placeholder="z. B. 6"
              value={form.targetQuantity}
              onChange={(e) => {
                set("targetQuantity", e.target.value);
              }}
            />
          </Field>
        </>
      ) : (
        <>
          <Field label="Wie viel ist noch da?">
            <Segmented
              label="Füllstand"
              value={form.level}
              options={LEVEL_IDS.map((id) => ({ value: id, label: levelLabel(id) }))}
              onChange={(value) => {
                set("level", value);
              }}
            />
          </Field>
          <Field
            label="Auf die Einkaufsliste ab"
            hint="Bei diesem Füllstand kommt der Artikel auf die Liste."
          >
            <select
              className={inputClass}
              value={form.minLevel}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "never" || isLevel(value)) set("minLevel", value);
              }}
            >
              <option value="half">halb</option>
              <option value="low">wenig</option>
              <option value="empty">leer</option>
              <option value="never">nie</option>
            </select>
          </Field>
        </>
      )}

      <button
        type="submit"
        className="min-h-12 w-full rounded-xl bg-emerald-800 text-base font-semibold text-white active:bg-emerald-900"
      >
        Speichern
      </button>

      {item && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className="min-h-12 rounded-xl bg-amber-100 text-sm font-semibold text-amber-900 active:bg-amber-200"
            onClick={() => {
              runSafely(async () => {
                await putItemOnShoppingList(item.id);
                onDone();
              });
            }}
          >
            Auf die Einkaufsliste
          </button>
          <button
            type="button"
            className="min-h-12 rounded-xl bg-red-50 text-sm font-semibold text-red-700 active:bg-red-100"
            onClick={() => {
              if (!window.confirm(`„${item.name}“ wirklich löschen?`)) return;
              runSafely(async () => {
                await deleteItem(item.id);
                onDone();
              });
            }}
          >
            Löschen
          </button>
        </div>
      )}
    </form>
  );
}
