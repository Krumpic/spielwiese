import { useMemo, useState } from "react";
import { checkRecipe, type RecipeStatus } from "../domain/recipe.ts";
import { useItems, useRecipes } from "../db/live.ts";
import { Header } from "./Header.tsx";
import { RecipeDetail, STATUS_STYLE, statusText } from "./RecipeDetail.tsx";
import { RecipeForm } from "./RecipeForm.tsx";
import { Sheet } from "./Sheet.tsx";
import { PlusIcon, SearchIcon } from "./icons.tsx";

type Open = { type: "detail"; id: number } | { type: "form"; id: number | null } | null;

const STATUS_ORDER: ReadonlyMap<RecipeStatus, number> = new Map([
  ["green", 0],
  ["yellow", 1],
  ["red", 2],
]);

export function RecipesView() {
  const recipes = useRecipes();
  const items = useItems();
  const [filter, setFilter] = useState<"all" | "ready">("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Open>(null);

  const itemsById = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("de");
    return (recipes ?? [])
      .map((recipe) => {
        const result = checkRecipe(recipe, itemsById);
        const total = result.checks.filter((c) => c.state.kind !== "basic").length;
        return { recipe, total, ...result };
      })
      .filter((row) => filter === "all" || row.status === "green")
      .filter((row) => term === "" || row.recipe.name.toLocaleLowerCase("de").includes(term))
      .sort(
        (a, b) =>
          (STATUS_ORDER.get(a.status) ?? 0) - (STATUS_ORDER.get(b.status) ?? 0) ||
          a.recipe.name.localeCompare(b.recipe.name, "de"),
      );
  }, [recipes, itemsById, filter, search]);

  const openRecipe =
    open !== null && open.id !== null ? recipes?.find((r) => r.id === open.id) : undefined;

  return (
    <>
      <Header title="Rezepte">
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-white px-3 shadow-sm">
          <SearchIcon className="h-5 w-5 text-stone-400" />
          <input
            type="search"
            className="min-h-11 w-full bg-transparent text-base outline-none"
            placeholder="Rezept suchen"
            aria-label="Rezepte durchsuchen"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
          />
        </div>
        <div className="mt-3 flex gap-2">
          {(
            [
              ["all", "Alle"],
              ["ready", "Kann ich kochen"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setFilter(value);
              }}
              className={`min-h-9 rounded-full px-4 text-sm font-medium ${
                filter === value ? "bg-emerald-800 text-white" : "bg-white text-stone-700 shadow-sm"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Header>

      <main className="px-4 pb-28">
        {recipes === undefined || items === undefined ? (
          <p className="py-10 text-center text-stone-500">Wird geladen …</p>
        ) : recipes.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-lg font-semibold">Noch keine Rezepte.</p>
            <p className="mt-1 text-stone-600">
              Leg dein erstes Rezept an – die Zutaten kommen aus deinem Vorrat.
            </p>
            <button
              type="button"
              className="mt-6 min-h-12 rounded-xl bg-emerald-800 px-6 font-semibold text-white"
              onClick={() => {
                setOpen({ type: "form", id: null });
              }}
            >
              Erstes Rezept anlegen
            </button>
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-stone-500">
            {filter === "ready"
              ? "Gerade kannst du kein Rezept komplett kochen."
              : "Nichts gefunden."}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm">
            {rows.map(({ recipe, status, missingCount, total }) => {
              const style = STATUS_STYLE.get(status);
              return (
                <li key={recipe.id}>
                  <button
                    type="button"
                    className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left active:bg-stone-50"
                    onClick={() => {
                      setOpen({ type: "detail", id: recipe.id });
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-3.5 w-3.5 shrink-0 rounded-full ${style?.dot ?? ""}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-medium">{recipe.name}</span>
                      <span className={`block text-xs ${style?.text ?? ""}`}>
                        {statusText(status, missingCount, total)}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-stone-500">{recipe.servings} Port.</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <button
        type="button"
        aria-label="Neues Rezept anlegen"
        className="fixed right-5 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-800 text-white shadow-lg active:bg-emerald-900"
        onClick={() => {
          setOpen({ type: "form", id: null });
        }}
      >
        <PlusIcon className="h-7 w-7" />
      </button>

      {open?.type === "detail" && openRecipe && (
        <Sheet
          title={openRecipe.name}
          onClose={() => {
            setOpen(null);
          }}
        >
          <RecipeDetail
            key={openRecipe.id}
            recipe={openRecipe}
            itemsById={itemsById}
            onEdit={() => {
              setOpen({ type: "form", id: openRecipe.id });
            }}
          />
        </Sheet>
      )}

      {open?.type === "form" && (open.id === null || openRecipe) && (
        <Sheet
          title={open.id === null ? "Neues Rezept" : "Rezept bearbeiten"}
          onClose={() => {
            setOpen(open.id === null ? null : { type: "detail", id: open.id });
          }}
        >
          <RecipeForm
            recipe={openRecipe ?? null}
            items={items ?? []}
            onDone={(savedId) => {
              setOpen(savedId === null ? null : { type: "detail", id: savedId });
            }}
          />
        </Sheet>
      )}
    </>
  );
}
