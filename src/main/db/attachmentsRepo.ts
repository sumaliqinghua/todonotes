import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import { app } from "electron";
import type { Attachment, AttachmentAddInput } from "../../shared/types";
import { getDb } from "./index";

function rowToAttachment(row: any): Attachment {
  return {
    id: row.id,
    taskId: row.task_id,
    originalName: row.original_name,
    storedName: row.stored_name,
    storedPath: row.stored_path,
    createdAt: Number(row.created_at)
  };
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function addAttachment(input: AttachmentAddInput): Attachment {
  const db = getDb();
  const now = Date.now();
  const id = uuidv4();
  const storedName = uuidv4();
  const bucket = new Date(now);
  const bucketDir = path.join(
    app.getPath("userData"),
    "attachments",
    String(bucket.getFullYear()),
    String(bucket.getMonth() + 1).padStart(2, "0"),
    String(bucket.getDate()).padStart(2, "0")
  );
  ensureDir(bucketDir);
  const storedPath = path.join(bucketDir, storedName);
  fs.copyFileSync(input.filePath, storedPath);

  db.prepare(
    "INSERT INTO attachments (id, task_id, original_name, stored_name, stored_path, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, input.taskId, input.originalName, storedName, storedPath, now);

  return getAttachment(id)!;
}

export function getAttachment(id: string): Attachment | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM attachments WHERE id = ?").get(id);
  return row ? rowToAttachment(row) : null;
}

export function listAttachments(taskId: string): Attachment[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM attachments WHERE task_id = ? ORDER BY created_at DESC").all(taskId);
  return rows.map(rowToAttachment);
}
