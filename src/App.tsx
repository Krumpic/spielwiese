import { useState } from "react";
import { useShoppingEntries } from "./db/live.ts";
import { PantryView } from "./ui/PantryView.tsx";
import { ShoppingView } from "./ui/ShoppingView.tsx";
import { TabBar, type Tab } from "./ui/TabBar.tsx";

export function App() {
  const [tab, setTab] = useState<Tab>("pantry");
  const entries = useShoppingEntries();
  const openCount = entries?.filter((e) => !e.checked).length ?? 0;

  return (
    <div className="min-h-dvh bg-stone-100 text-stone-900">
      {tab === "pantry" ? <PantryView /> : <ShoppingView />}
      <TabBar active={tab} shoppingCount={openCount} onChange={setTab} />
    </div>
  );
}
