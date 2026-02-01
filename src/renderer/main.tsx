import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/app.css";

const params = new URLSearchParams(window.location.search);
const windowId = params.get("windowId") ?? "";
const rootTaskId = params.get("rootTaskId") ?? "";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App windowId={windowId} rootTaskId={rootTaskId} />);
}
