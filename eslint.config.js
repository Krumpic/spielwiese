import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import security from "eslint-plugin-security";
import globals from "globals";

const FORBIDDEN_DOM_SINKS = [
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: "dangerouslySetInnerHTML ist verboten (XSS-Gefahr).",
  },
  {
    selector: "MemberExpression[property.name=/^(innerHTML|outerHTML)$/]",
    message: "innerHTML/outerHTML ist verboten (XSS-Gefahr). Text über React rendern.",
  },
  {
    selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
    message: "insertAdjacentHTML ist verboten (XSS-Gefahr).",
  },
  {
    selector: "CallExpression[callee.object.name='document'][callee.property.name=/^write(ln)?$/]",
    message: "document.write ist verboten.",
  },
];

export default defineConfig(
  // Schutzdateien (.claude) gehören dem Nutzer und werden hier nicht geprüft
  { ignores: ["dist/", "dev-dist/", "coverage/", "node_modules/", ".claude/"] },

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  security.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
      "no-restricted-syntax": ["error", ...FORBIDDEN_DOM_SINKS],
      "no-restricted-globals": [
        "error",
        {
          name: "localStorage",
          message: "Daten gehören in IndexedDB (Dexie), nicht in localStorage.",
        },
      ],
    },
  },
  {
    files: ["**/*.{js,mjs}"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  // AUSNAHME (vom Nutzer freigegeben, 20.11.2026) – nur für die Browser-Testskripte:
  // Sie laufen lokal in Node (nicht Teil der App) und schreiben Screenshots und Ergebnisse
  // bewusst in einen beim Aufruf übergebenen Ordner. Die Regel „Dateizugriff mit variablem
  // Pfad" meldet dort nur Fehlalarme. Alle anderen Regeln gelten weiterhin.
  {
    files: ["tests/e2e/**/*.mjs"],
    rules: { "security/detect-non-literal-fs-filename": "off" },
  },
);
