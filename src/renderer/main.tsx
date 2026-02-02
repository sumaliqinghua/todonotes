import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import SkinPanelWindow from "./SkinPanelWindow";
import "./styles/app.css";

const params = new URLSearchParams(window.location.search);
const windowId = params.get("windowId") ?? "";
const rootTaskId = params.get("rootTaskId") ?? "";
const windowType = (params.get("windowType") as "library" | "sticky" | "skin" | null) ?? "library";
const ownerWindowId = params.get("ownerWindowId") ?? "";

const root = document.getElementById("root");
if (root) {
  if (windowType === "skin") {
    createRoot(root).render(<SkinPanelWindow ownerWindowId={ownerWindowId} />);
  } else {
    createRoot(root).render(<App windowId={windowId} rootTaskId={rootTaskId} windowType={windowType} />);
  }
}
