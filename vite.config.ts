import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// UI (React) działa na :5173 w trybie dev i przekierowuje /api oraz /ws do serwera na :4777.
export default defineConfig({
  plugins: [react()],
  root: "src/ui",
  build: { outDir: "../../dist", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4777",
      "/ws": { target: "ws://localhost:4777", ws: true },
    },
  },
});
