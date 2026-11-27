import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The DMS app is served at /dms/ on the SAME origin as the main site, so it
// shares the main site's login (tokens live in that origin's browser storage).
//
// Production: `npm run build` -> dist/. Serve dist/ at https://<main site>/dms/ and send
// every unknown /dms/* path to /dms/index.html (the app has its own routes). /api must be on
// the same origin (the app calls /api/...).
//
// Dev: open it through the main site, http://localhost:3000/dms/
// (frontend/src/setupProxy.js forwards /dms to this server on port 3001).
export default defineConfig({
  // Must match <BrowserRouter basename="/dms"> in src/main.jsx.
  base: "/dms/",
  plugins: [react(), tailwindcss()],

  // `npm run dev` only (ignored by `npm run build`).
  server: {
    port: 3001,
    strictPort: true,
    host: true,
  },
  // `npm run preview` (try the production build locally).
  preview: {
    port: 3001,
    strictPort: true,
    host: true,
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2020",
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Big libraries in their own files: they change rarely, so browsers keep them cached
        // across DMS updates.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("exceljs")) return "excel";
          if (id.includes("/node_modules/jodit")) return "invoice-editor";
          if (id.includes("@mui/x-charts") || id.includes("d3-")) return "charts";
          if (id.includes("@mui") || id.includes("@emotion")) return "mui";
          if (id.includes("react-icons")) return "icons";
          // React, the router and the rest together (splitting React out makes a circular chunk).
          return "vendor";
        },
      },
    },
  },
});
