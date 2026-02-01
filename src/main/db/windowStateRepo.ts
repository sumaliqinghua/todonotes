import type { WindowState } from "../../shared/types";
import { getDb } from "./index";

function rowToState(row: any): WindowState {
  return {
    windowId: row.window_id,
    rootTaskId: row.root_task_id,
    navPathTaskIds: JSON.parse(row.nav_path_task_ids),
    x: row.x === null ? null : Number(row.x),
    y: row.y === null ? null : Number(row.y),
    width: Number(row.width),
    height: Number(row.height),
    opacity: Number(row.opacity),
    alwaysOnTop: row.always_on_top === 1,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}

export function upsertWindowState(state: WindowState) {
  const db = getDb();
  db.prepare(
    `INSERT INTO window_states (window_id, root_task_id, nav_path_task_ids, x, y, width, height, opacity, always_on_top, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(window_id) DO UPDATE SET
       root_task_id = excluded.root_task_id,
       nav_path_task_ids = excluded.nav_path_task_ids,
       x = excluded.x,
       y = excluded.y,
       width = excluded.width,
       height = excluded.height,
       opacity = excluded.opacity,
       always_on_top = excluded.always_on_top,
       updated_at = excluded.updated_at`
  ).run(
    state.windowId,
    state.rootTaskId,
    JSON.stringify(state.navPathTaskIds),
    state.x,
    state.y,
    state.width,
    state.height,
    state.opacity,
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
