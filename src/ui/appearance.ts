import { useEffect } from "react";
import { isDark, type Appearance } from "../domain/appearance.ts";

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

/**
 * Setzt Design und Hell/Dunkel als Attribute auf <html>.
 * Die Farben selbst stehen in src/theme.css (CSS-Variablen je Attribut).
 */
export function applyAppearance(appearance: Appearance): void {
  const html = document.documentElement;
  html.dataset["theme"] = appearance.theme;
  html.dataset["mode"] = isDark(appearance.colorMode, darkQuery.matches) ? "dark" : "light";

  // Browser-/Statusleiste an den Hintergrund anpassen
  const background = getComputedStyle(html).getPropertyValue("--color-stone-100").trim();
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", background === "" ? "#f5f5f4" : background);
}

/** Wendet das Design an und folgt bei „Automatisch" dem Hell/Dunkel des iPhones. */
export function useApplyAppearance(appearance: Appearance | undefined): void {
  useEffect(() => {
    if (!appearance) return;
    applyAppearance(appearance);
    if (appearance.colorMode !== "auto") return;
    const onChange = () => {
      applyAppearance(appearance);
    };
    darkQuery.addEventListener("change", onChange);
    return () => {
      darkQuery.removeEventListener("change", onChange);
    };
  }, [appearance]);
}
