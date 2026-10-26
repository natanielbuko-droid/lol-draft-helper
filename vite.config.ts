import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// UI (React) działa na :5173 w trybie dev i przekierowuje /api oraz /ws do serwera na :4777 (albo API_PORT).
const api = `localhost:${process.env.API_PORT ?? 4777}`;

export default defineConfig({
  plugins: [react()],
  root: "src/ui",
  build: { outDir: "../../dist", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      "/api": `http://${api}`,
      "/ws": { target: `ws://${api}`, ws: true },
    },
  },
});
