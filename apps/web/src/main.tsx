import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { markDesktop, rememberDeepLink } from "./lib/desktop.js";
import "./index.css";

markDesktop();
rememberDeepLink();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
