import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Distributor Portal: the app a distributor / CNF (made on DMS > Add Distributor) signs in to.
// Served at /distributor/. In dev it runs on port 3002 and sends /api to the backend (2002).
export default defineConfig({
  base: "/distributor/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  server: {
    port: 3002,
    strictPort: true,
    host: true,
    proxy: { "/api": { target: "http://localhost:2002", changeOrigin: true } },
  },
});
