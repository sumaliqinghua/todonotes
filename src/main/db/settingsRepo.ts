import type { CodexMode } from "../../shared/types";
import { getDb } from "./index";

const CODEX_MODE_KEY = "codex.mode";
const CODEX_MODE_VALUES = new Set<CodexMode>(["terminal", "app"]);

export function getCodexMode(): CodexMode {
  const row = getDb().prepare("SELECT value FROM app_settings WHERE key = ?").get(CODEX_MODE_KEY) as { value?: string } | undefined;
  return row?.value && CODEX_MODE_VALUES.has(row.value as CodexMode) ? (row.value as CodexMode) : "terminal";
}

export function setCodexMode(mode: CodexMode): CodexMode {
  const nextMode = CODEX_MODE_VALUES.has(mode) ? mode : "terminal";
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(CODEX_MODE_KEY, nextMode, Date.now());
  return nextMode;
}
