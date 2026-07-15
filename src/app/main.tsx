import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { TokenBudgetProvider } from "@shared/lib/tokenBudget";
import { initNativeApp } from "@shared/native/init";
import "./index.css";
import "./App.css";

// Mobile-shell-only bootstrap (safe areas, status bar, OAuth deep links).
// No-op on the website; never gates render.
initNativeApp();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <TokenBudgetProvider>
        <App />
      </TokenBudgetProvider>
    </BrowserRouter>
  </React.StrictMode>
);
