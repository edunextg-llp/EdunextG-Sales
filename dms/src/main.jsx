import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import App from "./App";
import "./index.css";

const theme = createTheme({
  // Keep in step with the daisyUI "dms" theme in index.css.
  palette: { primary: { main: "#1d4ed8" }, secondary: { main: "#f97316" }, background: { default: "#f5f8fd" } },
  shape: { borderRadius: 10 },
});

// Dev only: the DMS app must be opened through the main site (port 3000) so it
// shares the main site's login. If it was opened on its own port (3001), jump
// to the same page on the main site instead.
const MAIN_DEV_PORT = import.meta.env.VITE_MAIN_PORT || "3000";
const DMS_DEV_PORT = "3001";
const openedDirectly = import.meta.env.DEV && window.location.port === DMS_DEV_PORT;

if (openedDirectly) {
  const { protocol, hostname, pathname, search, hash } = window.location;
  window.location.replace(`${protocol}//${hostname}:${MAIN_DEV_PORT}${pathname}${search}${hash}`);
} else {
  renderApp();
}

function renderApp() {
  ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename="/dms">
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
  );
}
