import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "App";
// Tailwind CSS 4 + daisyUI 5 (pages are moving from MUI one by one).
import "./tailwind.css";

// Material Dashboard 2 React Context Provider
import { MaterialUIControllerProvider } from "context";
import { AuthProvider } from "context/AuthContext";

const container = document.getElementById("app");
// A tab that was Sales & Purchase (dms/) and then came back to the main site (logout, sign-in,
// back link) still carries that tab's window name. Clear it, or the sidebar's Sales & Purchase
// link would "find" this tab and not open anything.
if (window.name === "edunextg-sales-purchase") window.name = "";

const root = createRoot(container);

root.render(
  <BrowserRouter>
    <AuthProvider>
      <MaterialUIControllerProvider>
        <App />
      </MaterialUIControllerProvider>
    </AuthProvider>
  </BrowserRouter>
);
