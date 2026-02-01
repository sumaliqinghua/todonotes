import type Database from "better-sqlite3";

export function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      blocks TEXT NOT NULL,
      is_completed INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS edges (
      parent_task_id TEXT NOT NULL,
      child_task_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (parent_task_id, child_task_id)
    );

    CREATE TABLE IF NOT EXISTS window_states (
      window_id TEXT PRIMARY KEY,
      root_task_id TEXT NOT NULL,
      nav_path_task_ids TEXT NOT NULL,
      window_type TEXT NOT NULL DEFAULT 'library',
      x INTEGER,
      y INTEGER,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      opacity REAL NOT NULL,
      sticky_color TEXT NOT NULL DEFAULT '#f6e8a6',
      sticky_opacity REAL NOT NULL DEFAULT 1,
      always_on_top INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      remind_at INTEGER NOT NULL,
      is_done INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
      task_id UNINDEXED,
      title,
      content
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_deleted ON tasks (is_deleted, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks (is_archived);
    CREATE INDEX IF NOT EXISTS idx_edges_parent ON edges (parent_task_id);
    CREATE INDEX IF NOT EXISTS idx_edges_child ON edges (child_task_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders (is_done, remind_at);
  `);

  const columns = db.prepare("PRAGMA table_info(window_states)").all() as { name: string }[];
  const hasWindowType = columns.some((column) => column.name === "window_type");
  if (!hasWindowType) {
    db.exec("ALTER TABLE window_states ADD COLUMN window_type TEXT NOT NULL DEFAULT 'library'");
  }
  const hasStickyColor = columns.some((column) => column.name === "sticky_color");
  if (!hasStickyColor) {
    db.exec("ALTER TABLE window_states ADD COLUMN sticky_color TEXT NOT NULL DEFAULT '#f6e8a6'");
  }
  const hasStickyOpacity = columns.some((column) => column.name === "sticky_opacity");
  if (!hasStickyOpacity) {
    db.exec("ALTER TABLE window_states ADD COLUMN sticky_opacity REAL NOT NULL DEFAULT 1");
  }
}
