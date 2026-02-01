import { v4 as uuidv4 } from "uuid";
import type { Reminder, ReminderCreateInput } from "../../shared/types";
import { getDb } from "./index";

function rowToReminder(row: any): Reminder {
  return {
    id: row.id,
    taskId: row.task_id,
    remindAt: Number(row.remind_at),
    isDone: row.is_done === 1,
    createdAt: Number(row.created_at)
  };
}

export function createReminder(input: ReminderCreateInput): Reminder {
  const db = getDb();
  const id = uuidv4();
  const now = Date.now();
  db.prepare("INSERT INTO reminders (id, task_id, remind_at, is_done, created_at) VALUES (?, ?, ?, 0, ?)").run(
    id,
    input.taskId,
    input.remindAt,
    now
  );
  return getReminder(id)!;
}

export function getReminder(id: string): Reminder | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM reminders WHERE id = ?").get(id);
  return row ? rowToReminder(row) : null;
}

export function listDueReminders(now: number): Reminder[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM reminders WHERE is_done = 0 AND remind_at <= ? ORDER BY remind_at ASC")
    .all(now);
  return rows.map(rowToReminder);
}

export function listRemindersByTask(taskId: string): Reminder[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM reminders WHERE task_id = ? ORDER BY remind_at ASC")
    .all(taskId);
  return rows.map(rowToReminder);
}

export function markReminderDone(id: string) {
  const db = getDb();
  db.prepare("UPDATE reminders SET is_done = 1 WHERE id = ?").run(id);
}

export function deleteReminder(id: string) {
  const db = getDb();
  db.prepare("DELETE FROM reminders WHERE id = ?").run(id);
}
