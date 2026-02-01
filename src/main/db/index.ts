import Database from "better-sqlite3";
import path from "path";
import { app } from "electron";
import { migrate } from "./schema";

let db: Database.Database | null = null;

export function initDatabase() {
  const dbPath = path.join(app.getPath("userData"), "notes.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  migrate(db);
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error("数据库未初始化");
  }
  return db;
}
