import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    rollupOptions: {
      input: {
        // CRXJS picks up the panel from manifest side_panel.default_path,
        // but web_accessible_resources HTML files need an explicit entry.
        whiteboard: "src/whiteboard/index.html",
        preview:    "src/preview/index.html",
      },
    },
  },
});
