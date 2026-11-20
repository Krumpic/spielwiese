import type { ReactNode } from "react";
import { CloseIcon } from "./icons.tsx";

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Fenster, das von unten hochfährt (wie bei iOS üblich). */
export function Sheet({ title, onClose, children }: SheetProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/40"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white px-5 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-xl"
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
