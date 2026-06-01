import { v4 as uuidv4 } from "uuid";
import type { JsonValue, StatusBlock, Task, TaskCreateInput, TaskUpdateInput } from "../../shared/types";
import { getDb } from "./index";
import { extractPlainText } from "../utils/blocks";
import { collectStatusBlocksFromTask } from "../../shared/blockStatus";

const DEFAULT_BLOCKS: JsonValue = {
  type: "doc",
  content: [{ type: "paragraph" }]
};

function rowToTask(row: any): Task {
  return {
    id: row.id,
    title: row.title,
    blocks: JSON.parse(row.blocks),
    isCompleted: row.is_completed === 1,
    isArchived: row.is_archived === 1,
    isDeleted: row.is_deleted === 1,
    deletedAt: row.deleted_at === null ? null : Number(row.deleted_at),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}

function updateFts(taskId: string, title: string, blocks: JsonValue) {
  const db = getDb();
  const content = extractPlainText(blocks);
  const deleteStmt = db.prepare("DELETE FROM tasks_fts WHERE task_id = ?");
  const insertStmt = db.prepare("INSERT INTO tasks_fts (task_id, title, content) VALUES (?, ?, ?)");
  const tx = db.transaction(() => {
    deleteStmt.run(taskId);
    insertStmt.run(taskId, title, content);
  });
  tx();
}

export function createTask(input: TaskCreateInput): Task {
  const db = getDb();
  const now = Date.now();
  const id = uuidv4();
  const blocks = input.blocks ?? DEFAULT_BLOCKS;
  const stmt = db.prepare(
    "INSERT INTO tasks (id, title, blocks, is_completed, is_archived, is_deleted, deleted_at, created_at, updated_at) VALUES (?, ?, ?, 0, 0, 0, NULL, ?, ?)"
  );
  stmt.run(id, input.title, JSON.stringify(blocks), now, now);
  updateFts(id, input.title, blocks);
  return getTaskById(id)!;
}

export function hasSiblingTaskTitle(title: string, parentId: string, options?: { excludeTaskId?: string }): boolean {
  const db = getDb();
  const normalized = title.trim();
  if (!normalized || !parentId) {
    return false;
  }
  const excludeTaskId = options?.excludeTaskId;
  if (excludeTaskId) {
    const row = db
      .prepare(
        `SELECT 1
         FROM tasks t
         JOIN edges e ON e.child_task_id = t.id
         WHERE e.parent_task_id = ?
           AND lower(trim(t.title)) = lower(trim(?))
           AND t.id != ?
           AND t.is_deleted = 0
         LIMIT 1`
      )
      .get(parentId, normalized, excludeTaskId);
    return Boolean(row);
  }
  const row = db
    .prepare(
      `SELECT 1
       FROM tasks t
       JOIN edges e ON e.child_task_id = t.id
       WHERE e.parent_task_id = ?
         AND lower(trim(t.title)) = lower(trim(?))
         AND t.is_deleted = 0
       LIMIT 1`
    )
    .get(parentId, normalized);
  return Boolean(row);
}

export function updateTask(input: TaskUpdateInput): Task {
  const db = getDb();
  const existing = getTaskById(input.id);
  if (!existing) {
    throw new Error("任务不存在");
  }
  const now = Date.now();
  const next = {
    title: input.title ?? existing.title,
    blocks: input.blocks ?? existing.blocks,
    isCompleted: input.isCompleted ?? existing.isCompleted,
    isArchived: input.isArchived ?? existing.isArchived
  };
  const stmt = db.prepare(
    "UPDATE tasks SET title = ?, blocks = ?, is_completed = ?, is_archived = ?, updated_at = ? WHERE id = ?"
  );
  stmt.run(
    next.title,
    JSON.stringify(next.blocks),
    next.isCompleted ? 1 : 0,
    next.isArchived ? 1 : 0,
    now,
    input.id
  );
  updateFts(input.id, next.title, next.blocks);
  return getTaskById(input.id)!;
}

export function getTaskById(id: string): Task | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  return row ? rowToTask(row) : null;
}

export function listRootTasks(options: { includeArchived?: boolean; includeDeleted?: boolean }): Task[] {
  const db = getDb();
  const params: any[] = [];
  let sql = "SELECT * FROM tasks WHERE id NOT IN (SELECT child_task_id FROM edges)";
  if (!options.includeDeleted) {
    sql += " AND is_deleted = 0";
  }
  if (!options.includeArchived) {
    sql += " AND is_archived = 0";
  }
  sql += " ORDER BY updated_at DESC";
  const rows = db.prepare(sql).all(...params);
  return rows.map(rowToTask);
}

export function listChildTasks(parentId: string, options?: { includeArchived?: boolean; includeDeleted?: boolean }): Task[] {
  const db = getDb();
  let sql =
    "SELECT t.* FROM tasks t JOIN edges e ON t.id = e.child_task_id WHERE e.parent_task_id = ?";
  if (!options?.includeDeleted) {
    sql += " AND t.is_deleted = 0";
  }
  if (!options?.includeArchived) {
    sql += " AND t.is_archived = 0";
  }
  sql += " ORDER BY t.updated_at DESC";
  const rows = db.prepare(sql).all(parentId);
  return rows.map(rowToTask);
}

export function listChildTasksByCreatedAt(
  parentId: string,
  options?: { includeArchived?: boolean; includeDeleted?: boolean }
): Task[] {
  const db = getDb();
  let sql =
    "SELECT t.* FROM tasks t JOIN edges e ON t.id = e.child_task_id WHERE e.parent_task_id = ?";
  if (!options?.includeDeleted) {
    sql += " AND t.is_deleted = 0";
  }
  if (!options?.includeArchived) {
    sql += " AND t.is_archived = 0";
  }
  sql += " ORDER BY e.created_at ASC";
  const rows = db.prepare(sql).all(parentId);
  return rows.map(rowToTask);
}

export function listParentsByChildId(childId: string): Task[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT t.* FROM tasks t JOIN edges e ON t.id = e.parent_task_id WHERE e.child_task_id = ? ORDER BY e.created_at ASC"
    )
    .all(childId);
  return rows.map(rowToTask);
}

export function getAncestorChain(taskId: string): Task[] {
  const db = getDb();
  const chain: Task[] = [];
  let currentId: string | null = taskId;
  while (currentId) {
    const parentRow = db
      .prepare("SELECT parent_task_id FROM edges WHERE child_task_id = ? ORDER BY created_at ASC LIMIT 1")
      .get(currentId) as { parent_task_id: string } | undefined;
    if (!parentRow) {
      break;
    }
    const parent = getTaskById(parentRow.parent_task_id);
    if (!parent) {
      break;
    }
    chain.unshift(parent);
    currentId = parent.id;
  }
  return chain;
}

export function softDeleteTaskRecursively(rootId: string) {
  const db = getDb();
  const now = Date.now();
  const queue: string[] = [rootId];
  const updateStmt = db.prepare(
    "UPDATE tasks SET is_deleted = 1, deleted_at = ?, is_archived = 0, updated_at = ? WHERE id = ?"
  );
  const getChildrenStmt = db.prepare("SELECT child_task_id FROM edges WHERE parent_task_id = ?");
  const tx = db.transaction(() => {
    while (queue.length > 0) {
      const id = queue.shift()!;
      updateStmt.run(now, now, id);
      const children = getChildrenStmt.all(id) as { child_task_id: string }[];
      children.forEach((child) => queue.push(child.child_task_id));
    }
  });
  tx();
}

export function restoreTaskRecursively(rootId: string) {
  const db = getDb();
  const now = Date.now();
  const queue: string[] = [rootId];
  const updateStmt = db.prepare(
    "UPDATE tasks SET is_deleted = 0, deleted_at = NULL, is_archived = 0, updated_at = ? WHERE id = ?"
  );
  const getChildrenStmt = db.prepare("SELECT child_task_id FROM edges WHERE parent_task_id = ?");
  const tx = db.transaction(() => {
    while (queue.length > 0) {
      const id = queue.shift()!;
      updateStmt.run(now, id);
      const children = getChildrenStmt.all(id) as { child_task_id: string }[];
      children.forEach((child) => queue.push(child.child_task_id));
    }
  });
  tx();
}

export function purgeDeletedTasks(olderThanMs: number) {
  const db = getDb();
  const cutoff = Date.now() - olderThanMs;
  const ids = db
    .prepare("SELECT id FROM tasks WHERE is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at <= ?")
    .all(cutoff) as { id: string }[];
  const deleteTaskStmt = db.prepare("DELETE FROM tasks WHERE id = ?");
  const deleteEdgesByParent = db.prepare("DELETE FROM edges WHERE parent_task_id = ?");
  const deleteEdgesByChild = db.prepare("DELETE FROM edges WHERE child_task_id = ?");
  const deleteFts = db.prepare("DELETE FROM tasks_fts WHERE task_id = ?");
  const tx = db.transaction(() => {
    ids.forEach(({ id }) => {
      deleteEdgesByParent.run(id);
      deleteEdgesByChild.run(id);
      deleteTaskStmt.run(id);
      deleteFts.run(id);
    });
  });
  tx();
}

export function searchTasks(options: { query: string; includeArchived?: boolean; includeDeleted?: boolean }): Task[] {
  const db = getDb();
  const includeArchived = options.includeArchived ?? false;
  const includeDeleted = options.includeDeleted ?? false;
  const escaped = options.query.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  const likeQuery = `%${escaped}%`;
  const sql = `SELECT t.* FROM tasks t
       LEFT JOIN tasks_fts f ON t.id = f.task_id
       WHERE (tasks_fts MATCH ? OR t.title LIKE ? ESCAPE '\\')
       ${includeDeleted ? "" : "AND t.is_deleted = 0"}
       ${includeArchived ? "" : "AND t.is_archived = 0"}
       ORDER BY t.updated_at DESC`;
  try {
    const rows = db.prepare(sql).all(options.query, likeQuery);
    return rows.map(rowToTask);
  } catch (error) {
    const fallback = db
      .prepare(
        `SELECT t.* FROM tasks t
         WHERE t.title LIKE ? ESCAPE '\\'
         ${includeDeleted ? "" : "AND t.is_deleted = 0"}
         ${includeArchived ? "" : "AND t.is_archived = 0"}
         ORDER BY t.updated_at DESC`
      )
      .all(likeQuery);
    return fallback.map(rowToTask);
  }
}

export function getPriorityBlocks(): import("../../shared/types").PriorityBlock[] {
  const db = getDb();
  const sql = `SELECT id, title, blocks FROM tasks WHERE is_deleted = 0 AND is_archived = 0 AND is_completed = 0`;
  const rows = db.prepare(sql).all() as any[];
  const results: import("../../shared/types").PriorityBlock[] = [];

  for (const row of rows) {
    const blocks = JSON.parse(row.blocks);
    if (typeof blocks !== 'object' || !blocks || !Array.isArray((blocks as any).content)) continue;

    const findPriorityBlocks = (node: any) => {
      if (!node || typeof node !== 'object') return;

      // Check if current node has priority attribute
      if (node.attrs && typeof node.attrs.priority === 'string' && node.attrs.priority) {
        results.push({
          taskId: row.id,
          taskTitle: row.title,
          blockId: node.attrs.id || '',
          priority: node.attrs.priority,
          text: extractPlainText(node)
        });
      }

      // Recurse into content array
      if (Array.isArray(node.content)) {
        for (const child of node.content) {
          findPriorityBlocks(child);
        }
      }
    };

    for (const block of (blocks as any).content) {
      findPriorityBlocks(block);
    }
  }

  const priorityMap: Record<string, number> = { high: 1, medium: 2, low: 3 };

  // Sort by priority ascending (1 is highest priority)
  return results.sort((a, b) => {
    const valA = priorityMap[String(a.priority)] || 99;
    const valB = priorityMap[String(b.priority)] || 99;
    return valA - valB;
  });
}

export function listStatusBlocksByRootTaskId(rootTaskId: string): StatusBlock[] {
  const root = getTaskById(rootTaskId);
  if (!root || root.isDeleted || root.isArchived || root.isCompleted) {
    return [];
  }

  const db = getDb();
  const getChildrenStmt = db.prepare(
    `SELECT t.*
     FROM tasks t
     JOIN edges e ON t.id = e.child_task_id
     WHERE e.parent_task_id = ?
       AND t.is_deleted = 0
       AND t.is_archived = 0
       AND t.is_completed = 0
     ORDER BY e.created_at ASC`
  );

  const queue: Task[] = [root];
  const visited = new Set<string>();
  const results: StatusBlock[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.id)) {
      continue;
    }
    visited.add(current.id);
    results.push(...collectStatusBlocksFromTask(current));
    const children = getChildrenStmt.all(current.id).map(rowToTask);
    children.forEach((child) => {
      if (!visited.has(child.id)) {
        queue.push(child);
      }
    });
  }

  return results;
}

export function listAllActiveStatusBlocks(): StatusBlock[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM tasks WHERE is_deleted = 0 AND is_archived = 0 AND is_completed = 0 ORDER BY updated_at DESC")
    .all();
  return rows.flatMap((row) => collectStatusBlocksFromTask(rowToTask(row)));
}
