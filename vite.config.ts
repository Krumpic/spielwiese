import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { CONTENT_SECURITY_POLICY } from "./src/security/csp.ts";

const APP_NAME = "Vorrat";
const THEME_COLOR = "#2f6b4f";
const BACKGROUND_COLOR = "#f6f4ee";

/**
 * Fügt die Content Security Policy nur in den Produktions-Build ein.
 * Im Entwicklungsmodus braucht Vite Inline-Skripte (Hot Reload), die die CSP blockieren würde.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: "vorrat:content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: CONTENT_SECURITY_POLICY },
        injectTo: "head-prepend",
      },
    ],
  };
}

export default defineConfig({
  // Pfad auf GitHub Pages: https://<nutzer>.github.io/spielwiese/
  base: "/spielwiese/",
  plugins: [
    react(),
    tailwindcss(),
    contentSecurityPolicy(),
    VitePWA({
      registerType: "autoUpdate",
      // Registrierung als eigene Datei statt Inline-Skript – sonst würde die CSP greifen
      injectRegister: "script",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: APP_NAME,
        short_name: APP_NAME,
        description: "Virtueller Vorratsschrank und Einkaufsliste",
        lang: "de",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "portrait",
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,webmanifest}"],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    sourcemap: false,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
