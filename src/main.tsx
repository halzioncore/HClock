import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import App from "./App";

const isWidgetView = new URLSearchParams(window.location.search).get("view") === "widget";
const isIdeaView = new URLSearchParams(window.location.search).get("view") === "idea";

if (isWidgetView || isIdeaView) {
  document.documentElement.dataset.view = isWidgetView ? "widget" : "idea";

  if ("__TAURI_INTERNALS__" in window) {
    void getCurrentWebview().setBackgroundColor([0, 0, 0, 0]).catch(() => undefined);
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
