import type { ReactNode } from "react";
import { CartIcon, PantryIcon, SettingsIcon } from "./icons.tsx";

export type Tab = "pantry" | "shopping" | "settings";

interface TabBarProps {
  active: Tab;
  shoppingCount: number;
  /** Roter Punkt am Einstellungen-Tab (z. B. Backup fällig) */
  settingsAlert: boolean;
  onChange: (tab: Tab) => void;
}

function TabButton({
  tab,
  active,
  label,
  icon,
  onChange,
}: {
  tab: Tab;
  active: Tab;
  label: string;
  icon: ReactNode;
  onChange: (tab: Tab) => void;
}) {
  return (
    <button
      type="button"
      className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium ${
        active === tab ? "text-emerald-800" : "text-stone-500"
      }`}
      aria-current={active === tab ? "page" : undefined}
      onClick={() => {
        onChange(tab);
      }}
    >
      {icon}
      {label}
    </button>
  );
}

export function TabBar({ active, shoppingCount, settingsAlert, onChange }: TabBarProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <TabButton
        tab="pantry"
        active={active}
        label="Vorrat"
        icon={<PantryIcon className="h-6 w-6" />}
        onChange={onChange}
      />
      <TabButton
        tab="shopping"
        active={active}
        label="Einkaufsliste"
        icon={
          <span className="relative">
            <CartIcon className="h-6 w-6" />
            {shoppingCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 min-w-5 rounded-full bg-amber-500 px-1 text-center text-[11px] leading-5 font-bold text-white">
                {shoppingCount}
              </span>
            )}
          </span>
        }
        onChange={onChange}
      />
      <TabButton
        tab="settings"
        active={active}
        label="Einstellungen"
        icon={
          <span className="relative">
            <SettingsIcon className="h-6 w-6" />
            {settingsAlert && (
              <span
                className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500"
                aria-label="Backup fällig"
              />
            )}
          </span>
        }
        onChange={onChange}
      />
    </nav>
  );
}
