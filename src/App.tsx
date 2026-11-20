import { useState } from "react";
import { isBackupOverdue } from "./domain/backup.ts";
import { useAppearance, useItems, useLastBackupAt, useShoppingEntries } from "./db/live.ts";
import { useApplyAppearance } from "./ui/appearance.ts";
import { PantryView } from "./ui/PantryView.tsx";
import { RecipesView } from "./ui/RecipesView.tsx";
import { SettingsView } from "./ui/SettingsView.tsx";
import { ShoppingView } from "./ui/ShoppingView.tsx";
import { TabBar, type Tab } from "./ui/TabBar.tsx";

export function App() {
  const [tab, setTab] = useState<Tab>("pantry");
  const [now] = useState(() => Date.now());
  const items = useItems();
  const entries = useShoppingEntries();
  const lastBackupAt = useLastBackupAt();
  useApplyAppearance(useAppearance());

  const openCount = entries?.filter((e) => !e.checked).length ?? 0;
  const backupOverdue =
    items !== undefined &&
    lastBackupAt !== undefined &&
    isBackupOverdue(lastBackupAt, items.length, now);

  return (
    <div className="min-h-dvh bg-stone-100 text-stone-900">
      {tab === "pantry" && (
        <PantryView
          backupOverdue={backupOverdue}
          onOpenSettings={() => {
            setTab("settings");
          }}
        />
      )}
      {tab === "shopping" && <ShoppingView />}
      {tab === "recipes" && <RecipesView />}
      {tab === "settings" && <SettingsView />}
      <TabBar
        active={tab}
        shoppingCount={openCount}
        settingsAlert={backupOverdue}
        onChange={setTab}
      />
    </div>
  );
}
