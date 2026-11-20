import { CartIcon, PantryIcon } from "./icons.tsx";

export type Tab = "pantry" | "shopping";

interface TabBarProps {
  active: Tab;
  shoppingCount: number;
  onChange: (tab: Tab) => void;
}

export function TabBar({ active, shoppingCount, onChange }: TabBarProps) {
  const tabClass = (tab: Tab) =>
    `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium ${
      active === tab ? "text-emerald-800" : "text-stone-500"
    }`;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <button
        type="button"
        className={tabClass("pantry")}
        aria-current={active === "pantry" ? "page" : undefined}
        onClick={() => {
          onChange("pantry");
        }}
      >
        <PantryIcon className="h-6 w-6" />
        Vorrat
      </button>
      <button
        type="button"
        className={tabClass("shopping")}
        aria-current={active === "shopping" ? "page" : undefined}
        onClick={() => {
          onChange("shopping");
        }}
      >
        <span className="relative">
          <CartIcon className="h-6 w-6" />
          {shoppingCount > 0 && (
            <span className="absolute -top-1.5 -right-2.5 min-w-5 rounded-full bg-amber-500 px-1 text-center text-[11px] leading-5 font-bold text-white">
              {shoppingCount}
            </span>
          )}
        </span>
        Einkaufsliste
      </button>
    </nav>
  );
}
