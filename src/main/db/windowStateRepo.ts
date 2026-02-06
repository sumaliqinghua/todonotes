import type { WindowState } from "../../shared/types";
import { getDb } from "./index";

function parseStickyBookmarks(raw: unknown) {
  if (typeof raw !== "string") {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item): item is { taskId: string; title: string } => {
        return Boolean(item && typeof item === "object" && typeof (item as any).taskId === "string");
      })
      .map((item) => ({ taskId: item.taskId, title: typeof item.title === "string" ? item.title : "" }));
  } catch {
    return [];
  }
}

function rowToState(row: any): WindowState {
  const stickyBookmarks = parseStickyBookmarks(row.sticky_bookmarks);
  return {
    windowId: row.window_id,
    rootTaskId: row.root_task_id,
    navPathTaskIds: JSON.parse(row.nav_path_task_ids),
    windowType: row.window_type ?? "library",
    stickyBookmarks,
    x: row.x === null ? null : Number(row.x),
    y: row.y === null ? null : Number(row.y),
    width: Number(row.width),
    height: Number(row.height),
    opacity: Number(row.opacity),
    stickyColor: row.sticky_color ?? "#f6e8a6",
    stickyOpacity: row.sticky_opacity === null ? 1 : Number(row.sticky_opacity),
    alwaysOnTop: row.always_on_top === 1,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}

export function upsertWindowState(state: WindowState) {
  const db = getDb();
  const stickyBookmarks = Array.isArray(state.stickyBookmarks) ? state.stickyBookmarks : [];
  db.prepare(
    `INSERT INTO window_states (window_id, root_task_id, nav_path_task_ids, window_type, sticky_bookmarks, x, y, width, height, opacity, sticky_color, sticky_opacity, always_on_top, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(window_id) DO UPDATE SET
       root_task_id = excluded.root_task_id,
       nav_path_task_ids = excluded.nav_path_task_ids,
       window_type = excluded.window_type,
       sticky_bookmarks = excluded.sticky_bookmarks,
       x = excluded.x,
       y = excluded.y,
       width = excluded.width,
       height = excluded.height,
       opacity = excluded.opacity,
       sticky_color = excluded.sticky_color,
       sticky_opacity = excluded.sticky_opacity,
       always_on_top = excluded.always_on_top,
       updated_at = excluded.updated_at`
  ).run(
    state.windowId,
    state.rootTaskId,
    JSON.stringify(state.navPathTaskIds),
    state.windowType,
    JSON.stringify(stickyBookmarks),
    state.x,
    state.y,
    state.width,
    state.height,
    state.opacity,
    state.stickyColor,
    state.stickyOpacity,
    state.alwaysOnTop ? 1 : 0,
    state.createdAt,
    state.updatedAt
  );
}

export function getWindowState(windowId: string): WindowState | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM window_states WHERE window_id = ?").get(windowId);
  return row ? rowToState(row) : null;
}

export function listWindowStates(): WindowState[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM window_states").all();
  return rows.map(rowToState);
}

export function deleteWindowState(windowId: string) {
  const db = getDb();
  db.prepare("DELETE FROM window_states WHERE window_id = ?").run(windowId);
}

export function getStickyBookmarksByRootTaskId(rootTaskId: string) {
  const db = getDb();
  const row = db.prepare("SELECT bookmarks FROM sticky_bookmarks WHERE root_task_id = ?").get(rootTaskId) as
    | { bookmarks?: unknown }
    | undefined;
  return parseStickyBookmarks(row?.bookmarks);
}

export function upsertStickyBookmarksByRootTaskId(rootTaskId: string, bookmarks: Array<{ taskId: string; title: string }>) {
  const db = getDb();
  const nextBookmarks = Array.isArray(bookmarks) ? bookmarks : [];
  db.prepare(
    `INSERT INTO sticky_bookmarks (root_task_id, bookmarks, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(root_task_id) DO UPDATE SET
       bookmarks = excluded.bookmarks,
       updated_at = excluded.updated_at`
  ).run(rootTaskId, JSON.stringify(nextBookmarks), Date.now());
}

export function findStickyBookmarksByContainedTaskId(taskId: string) {
  const db = getDb();
  const pattern = `%\"taskId\":\"${taskId}\"%`;
  const row = db
    .prepare("SELECT bookmarks FROM sticky_bookmarks WHERE bookmarks LIKE ? ORDER BY updated_at DESC LIMIT 1")
    .get(pattern) as { bookmarks?: unknown } | undefined;
  return parseStickyBookmarks(row?.bookmarks);
}
