import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ContextMenuPanelWindow from "./ContextMenuPanelWindow";
import SkinPanelWindow from "./SkinPanelWindow";
import "./styles/app.css";

const params = new URLSearchParams(window.location.search);
const windowId = params.get("windowId") ?? "";
const rootTaskId = params.get("rootTaskId") ?? "";
const windowType = (params.get("windowType") as "library" | "sticky" | "skin" | "contextMenu" | null) ?? "library";
const ownerWindowId = params.get("ownerWindowId") ?? "";
const menuItems = params.get("menuItems") ?? "";

const root = document.getElementById("root");
if (root) {
  if (windowType === "skin") {
    createRoot(root).render(<SkinPanelWindow ownerWindowId={ownerWindowId} />);
  } else if (windowType === "contextMenu") {
    createRoot(root).render(<ContextMenuPanelWindow ownerWindowId={ownerWindowId} menuItemsRaw={menuItems} />);
  } else {
    createRoot(root).render(<App windowId={windowId} rootTaskId={rootTaskId} windowType={windowType} />);
  }
}
