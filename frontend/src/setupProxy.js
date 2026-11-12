const { createProxyMiddleware } = require("http-proxy-middleware");

// Dev only: forward /api requests to the backend.
// Used instead of "proxy" in package.json, which crashes react-scripts 5
// ("options.allowedHosts[0] should be a non-empty string") when no LAN IP is found.
module.exports = function setupProxy(app) {
  app.use(
    "/api",
    createProxyMiddleware({
      target: "http://localhost:2002",
      changeOrigin: true,
    })
  );

  // The DMS app (../dms, run with "npm run dev" on port 3001) is served at
  // /dms/ on this same origin so it shares this site's login.
  // The path filter is passed to the proxy (not app.use) so that only /dms
  // websocket upgrades go to the DMS dev server, not this site's own /ws.
  app.use(
    createProxyMiddleware("/dms", {
      target: "http://localhost:3001",
      changeOrigin: true,
      ws: true,
    })
  );
};
