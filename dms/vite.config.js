import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The DMS app is served at /dms/ on the SAME origin as the main site, so it
// shares the main site's login (tokens live in that origin's browser storage).
// In dev, open it through the main site: http://localhost:3000/dms/
// (frontend/src/setupProxy.js forwards /dms to this server on port 3001).
export default defineConfig({
  base: "/dms/",
  plugins: [react(), tailwindcss()],
  server: {
    port: 3001,
    strictPort: true,
    host: true,
  },
});
