import { getDb } from "./index";

export function createEdge(parentId: string, childId: string) {
  const db = getDb();
  const now = Date.now();
  db.prepare("INSERT OR IGNORE INTO edges (parent_task_id, child_task_id, created_at) VALUES (?, ?, ?)").run(
    parentId,
    childId,
    now
  );
}

export function deleteEdge(parentId: string, childId: string) {
  const db = getDb();
  db.prepare("DELETE FROM edges WHERE parent_task_id = ? AND child_task_id = ?").run(parentId, childId);
}

export function deleteEdgesByChildId(childId: string) {
  const db = getDb();
  db.prepare("DELETE FROM edges WHERE child_task_id = ?").run(childId);
}

export function listChildrenIds(parentId: string): string[] {
  const db = getDb();
  const rows = db.prepare("SELECT child_task_id FROM edges WHERE parent_task_id = ?").all(parentId) as {
    child_task_id: string;
  }[];
  return rows.map((row) => row.child_task_id);
}
