import { useState, type SyntheticEvent } from "react";
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
import {
  countRecipesUsingItem,
  createItem,
  deleteItem,
  putItemOnShoppingList,
  updateItem,
} from "../db/repository.ts";
import { DEFAULT_SECTION, Field, Segmented, inputClass, numberText } from "./form.tsx";
import { EXPIRY_WARNING_DAYS } from "../domain/expiry.ts";
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
  /** "" = kein Datum, sonst "JJJJ-MM-TT" (Format des Datumsfelds) */
  expiresOn: string;
}

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
      expiresOn: "",
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
    expiresOn: item.expiresOn ?? "",
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
    expiresOn: form.expiresOn === "" ? null : form.expiresOn,
  };
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

      <div>
        <Field
          label="Ablaufdatum (optional)"
          hint={`Das nächste Ablaufdatum – die App warnt ${String(EXPIRY_WARNING_DAYS)} Tage vorher.`}
          error={errors.get("expiresOn")}
        >
          <input
            type="date"
            className={inputClass}
            value={form.expiresOn}
            min="2000-01-01"
            max="2200-12-31"
            onChange={(e) => {
              set("expiresOn", e.target.value);
            }}
          />
        </Field>
        {form.expiresOn !== "" && (
          <button
            type="button"
            className="mt-1 min-h-11 text-sm font-semibold text-brand-800"
            onClick={() => {
              set("expiresOn", "");
            }}
          >
            Datum entfernen
          </button>
        )}
      </div>

      <button
        type="submit"
        className="min-h-12 w-full rounded-xl bg-brand-800 text-base font-semibold text-white active:bg-brand-900"
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
              runSafely(async () => {
                const usedIn = await countRecipesUsingItem(item.id);
                const warning =
                  usedIn > 0
                    ? `\n\nEr wird in ${String(usedIn)} ${usedIn === 1 ? "Rezept" : "Rezepten"} verwendet und dort als Zutat entfernt.`
                    : "";
                if (!window.confirm(`„${item.name}“ wirklich löschen?${warning}`)) return;
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
