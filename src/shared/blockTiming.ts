import type { JsonValue, TimedBlock } from "./types";

const TIMED_BLOCK_TYPES = new Set(["paragraph", "heading", "listItem", "taskItem"]);

interface JsonRecord {
  [key: string]: JsonValue;
}

export interface BlockTimingValue {
  timestamp: number;
  dueAt: number;
}

function isRecord(value: JsonValue): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nodeType(node: JsonRecord): string {
  return typeof node.type === "string" ? node.type : "";
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return null;
}

function readInlineText(node: JsonValue): string {
  if (typeof node === "string") {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map((item) => readInlineText(item)).join("");
  }
  if (!isRecord(node)) {
    return "";
  }
  const type = nodeType(node);
  if (type === "text") {
    return typeof node.text === "string" ? node.text : "";
  }
  if (type === "taskLink" && isRecord(node.attrs)) {
    return typeof node.attrs.title === "string" ? node.attrs.title : "";
  }
  if (Array.isArray(node.content)) {
    return readInlineText(node.content);
  }
  return "";
}

function readNodeText(node: JsonRecord): string {
  if (Array.isArray(node.content)) {
    return readInlineText(node.content);
  }
  return "";
}

function normalizePreview(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 100) : "未命名内容";
}

export function isTimedBlockType(type: string): boolean {
  return TIMED_BLOCK_TYPES.has(type);
}

export function getBlockTiming(node: JsonValue): BlockTimingValue | null {
  if (!isRecord(node) || !isRecord(node.attrs)) {
    return null;
  }
  const dueAt = parseTimestamp(node.attrs.dueAt);
  if (dueAt !== null) {
    return {
      timestamp: dueAt,
      dueAt
    };
  }
  return null;
}

export function getTimedBlockDueAt(value: Pick<TimedBlock, "dueAt">): number | null {
  return parseTimestamp(value.dueAt);
}

function formatPositiveDuration(totalMinutes: number): string {
  if (totalMinutes <= 0) {
    return "";
  }
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  return parts.join("");
}

export function formatBlockTimingDuration(timestamp: number, now = Date.now()): string {
  const diffMs = Math.max(0, timestamp - now);
  const totalMinutes = Math.ceil(diffMs / 60000);
  return formatPositiveDuration(totalMinutes);
}

export function formatBlockTimingBadge(
  value: Pick<TimedBlock, "dueAt">,
  now = Date.now()
): { text: string; timestamp: number } | null {
  const dueAt = getTimedBlockDueAt(value);
  if (dueAt === null) {
    return null;
  }
  const diffMs = dueAt - now;
  if (diffMs > 0) {
    return {
      text: formatBlockTimingDuration(dueAt, now),
      timestamp: dueAt
    };
  }
  const overdueMinutes = Math.floor(Math.abs(diffMs) / 60000);
  const overdueText = formatPositiveDuration(overdueMinutes);
  return {
    text: overdueText ? `超时${overdueText}` : "已超时",
    timestamp: dueAt
  };
}

export function isTimestampInToday(timestamp: number, now = Date.now()): boolean {
  const current = new Date(now);
  const start = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
  const end = start + 24 * 60 * 60 * 1000;
  return timestamp >= start && timestamp < end;
}

export function isTimestampWithinWindow(timestamp: number, now = Date.now(), windowMs: number): boolean {
  return Math.abs(timestamp - now) <= windowMs;
}

export function collectTimedBlocksFromTask(task: { id: string; title: string; blocks: JsonValue }): TimedBlock[] {
  const results: TimedBlock[] = [];

  const visit = (value: JsonValue) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) {
      return;
    }
    const type = nodeType(value);
    const timing = getBlockTiming(value);
    if (timing && isTimedBlockType(type)) {
      const attrs = isRecord(value.attrs) ? value.attrs : null;
      const blockId = typeof attrs?.id === "string" ? attrs.id : "";
      if (blockId) {
        results.push({
          taskId: task.id,
          taskTitle: task.title,
          blockId,
          blockType: type,
          blockContent: normalizePreview(readNodeText(value)),
          ...(timing.dueAt !== null ? { dueAt: timing.dueAt } : {})
        });
      }
    }
    if (Array.isArray(value.content)) {
      value.content.forEach(visit);
    }
  };

  visit(task.blocks);
  return results;
}

export function updateBlockTimingInBlocks(
  blocks: JsonValue,
  blockId: string,
  next: { dueAt: number | null }
): { blocks: JsonValue; changed: boolean } {
  const visit = (value: JsonValue): { value: JsonValue; changed: boolean } => {
    if (Array.isArray(value)) {
      let changed = false;
      const nextArray = value.map((item) => {
        const updated = visit(item);
        if (updated.changed) {
          changed = true;
        }
        return updated.value;
      });
      return changed ? { value: nextArray, changed: true } : { value, changed: false };
    }
    if (!isRecord(value)) {
      return { value, changed: false };
    }

    let changed = false;
    let nextRecord: JsonRecord = value;

    if (isRecord(value.attrs) && value.attrs.id === blockId && isTimedBlockType(nodeType(value))) {
      const currentDueAt = parseTimestamp(value.attrs.dueAt);
      const nextDueAt = parseTimestamp(next.dueAt);
      if (currentDueAt !== nextDueAt) {
        const nextAttrs = { ...value.attrs } as Record<string, JsonValue>;
        delete nextAttrs.startAt;
        nextRecord = {
          ...nextRecord,
          attrs: {
            ...nextAttrs,
            dueAt: nextDueAt
          }
        };
        changed = true;
      }
    }

    if (Array.isArray(value.content)) {
      let contentChanged = false;
      const nextContent = value.content.map((item) => {
        const updated = visit(item);
        if (updated.changed) {
          contentChanged = true;
        }
        return updated.value;
      });
      if (contentChanged) {
        nextRecord = {
          ...nextRecord,
          content: nextContent
        };
        changed = true;
      }
    }

    return changed ? { value: nextRecord, changed: true } : { value, changed: false };
  };

  const updated = visit(blocks);
  return {
    blocks: updated.value,
    changed: updated.changed
  };
}
