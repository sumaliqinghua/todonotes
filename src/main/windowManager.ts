import { app, BrowserWindow, screen } from "electron";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import type { WindowState } from "../shared/types";
import { listWindowStates, upsertWindowState } from "./db/windowStateRepo";

const SNAP_THRESHOLD = 20;
const MIN_VISIBLE = 32;

const windows = new Map<string, BrowserWindow>();
const windowStates = new Map<string, WindowState>();

function getRendererUrl(windowId: string, rootTaskId: string) {
  const base = process.env.VITE_DEV_SERVER_URL || (app.isPackaged ? "" : "http://localhost:5173");
  const query = `?windowId=${encodeURIComponent(windowId)}&rootTaskId=${encodeURIComponent(rootTaskId)}`;
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

function createDefaultState(windowId: string, rootTaskId: string): WindowState {
  const now = Date.now();
  return {
    windowId,
    rootTaskId,
    navPathTaskIds: [rootTaskId],
    x: null,
    y: null,
    width: 420,
    height: 600,
    opacity: 1,
    alwaysOnTop: false,
    createdAt: now,
    updatedAt: now
  };
}

export function createTaskWindow(rootTaskId: string, existingState?: WindowState) {
  const windowId = existingState?.windowId ?? uuidv4();
  const state = existingState ?? createDefaultState(windowId, rootTaskId);

  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x ?? undefined,
    y: state.y ?? undefined,
    frame: false,
    resizable: true,
    transparent: false,
    alwaysOnTop: state.alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setOpacity(state.opacity);
  win.setMinimumSize(320, 360);
  win.loadURL(getRendererUrl(windowId, rootTaskId));

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
