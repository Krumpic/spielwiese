import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { DEFAULT_APPEARANCE } from "./domain/appearance.ts";
import { loadAppearance } from "./db/repository.ts";
import { applyAppearance } from "./ui/appearance.ts";
import { requestPersistentStorage } from "./ui/backupFile.ts";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Startelement fehlt.");
}

// Beim Start um dauerhaften Speicher bitten (Daten nicht bei Speicherknappheit löschen)
void requestPersistentStorage();

const render = () => {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
};

// Design vor dem ersten Zeichnen anwenden (kein kurzes Aufblitzen der Standardfarbe)
loadAppearance()
  .then(applyAppearance)
  .catch(() => {
    applyAppearance(DEFAULT_APPEARANCE);
  })
  .finally(render);
