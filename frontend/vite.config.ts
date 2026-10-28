// Plain Vite SPA build. `npm run build` writes static files to ../app/web, which the Pi's FastAPI serves.
// No Node is needed on the Pi.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    tsConfigPaths(),
  ],
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
  build: { outDir: process.env.REFLEX_WEB_OUT || "dist", emptyOutDir: true },
});
