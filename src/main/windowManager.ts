import { app, BrowserWindow, screen } from "electron";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import type { WindowState } from "../shared/types";
import { deleteWindowState, listWindowStates, upsertWindowState } from "./db/windowStateRepo";

const SNAP_THRESHOLD = 20;
const MIN_VISIBLE = 32;
const DEFAULT_STICKY_COLOR = "#f6e8a6";
const DEFAULT_STICKY_OPACITY = 1;
const STICKY_MINI_HEIGHT = 36;
const SKIN_PANEL_SIZE = { width: 320, height: 180 };
const SKIN_PANEL_OFFSET = 0;

const windows = new Map<string, BrowserWindow>();
const windowStates = new Map<string, WindowState>();
const skinPanels = new Map<string, BrowserWindow>();
let isQuitting = false;

function getRendererUrl(
  windowId: string,
  rootTaskId: string,
  windowType: "library" | "sticky" | "skin",
  extraParams: Record<string, string> = {}
) {
  const base = process.env.VITE_DEV_SERVER_URL || (app.isPackaged ? "" : "http://localhost:5173");
  const params = new URLSearchParams({
    windowId,
    rootTaskId,
    windowType,
    ...extraParams
  });
  const query = `?${params.toString()}`;
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

function getSkinPanelBounds(ownerBounds: Electron.Rectangle) {
  const display = screen.getDisplayMatching(ownerBounds);
  const area = display.workArea;
  const areaRight = area.x + area.width;
  const areaBottom = area.y + area.height;
  const panelWidth = SKIN_PANEL_SIZE.width;
  const panelHeight = SKIN_PANEL_SIZE.height;
  const centeredX = Math.round(ownerBounds.x + (ownerBounds.width - panelWidth) / 2);
  const candidates = [
    {
      x: centeredX,
      y: ownerBounds.y - panelHeight - SKIN_PANEL_OFFSET
    },
    {
      x: ownerBounds.x + ownerBounds.width + SKIN_PANEL_OFFSET,
      y: ownerBounds.y + SKIN_PANEL_OFFSET
    },
    {
      x: ownerBounds.x - panelWidth - SKIN_PANEL_OFFSET,
      y: ownerBounds.y + SKIN_PANEL_OFFSET
    },
    {
      x: ownerBounds.x + ownerBounds.width - panelWidth,
      y: ownerBounds.y + SKIN_PANEL_OFFSET
    }
  ];
  for (const candidate of candidates) {
    if (
      candidate.x >= area.x &&
      candidate.y >= area.y &&
      candidate.x + panelWidth <= areaRight &&
      candidate.y + panelHeight <= areaBottom
    ) {
      return { ...candidate, width: panelWidth, height: panelHeight };
    }
  }
  const x = Math.min(Math.max(area.x + 8, centeredX), areaRight - panelWidth - 8);
  const y = Math.min(Math.max(area.y + 8, ownerBounds.y - panelHeight - SKIN_PANEL_OFFSET), areaBottom - panelHeight - 8);
  return { x, y, width: panelWidth, height: panelHeight };
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
    skipTaskbar: windowType === "sticky",
    maximizable: windowType !== "sticky",
    fullscreenable: windowType !== "sticky",
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
  win.setMinimumSize(windowType === "sticky" ? 260 : 800, windowType === "sticky" ? STICKY_MINI_HEIGHT : 520);
  if (windowType === "sticky") {
    win.setFullScreenable(false);
    win.on("enter-full-screen", () => win.setFullScreen(false));
  }
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
    const panel = skinPanels.get(windowId);
    if (panel && !panel.isDestroyed()) {
      panel.close();
    }
    skinPanels.delete(windowId);
    if (!isQuitting) {
      windowStates.delete(windowId);
      deleteWindowState(windowId);
    }
  });

  windows.set(windowId, win);
  windowStates.set(windowId, state);

  return { windowId, window: win };
}

export function getWindowById(windowId: string) {
  return windows.get(windowId) ?? null;
}

export function getWindowsByType(windowType: WindowState["windowType"]) {
  const result: BrowserWindow[] = [];
  windows.forEach((win, id) => {
    const state = windowStates.get(id);
    if (state?.windowType === windowType) {
      result.push(win);
    }
  });
  return result;
}

export function markAppQuitting() {
  isQuitting = true;
}

export function toggleSkinPanel(ownerWindowId: string, open?: boolean) {
  const owner = windows.get(ownerWindowId);
  if (!owner) {
    return { open: false };
  }
  const existing = skinPanels.get(ownerWindowId);
  const shouldOpen = typeof open === "boolean" ? open : !existing;
  if (!shouldOpen) {
    if (existing && !existing.isDestroyed()) {
      existing.close();
    }
    skinPanels.delete(ownerWindowId);
    return { open: false };
  }
  if (existing && !existing.isDestroyed()) {
    existing.setBounds(getSkinPanelBounds(owner.getBounds()));
    existing.focus();
    return { open: true };
  }
  const panelId = `skin-${ownerWindowId}`;
  const bounds = getSkinPanelBounds(owner.getBounds());
  const panel = new BrowserWindow({
    ...bounds,
    frame: false,
    resizable: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    parent: owner,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  panel.setAlwaysOnTop(true, "pop-up-menu");
  panel.loadURL(getRendererUrl(panelId, "", "skin", { ownerWindowId }));
  skinPanels.set(ownerWindowId, panel);

  const updatePosition = () => {
    if (panel.isDestroyed()) {
      return;
    }
    panel.setBounds(getSkinPanelBounds(owner.getBounds()));
  };
  const handleOwnerClosed = () => {
    if (!panel.isDestroyed()) {
      panel.close();
    }
  };
  owner.on("move", updatePosition);
  owner.on("resize", updatePosition);
  owner.on("closed", handleOwnerClosed);
  panel.on("blur", () => {
    if (!panel.isDestroyed()) {
      panel.close();
    }
  });
  panel.on("closed", () => {
    owner.removeListener("move", updatePosition);
    owner.removeListener("resize", updatePosition);
    owner.removeListener("closed", handleOwnerClosed);
    skinPanels.delete(ownerWindowId);
  });

  return { open: true };
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
    if (typeof partial.width === "number" || typeof partial.height === "number") {
      const bounds = win.getBounds();
      const nextWidth = typeof partial.width === "number" ? Math.round(partial.width) : bounds.width;
      const nextHeight = typeof partial.height === "number" ? Math.round(partial.height) : bounds.height;
      if (nextWidth !== bounds.width || nextHeight !== bounds.height) {
        win.setBounds({ ...bounds, width: nextWidth, height: nextHeight });
      }
    }
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
