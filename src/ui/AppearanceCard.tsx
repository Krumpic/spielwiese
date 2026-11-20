import {
  COLOR_MODES,
  THEME_IDS,
  colorModeLabel,
  themeLabel,
  type Appearance,
} from "../domain/appearance.ts";
import { saveColorMode, saveTheme } from "../db/repository.ts";
import { Segmented } from "./form.tsx";
import { CheckIcon } from "./icons.tsx";
import { runSafely } from "./runSafely.ts";

/** Auswahl von Signature-Farbe und Hell/Dunkel */
export function AppearanceCard({ appearance }: { appearance: Appearance }) {
  return (
    <section className="mt-4 rounded-2xl bg-surface p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-bold">Design</h2>

      <p className="mb-2 text-sm font-semibold text-stone-700">Signature-Farbe</p>
      <div role="radiogroup" aria-label="Signature-Farbe" className="grid grid-cols-3 gap-2">
        {THEME_IDS.map((id) => {
          const selected = appearance.theme === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border-2 text-xs font-medium ${
                selected ? "border-brand-700 bg-brand-50" : "border-transparent bg-stone-100"
              }`}
              onClick={() => {
                runSafely(() => saveTheme(id));
              }}
            >
              {/* data-theme am Farbfeld zeigt die jeweilige Farbe, ohne Inline-Styles (CSP) */}
              <span
                data-theme={id}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm"
              >
                {selected && <CheckIcon className="h-5 w-5" />}
              </span>
              {themeLabel(id)}
            </button>
          );
        })}
      </div>

      <p className="mt-4 mb-2 text-sm font-semibold text-stone-700">Hell oder dunkel</p>
      <Segmented
        label="Hell oder dunkel"
        value={appearance.colorMode}
        options={COLOR_MODES.map((mode) => ({ value: mode, label: colorModeLabel(mode) }))}
        onChange={(mode) => {
          runSafely(() => saveColorMode(mode));
        }}
      />
      <p className="mt-2 text-xs text-stone-500">
        „Automatisch“ folgt der Einstellung deines iPhones.
      </p>
    </section>
  );
}
