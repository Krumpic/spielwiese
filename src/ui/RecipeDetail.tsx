import { useMemo, useState } from "react";
import { LEVEL_IDS, convertUnit, levelLabel, type Level } from "../domain/constants.ts";
import { formatQuantity, type Item } from "../domain/item.ts";
import {
  MAX_SERVINGS,
  checkRecipe,
  levelItemsToAsk,
  type IngredientCheck,
  type Recipe,
  type RecipeStatus,
} from "../domain/recipe.ts";
import {
  addMissingIngredientsToShoppingList,
  cookRecipe,
  putItemsOnShoppingList,
  undoCooking,
  type CookResult,
} from "../db/repository.ts";
import { Segmented } from "./form.tsx";
import { runSafely } from "./runSafely.ts";

export const STATUS_STYLE: ReadonlyMap<RecipeStatus, { dot: string; text: string }> = new Map([
  ["green", { dot: "bg-emerald-500", text: "text-emerald-800" }],
  ["yellow", { dot: "bg-amber-400", text: "text-amber-800" }],
  ["red", { dot: "bg-red-500", text: "text-red-700" }],
]);

export function statusText(status: RecipeStatus, missing: number, total: number): string {
  if (status === "green") return "Alles da – kann gekocht werden";
  if (status === "red") return "Nichts da";
  return `${String(missing)} von ${String(total)} ${total === 1 ? "Zutat fehlt" : "Zutaten fehlen"}`;
}

function IngredientLine({ check }: { check: IngredientCheck }) {
  const { item, ingredient, needed, state } = check;
  const amount =
    needed !== null && ingredient.unit !== null ? formatQuantity(needed, ingredient.unit) : "";

  let icon = "✓";
  let iconClass = "bg-emerald-100 text-emerald-800";
  let detail: string | null = null;

  if (state.kind === "partial" || state.kind === "missing") {
    icon = state.kind === "partial" ? "◐" : "✗";
    iconClass =
      state.kind === "partial" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700";
    if (item?.mode === "exact" && ingredient.unit !== null) {
      const have = convertUnit(item.quantity, item.unit, ingredient.unit);
      detail =
        have !== null && have > 0 ? `Da: ${formatQuantity(have, ingredient.unit)}` : "Nicht da";
    } else {
      detail = "Nicht da";
    }
  } else if (state.kind === "basic") {
    icon = "•";
    iconClass = "bg-stone-100 text-stone-500";
    detail = "Grundzutat";
  } else if (state.kind === "invalid") {
    icon = "!";
    iconClass = "bg-red-100 text-red-700";
    detail = item ? "Einheit passt nicht mehr zum Vorrat" : "Artikel wurde gelöscht";
  } else if (item?.mode === "level") {
    detail = `Stand: ${levelLabel(item.level)}`;
  }

  return (
    <li className="flex items-center gap-3 py-2">
      <span
        aria-hidden="true"
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${iconClass}`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{item?.name ?? "Gelöschter Artikel"}</span>
        {detail && <span className="block text-xs text-stone-500">{detail}</span>}
      </span>
      <span className="shrink-0 text-sm text-stone-700 tabular-nums">{amount}</span>
    </li>
  );
}

type Phase =
  | { type: "idle" }
  | { type: "askLevels"; items: Item[]; answers: Map<number, Level> }
  | { type: "cooked"; result: CookResult; selected: Set<number>; listed: boolean };

interface RecipeDetailProps {
  recipe: Recipe;
  itemsById: ReadonlyMap<number, Item>;
  onEdit: () => void;
}

export function RecipeDetail({ recipe, itemsById, onEdit }: RecipeDetailProps) {
  const [servings, setServings] = useState(recipe.servings);
  const [phase, setPhase] = useState<Phase>({ type: "idle" });
  const [notice, setNotice] = useState<string | null>(null);

  const { checks, status, missingCount } = useMemo(
    () => checkRecipe(recipe, itemsById, servings),
    [recipe, itemsById, servings],
  );
  const relevantCount = checks.filter((c) => c.state.kind !== "basic").length;
  const style = STATUS_STYLE.get(status);

  const cook = (answers: ReadonlyMap<number, Level>) => {
    runSafely(async () => {
      const result = await cookRecipe(recipe.id, servings, answers);
      setNotice(null);
      setPhase({
        type: "cooked",
        result,
        selected: new Set(result.emptied.map(({ item }) => item.id)),
        listed: false,
      });
    });
  };

  const startCooking = () => {
    const levelItems = levelItemsToAsk(checks);
    if (levelItems.length === 0) {
      cook(new Map());
      return;
    }
    setPhase({
      type: "askLevels",
      items: levelItems,
      answers: new Map(levelItems.map((i) => [i.id, i.level])),
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={`h-3 w-3 rounded-full ${style?.dot ?? ""}`} />
        <span className={`text-sm font-semibold ${style?.text ?? ""}`}>
          {statusText(status, missingCount, relevantCount)}
        </span>
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-stone-100 p-2">
        <button
          type="button"
          aria-label="Weniger Portionen"
          disabled={servings <= 1}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl shadow-sm disabled:opacity-40"
          onClick={() => {
            setServings((s) => Math.max(1, s - 1));
          }}
        >
          −
        </button>
        <span className="font-semibold">
          {servings} {servings === 1 ? "Portion" : "Portionen"}
          {servings !== recipe.servings && (
            <span className="block text-center text-xs font-normal text-stone-500">
              Rezept für {recipe.servings}
            </span>
          )}
        </span>
        <button
          type="button"
          aria-label="Mehr Portionen"
          disabled={servings >= MAX_SERVINGS}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl shadow-sm disabled:opacity-40"
          onClick={() => {
            setServings((s) => Math.min(MAX_SERVINGS, s + 1));
          }}
        >
          +
        </button>
      </div>

      <section>
        <h3 className="mb-1 text-xs font-bold tracking-wider text-stone-500 uppercase">Zutaten</h3>
        {checks.length === 0 ? (
          <p className="text-sm text-stone-500">Noch keine Zutaten eingetragen.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {checks.map((check) => (
              <IngredientLine key={check.ingredient.itemId} check={check} />
            ))}
          </ul>
        )}
      </section>

      {/* ---------- Aktionen ---------- */}
      {phase.type === "idle" &&
        (status === "green" ? (
          <button
            type="button"
            className="min-h-12 w-full rounded-xl bg-emerald-800 text-base font-semibold text-white active:bg-emerald-900"
            onClick={startCooking}
          >
            Jetzt kochen
          </button>
        ) : (
          <button
            type="button"
            className="min-h-12 w-full rounded-xl bg-amber-500 text-base font-semibold text-white active:bg-amber-600"
            onClick={() => {
              runSafely(async () => {
                const added = await addMissingIngredientsToShoppingList(recipe.id, servings);
                setNotice(
                  added === 0
                    ? "Es gibt nichts hinzuzufügen."
                    : `${String(added)} ${added === 1 ? "Zutat steht" : "Zutaten stehen"} jetzt auf der Einkaufsliste.`,
                );
              });
            }}
          >
            Fehlende Zutaten auf die Einkaufsliste
          </button>
        ))}

      {phase.type === "askLevels" && (
        <section className="space-y-3 rounded-2xl bg-amber-50 p-4">
          <h3 className="font-semibold">Wie viel ist nach dem Kochen noch da?</h3>
          {phase.items.map((item) => (
            <div key={item.id}>
              <p className="mb-1 text-sm font-medium">{item.name}</p>
              <Segmented
                label={`Füllstand ${item.name}`}
                value={phase.answers.get(item.id) ?? item.level}
                options={LEVEL_IDS.map((id) => ({ value: id, label: levelLabel(id) }))}
                onChange={(level) => {
                  const answers = new Map(phase.answers);
                  answers.set(item.id, level);
                  setPhase({ ...phase, answers });
                }}
              />
            </div>
          ))}
          <button
            type="button"
            className="min-h-12 w-full rounded-xl bg-emerald-800 font-semibold text-white"
            onClick={() => {
              cook(phase.answers);
            }}
          >
            Fertig – vom Vorrat abziehen
          </button>
          <button
            type="button"
            className="min-h-11 w-full rounded-xl font-semibold text-stone-600"
            onClick={() => {
              setPhase({ type: "idle" });
            }}
          >
            Abbrechen
          </button>
        </section>
      )}

      {phase.type === "cooked" && (
        <section className="space-y-3 rounded-2xl bg-emerald-50 p-4" role="status">
          <p className="font-semibold text-emerald-900">
            Guten Appetit! Die Zutaten wurden vom Vorrat abgezogen.
          </p>
          {phase.result.emptied.length > 0 &&
            (phase.listed ? (
              <p className="text-sm text-emerald-900">✓ Steht jetzt auf der Einkaufsliste.</p>
            ) : (
              <div className="rounded-xl bg-white p-3">
                <p className="mb-1 text-sm font-semibold">Jetzt leer – auf die Einkaufsliste?</p>
                {phase.result.emptied.map(({ item, quantity }) => (
                  <label key={item.id} className="flex min-h-11 items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-emerald-700"
                      checked={phase.selected.has(item.id)}
                      onChange={(e) => {
                        const selected = new Set(phase.selected);
                        if (e.target.checked) selected.add(item.id);
                        else selected.delete(item.id);
                        setPhase({ ...phase, selected });
                      }}
                    />
                    <span className="flex-1">{item.name}</span>
                    {quantity !== null && (
                      <span className="text-stone-500 tabular-nums">
                        {formatQuantity(quantity, item.unit)}
                      </span>
                    )}
                  </label>
                ))}
                <button
                  type="button"
                  disabled={phase.selected.size === 0}
                  className="mt-2 min-h-11 w-full rounded-xl bg-amber-500 font-semibold text-white disabled:opacity-40"
                  onClick={() => {
                    runSafely(async () => {
                      await putItemsOnShoppingList(
                        phase.result.emptied
                          .filter(({ item }) => phase.selected.has(item.id))
                          .map(({ item, quantity }) => ({ itemId: item.id, quantity })),
                      );
                      setPhase({ ...phase, listed: true });
                    });
                  }}
                >
                  Auf die Einkaufsliste
                </button>
              </div>
            ))}
          <button
            type="button"
            className="min-h-11 w-full rounded-xl bg-white font-semibold text-stone-700 shadow-sm"
            onClick={() => {
              runSafely(async () => {
                await undoCooking(phase.result.before);
                setPhase({ type: "idle" });
                setNotice("Rückgängig gemacht – der Vorrat ist wie vorher.");
              });
            }}
          >
            Rückgängig
          </button>
        </section>
      )}

      {notice && (
        <p className="rounded-xl bg-stone-100 p-3 text-sm text-stone-700" role="status">
          {notice}
        </p>
      )}

      <section>
        <h3 className="mb-2 text-xs font-bold tracking-wider text-stone-500 uppercase">
          Zubereitung
        </h3>
        {recipe.steps.length === 0 ? (
          <p className="text-sm text-stone-500">Noch keine Schritte eingetragen.</p>
        ) : (
          <ol className="space-y-3">
            {recipe.steps.map((step, index) => (
              <li key={`${String(index)}-${step.slice(0, 20)}`} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-800 text-sm font-bold text-white">
                  {index + 1}
                </span>
                <p className="pt-0.5 whitespace-pre-line text-stone-800">{step}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <button
        type="button"
        className="min-h-12 w-full rounded-xl bg-stone-100 font-semibold text-stone-800 active:bg-stone-200"
        onClick={onEdit}
      >
        Rezept bearbeiten
      </button>
    </div>
  );
}
