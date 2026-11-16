import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

// The portal shares the main site's sign-in, which lives in the main site's browser storage,
// so it must be opened through the main site (http://localhost:3000/distributor/ in dev,
// where frontend/src/setupProxy.js forwards /distributor here). Opened directly on this dev
// server's own port, there is no session and no sign-in page: go to the main site instead.
const MAIN_SITE_DEV_PORT = import.meta.env.VITE_MAIN_SITE_PORT || "3000";
const openedDirectly = import.meta.env.DEV && window.location.port === String(import.meta.env.VITE_DEV_PORT || "3002");

if (openedDirectly) {
  const { protocol, hostname, pathname, search, hash } = window.location;
  window.location.replace(`${protocol}//${hostname}:${MAIN_SITE_DEV_PORT}${pathname}${search}${hash}`);
} else {
  createRoot(document.getElementById("root")).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
