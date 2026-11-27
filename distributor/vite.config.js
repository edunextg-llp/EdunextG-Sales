import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Distributor Portal: the app a distributor / CNF (made on DMS > Add Distributor) signs in to.
// It is served at /distributor/ on the SAME origin as the main site, so distributors sign in
// on the main site's sign-in page and share its login.
//
// Production: `npm run build` -> dist/. Serve dist/ at https://<main site>/distributor/ and
// send every unknown /distributor/* path to /distributor/index.html. /api must be on the same
// origin (the app calls /api/distributor/...). The dev proxy below is not used in production.
//
// Dev: runs on port 3002 and sends /api to the backend (2002).
export default defineConfig({
  // The router reads this (BrowserRouter basename = import.meta.env.BASE_URL).
  base: "/distributor/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },

  // `npm run dev` only (ignored by `npm run build`).
  server: {
    fs: { allow: [import.meta.dirname, path.resolve(import.meta.dirname, "../dms/src/utils")] },
    port: 3002,
    strictPort: true,
    host: true,
    proxy: { "/api": { target: "https://distributor.edunextg.in", changeOrigin: true } },
  },
  // `npm run preview` (try the production build locally).
  preview: {
    port: 3002,
    strictPort: true,
    host: true,
    proxy: { "/api": { target: "https://distributor.edunextg.in", changeOrigin: true } },
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2020",
    chunkSizeWarningLimit: 1000,
  },
});
