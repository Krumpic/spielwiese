import { liveQuery, type Subscription } from "dexie";
import { useSyncExternalStore } from "react";
import type { Item } from "../domain/item.ts";
import type { ShoppingEntry } from "../domain/shopping.ts";
import { db } from "./schema.ts";

/**
 * Verbindet eine Datenbank-Abfrage mit React: Ändert sich etwas in der Datenbank,
 * wird die Oberfläche automatisch neu gezeichnet.
 * `undefined` bedeutet: wird noch geladen.
 */
function createLiveStore<T>(query: () => Promise<T>) {
  let value: T | undefined;
  let subscription: Subscription | null = null;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  return {
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      subscription ??= liveQuery(query).subscribe({
        next: (result) => {
          value = result;
          notify();
        },
        error: () => {
          console.error("Daten konnten nicht geladen werden.");
        },
      });
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          subscription?.unsubscribe();
          subscription = null;
        }
      };
    },
    getSnapshot: (): T | undefined => value,
  };
}

const itemsStore = createLiveStore<Item[]>(() => db.items.toArray());
const shoppingStore = createLiveStore<ShoppingEntry[]>(() => db.shopping.toArray());

export function useItems(): Item[] | undefined {
  return useSyncExternalStore(itemsStore.subscribe, itemsStore.getSnapshot);
}

export function useShoppingEntries(): ShoppingEntry[] | undefined {
  return useSyncExternalStore(shoppingStore.subscribe, shoppingStore.getSnapshot);
}

/** Zeitpunkt des letzten Backups: undefined = lädt noch, null = noch nie */
const lastBackupStore = createLiveStore<number | null>(
  async () => (await db.meta.get("lastBackupAt"))?.value ?? null,
);

export function useLastBackupAt(): number | null | undefined {
  return useSyncExternalStore(lastBackupStore.subscribe, lastBackupStore.getSnapshot);
}
