const { createProxyMiddleware } = require("http-proxy-middleware");

// Dev only: forward /api requests to the backend.
// Used instead of "proxy" in package.json, which crashes react-scripts 5
// ("options.allowedHosts[0] should be a non-empty string") when no LAN IP is found.
module.exports = function setupProxy(app) {
  app.use(
    "/api",
    createProxyMiddleware({
      target: "https://bawarchee.edunextg.co",
      changeOrigin: true,
    })
  );
};
