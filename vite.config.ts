import { defineConfig } from "vite";

export default defineConfig({
  preview: { allowedHosts: true },
  // GitHub Pages serves the game at https://<user>.github.io/Deeper/
  base: "/Deeper/",
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
  },
});
