import type { ReactNode } from "react";
import { CloseIcon } from "./icons.tsx";

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Fenster, das von unten hochfährt (wie bei iOS üblich).
 * Lässt sich nur nach oben/unten scrollen – nie seitlich:
 * overflow-x-hidden schneidet Überstehendes ab, touch-pan-y erlaubt nur senkrechtes Wischen,
 * overscroll-contain verhindert, dass beim Scrollen die Seite dahinter mitwackelt.
 */
export function Sheet({ title, onClose, children }: SheetProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex touch-pan-y items-end overflow-hidden bg-black/40"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92dvh] w-full max-w-full touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain rounded-t-3xl bg-surface px-5 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-xl"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-100 text-stone-600 active:bg-stone-200"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
