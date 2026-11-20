import { useMemo, useState, type SyntheticEvent } from "react";
import {
  LOCATION_IDS,
  compatibleUnits,
  isUnit,
  locationLabel,
  unitInfo,
  UNIT_IDS,
  type LocationId,
  type Unit,
} from "../domain/constants.ts";
import { parseDecimal, type Item } from "../domain/item.ts";
import { RecipeDataSchema, type Recipe, type RecipeIngredient } from "../domain/recipe.ts";
import { createItem, createRecipe, deleteRecipe, updateRecipe } from "../db/repository.ts";
import { DEFAULT_SECTION, Field, Segmented, inputClass, numberText } from "./form.tsx";
import { CloseIcon, PlusIcon } from "./icons.tsx";
import { runSafely } from "./runSafely.ts";

interface IngredientRow {
  key: number;
  itemId: number | null;
  quantity: string;
  unit: Unit | null;
  basic: boolean;
}

interface StepRow {
  key: number;
  text: string;
}

const NEW_ITEM = "new";

/** Eindeutige Schlüssel für Listenzeilen (nur für React, wird nicht gespeichert) */
let keyCounter = 0;
const newKey = () => ++keyCounter;

/** Mini-Formular: Zutat direkt im Vorrat anlegen (Menge 0 – sie ist ja noch nicht da) */
function NewItemInline({
  onCreated,
  onCancel,
}: {
  onCreated: (id: number, unit: Unit) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState<LocationId>("pantry");
  const [unit, setUnit] = useState<Unit>("piece");
  const [error, setError] = useState<string | null>(null);

  const create = () => {
    if (name.trim() === "") {
      setError("Bitte einen Namen eingeben.");
      return;
    }
    runSafely(async () => {
      const id = await createItem({
        name,
        location,
        section: DEFAULT_SECTION.get(location) ?? "other",
        mode: "exact",
        quantity: 0,
        unit,
        level: "full",
        minQuantity: null,
        targetQuantity: null,
        minLevel: "low",
        expiresOn: null,
        barcode: null,
      });
      onCreated(id, unit);
    });
  };

  return (
    <div className="mt-2 space-y-2 rounded-xl bg-brand-50 p-3">
      <p className="text-sm font-semibold text-brand-900">Neu im Vorrat anlegen</p>
      <input
        className={inputClass}
        placeholder="Name, z. B. Faschiertes"
        aria-label="Name der neuen Zutat"
        maxLength={60}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
      />
      <Segmented
        label="Lagerort"
        value={location}
        options={LOCATION_IDS.map((id) => ({ value: id, label: locationLabel(id) }))}
        onChange={setLocation}
      />
      <select
        className={inputClass}
        aria-label="Einheit im Vorrat"
        value={unit}
        onChange={(e) => {
          if (isUnit(e.target.value)) setUnit(e.target.value);
        }}
      >
        {UNIT_IDS.map((id) => (
          <option key={id} value={id}>
            {unitInfo(id).long}
          </option>
        ))}
      </select>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          className="min-h-11 flex-1 rounded-xl bg-brand-800 font-semibold text-white"
          onClick={create}
        >
          Anlegen
        </button>
        <button
          type="button"
          className="min-h-11 flex-1 rounded-xl bg-surface font-semibold text-stone-700"
          onClick={onCancel}
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}

function IngredientEditor({
  row,
  index,
  items,
  itemsById,
  onChange,
  onRemove,
}: {
  row: IngredientRow;
  index: number;
  items: readonly Item[];
  itemsById: ReadonlyMap<number, Item>;
  onChange: (row: IngredientRow) => void;
  onRemove: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const item = row.itemId === null ? undefined : itemsById.get(row.itemId);

  const chooseItem = (value: string) => {
    if (value === NEW_ITEM) {
      setCreating(true);
      return;
    }
    const chosen = itemsById.get(Number(value));
    if (!chosen) return;
    const unit =
      chosen.mode === "level"
        ? null
        : row.unit !== null && compatibleUnits(chosen.unit).includes(row.unit)
          ? row.unit
          : chosen.unit;
    onChange({ ...row, itemId: chosen.id, unit });
  };

  return (
    <li className="rounded-2xl border border-stone-200 p-3">
      <div className="flex items-start gap-2">
        <select
          className={inputClass}
          aria-label={`Zutat ${String(index + 1)}`}
          value={row.itemId === null ? "" : String(row.itemId)}
          onChange={(e) => {
            chooseItem(e.target.value);
          }}
        >
          <option value="" disabled>
            Zutat aus dem Vorrat wählen …
          </option>
          {items.map((i) => (
            <option key={i.id} value={String(i.id)}>
              {i.name}
            </option>
          ))}
          <option value={NEW_ITEM}>＋ Neu im Vorrat anlegen …</option>
        </select>
        <button
          type="button"
          aria-label={`Zutat ${String(index + 1)} entfernen`}
          className="flex h-12 w-11 shrink-0 items-center justify-center rounded-xl text-stone-400 active:bg-stone-100"
          onClick={onRemove}
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      {creating && (
        <NewItemInline
          onCancel={() => {
            setCreating(false);
          }}
          onCreated={(id, unit) => {
            setCreating(false);
            onChange({ ...row, itemId: id, unit });
          }}
        />
      )}

      {item?.mode === "exact" && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input
            className={inputClass}
            inputMode="decimal"
            placeholder="Menge"
            aria-label={`Menge für ${item.name}`}
            value={row.quantity}
            onChange={(e) => {
              onChange({ ...row, quantity: e.target.value });
            }}
          />
          <select
            className={inputClass}
            aria-label={`Einheit für ${item.name}`}
            value={row.unit ?? item.unit}
            onChange={(e) => {
              if (isUnit(e.target.value)) onChange({ ...row, unit: e.target.value });
            }}
          >
            {compatibleUnits(item.unit).map((u) => (
              <option key={u} value={u}>
                {unitInfo(u).long}
              </option>
            ))}
          </select>
        </div>
      )}
      {item?.mode === "level" && (
        <p className="mt-2 text-sm text-stone-500">
          Grob geschätzt – beim Kochen fragt die App, wie viel noch da ist.
        </p>
      )}

      <label className="mt-2 flex min-h-11 items-center gap-3 text-sm text-stone-700">
        <input
          type="checkbox"
          className="h-5 w-5 accent-brand-700"
          checked={row.basic}
          onChange={(e) => {
            onChange({ ...row, basic: e.target.checked });
          }}
        />
        Grundzutat (Salz, Öl …) – blockiert nicht und wird nicht abgezogen
      </label>
    </li>
  );
}

interface RecipeFormProps {
  recipe: Recipe | null;
  items: readonly Item[];
  onDone: (savedId: number | null) => void;
}

export function RecipeForm({ recipe, items, onDone }: RecipeFormProps) {
  const [name, setName] = useState(recipe?.name ?? "");
  const [servings, setServings] = useState(String(recipe?.servings ?? 2));
  const [rows, setRows] = useState<IngredientRow[]>(() =>
    (recipe?.ingredients ?? []).map((ingredient) => ({
      key: newKey(),
      itemId: ingredient.itemId,
      quantity: numberText(ingredient.quantity),
      unit: ingredient.unit,
      basic: ingredient.basic,
    })),
  );
  const [steps, setSteps] = useState<StepRow[]>(() =>
    (recipe?.steps.length ? recipe.steps : [""]).map((text) => ({ key: newKey(), text })),
  );
  const [errors, setErrors] = useState<string[]>([]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.name.localeCompare(b.name, "de")),
    [items],
  );
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const toIngredients = (): RecipeIngredient[] =>
    rows.flatMap((row): RecipeIngredient[] => {
      const item = row.itemId === null ? undefined : itemsById.get(row.itemId);
      if (!item) return [];
      const base = { itemId: item.id, basic: row.basic };
      if (item.mode === "level") return [{ ...base, quantity: null, unit: null }];
      const quantity = parseDecimal(row.quantity);
      if (quantity === null) return [{ ...base, quantity: null, unit: null }];
      return [{ ...base, quantity, unit: row.unit ?? item.unit }];
    });

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    const result = RecipeDataSchema.safeParse({
      name,
      servings: Number(servings.trim() === "" ? Number.NaN : servings),
      ingredients: toIngredients(),
      steps: steps.map((s) => s.text.trim()).filter((s) => s !== ""),
    });
    if (!result.success) {
      const messages = result.error.issues.map((issue) => {
        const [field, index] = issue.path;
        if (field === "ingredients" && typeof index === "number") {
          return `Zutat ${String(index + 1)}: ${issue.message}`;
        }
        if (field === "steps" && typeof index === "number") {
          return `Schritt ${String(index + 1)}: ${issue.message}`;
        }
        if (field === "servings") return `Portionen: ${issue.message}`;
        return issue.message;
      });
      setErrors([...new Set(messages)]);
      return;
    }
    setErrors([]);
    runSafely(async () => {
      if (recipe) {
        await updateRecipe(recipe.id, result.data);
        onDone(recipe.id);
      } else {
        onDone(await createRecipe(result.data));
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field label="Name des Rezepts">
        <input
          className={inputClass}
          value={name}
          maxLength={80}
          autoComplete="off"
          placeholder="z. B. Spaghetti Bolognese"
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
      </Field>

      <Field label="Portionen" hint="Für wie viele Personen gelten die Mengen unten?">
        <input
          className={inputClass}
          inputMode="numeric"
          value={servings}
          onChange={(e) => {
            setServings(e.target.value);
          }}
        />
      </Field>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-stone-700">Zutaten</h3>
        <ul className="space-y-3">
          {rows.map((row, index) => (
            <IngredientEditor
              key={row.key}
              row={row}
              index={index}
              items={sortedItems}
              itemsById={itemsById}
              onChange={(updated) => {
                setRows((current) => current.map((r) => (r.key === row.key ? updated : r)));
              }}
              onRemove={() => {
                setRows((current) => current.filter((r) => r.key !== row.key));
              }}
            />
          ))}
        </ul>
        <button
          type="button"
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-stone-100 font-semibold text-stone-800 active:bg-stone-200"
          onClick={() => {
            setRows((current) => [
              ...current,
              { key: newKey(), itemId: null, quantity: "", unit: null, basic: false },
            ]);
          }}
        >
          <PlusIcon className="h-5 w-5" /> Zutat hinzufügen
        </button>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-stone-700">Zubereitung</h3>
        <ol className="space-y-3">
          {steps.map((step, index) => (
            <li key={step.key} className="flex items-start gap-2">
              <span className="mt-3 w-6 shrink-0 text-right font-bold text-brand-800">
                {index + 1}.
              </span>
              <textarea
                className={`${inputClass} min-h-20`}
                aria-label={`Schritt ${String(index + 1)}`}
                maxLength={2000}
                value={step.text}
                onChange={(e) => {
                  const text = e.target.value;
                  setSteps((current) =>
                    current.map((s) => (s.key === step.key ? { ...s, text } : s)),
                  );
                }}
              />
              <button
                type="button"
                aria-label={`Schritt ${String(index + 1)} entfernen`}
                className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-stone-400 active:bg-stone-100"
                onClick={() => {
                  setSteps((current) => current.filter((s) => s.key !== step.key));
                }}
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-stone-100 font-semibold text-stone-800 active:bg-stone-200"
          onClick={() => {
            setSteps((current) => [...current, { key: newKey(), text: "" }]);
          }}
        >
          <PlusIcon className="h-5 w-5" /> Schritt hinzufügen
        </button>
      </section>

      {errors.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        className="min-h-12 w-full rounded-xl bg-brand-800 text-base font-semibold text-white active:bg-brand-900"
      >
        Rezept speichern
      </button>

      {recipe && (
        <button
          type="button"
          className="min-h-12 w-full rounded-xl bg-red-50 text-sm font-semibold text-red-700 active:bg-red-100"
          onClick={() => {
            if (!window.confirm(`Rezept „${recipe.name}“ wirklich löschen?`)) return;
            runSafely(async () => {
              await deleteRecipe(recipe.id);
              onDone(null);
            });
          }}
        >
          Rezept löschen
        </button>
      )}
    </form>
  );
}
