import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { requestPersistentStorage } from "./ui/backupFile.ts";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Startelement fehlt.");
}

// Beim Start um dauerhaften Speicher bitten (Daten nicht bei Speicherknappheit löschen)
void requestPersistentStorage();

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
