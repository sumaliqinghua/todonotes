import { app, BrowserWindow, screen } from "electron";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import type { WindowState } from "../shared/types";
import { listWindowStates, upsertWindowState } from "./db/windowStateRepo";

const SNAP_THRESHOLD = 20;
const MIN_VISIBLE = 32;
const DEFAULT_STICKY_COLOR = "#f6e8a6";
const DEFAULT_STICKY_OPACITY = 1;

const windows = new Map<string, BrowserWindow>();
const windowStates = new Map<string, WindowState>();

function getRendererUrl(windowId: string, rootTaskId: string, windowType: "library" | "sticky") {
  const base = process.env.VITE_DEV_SERVER_URL || (app.isPackaged ? "" : "http://localhost:5173");
  const query = `?windowId=${encodeURIComponent(windowId)}&rootTaskId=${encodeURIComponent(rootTaskId)}&windowType=${encodeURIComponent(windowType)}`;
  if (base) {
    return `${base}${query}`;
  }
  return `file://${path.join(__dirname, "../renderer/index.html")}${query}`;
}

function snapBounds(bounds: Electron.Rectangle) {
  const display = screen.getDisplayMatching(bounds);
  const area = display.workArea;
  let x = bounds.x;
  let y = bounds.y;

  if (Math.abs(bounds.x - area.x) <= SNAP_THRESHOLD) {
    x = area.x;
  }
  if (Math.abs(bounds.x + bounds.width - (area.x + area.width)) <= SNAP_THRESHOLD) {
    x = area.x + area.width - bounds.width;
  }
  if (Math.abs(bounds.y - area.y) <= SNAP_THRESHOLD) {
    y = area.y;
  }
  if (Math.abs(bounds.y + bounds.height - (area.y + area.height)) <= SNAP_THRESHOLD) {
    y = area.y + area.height - bounds.height;
  }

  const maxX = area.x + area.width - MIN_VISIBLE;
  const maxY = area.y + area.height - MIN_VISIBLE;
  if (x < area.x - bounds.width + MIN_VISIBLE) {
    x = area.x - bounds.width + MIN_VISIBLE;
  }
  if (y < area.y) {
    y = area.y;
  }
  if (x > maxX) {
    x = maxX;
  }
  if (y > maxY) {
    y = maxY;
  }

  return { x, y };
}

function normalizeHexColor(color: string) {
  const trimmed = color.replace("#", "").trim();
  if (trimmed.length === 3) {
    return trimmed
      .split("")
      .map((char) => char + char)
      .join("");
  }
  return trimmed.padStart(6, "0").slice(0, 6);
}

function resolveStickyBackground(color: string, opacity: number) {
  const safeOpacity = Math.min(1, Math.max(0, opacity));
  const alpha = Math.round(safeOpacity * 255)
    .toString(16)
    .padStart(2, "0");
  const hex = normalizeHexColor(color);
  return `#${hex}${alpha}`;
}

function createDefaultState(windowId: string, rootTaskId: string, windowType: "library" | "sticky"): WindowState {
  const now = Date.now();
  return {
    windowId,
    rootTaskId,
    navPathTaskIds: [rootTaskId],
    windowType,
    x: null,
    y: null,
    width: windowType === "sticky" ? 360 : 1100,
    height: windowType === "sticky" ? 420 : 720,
    opacity: 1,
    stickyColor: DEFAULT_STICKY_COLOR,
    stickyOpacity: DEFAULT_STICKY_OPACITY,
    alwaysOnTop: windowType === "sticky",
    createdAt: now,
    updatedAt: now
  };
}

export function createTaskWindow(
  rootTaskId: string,
  existingState?: WindowState,
  options?: { windowType?: "library" | "sticky" }
) {
  const windowId = existingState?.windowId ?? uuidv4();
  const windowType = existingState?.windowType ?? options?.windowType ?? "library";
  const state = existingState ?? createDefaultState(windowId, rootTaskId, windowType);

  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x ?? undefined,
    y: state.y ?? undefined,
    frame: false,
    resizable: true,
    transparent: false,
    alwaysOnTop: state.alwaysOnTop,
    backgroundColor:
      windowType === "sticky"
        ? resolveStickyBackground(state.stickyColor ?? DEFAULT_STICKY_COLOR, state.stickyOpacity ?? DEFAULT_STICKY_OPACITY)
        : "#151517",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setOpacity(state.opacity);
  win.setMinimumSize(windowType === "sticky" ? 260 : 800, windowType === "sticky" ? 300 : 520);
  win.loadURL(getRendererUrl(windowId, rootTaskId, windowType));

  const updateStateFromWindow = () => {
    const bounds = win.getBounds();
    const now = Date.now();
    const current = windowStates.get(windowId) ?? state;
    const next: WindowState = {
      ...current,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      alwaysOnTop: win.isAlwaysOnTop(),
      opacity: win.getOpacity(),
      updatedAt: now
    };
    windowStates.set(windowId, next);
  };

  win.on("move", () => {
    const bounds = win.getBounds();
    const snapped = snapBounds(bounds);
    if (snapped.x !== bounds.x || snapped.y !== bounds.y) {
      win.setBounds({ ...bounds, ...snapped });
    }
    updateStateFromWindow();
  });
  win.on("resize", updateStateFromWindow);
  win.on("closed", () => {
    windows.delete(windowId);
  });

  windows.set(windowId, win);
  windowStates.set(windowId, state);

  return { windowId, window: win };
}

export function getWindowById(windowId: string) {
  return windows.get(windowId) ?? null;
}

export function updateWindowState(partial: Partial<WindowState> & { windowId: string }) {
  const current = windowStates.get(partial.windowId);
  if (!current) {
    return;
  }
  const next = { ...current, ...partial, updatedAt: Date.now() };
  windowStates.set(partial.windowId, next);
  const win = windows.get(partial.windowId);
  if (win) {
    if (typeof partial.opacity === "number") {
      win.setOpacity(partial.opacity);
    }
    if (typeof partial.alwaysOnTop === "boolean") {
      win.setAlwaysOnTop(partial.alwaysOnTop);
    }
    if (current.windowType === "sticky" && (typeof partial.stickyColor === "string" || typeof partial.stickyOpacity === "number")) {
      const color = typeof partial.stickyColor === "string" ? partial.stickyColor : current.stickyColor ?? DEFAULT_STICKY_COLOR;
      const opacity = typeof partial.stickyOpacity === "number" ? partial.stickyOpacity : current.stickyOpacity ?? DEFAULT_STICKY_OPACITY;
      win.setBackgroundColor(resolveStickyBackground(color, opacity));
    }
  }
}

export function getWindowState(windowId: string): WindowState | null {
  return windowStates.get(windowId) ?? null;
}

export function loadWindowStates(): WindowState[] {
  const states = listWindowStates();
  states.forEach((state) => windowStates.set(state.windowId, state));
  return states;
}

export function persistAllWindowStates() {
  windowStates.forEach((state) => {
    upsertWindowState(state);
  });
}
