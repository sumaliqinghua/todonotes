import type { JsonValue, StatusBlock, WorkStatus } from "./types";

const STATUS_BLOCK_TYPES = new Set(["paragraph", "heading", "listItem", "taskItem"]);
const WORK_STATUS_VALUES = new Set<WorkStatus>(["todo", "doing", "waiting", "done"]);
const STATUS_ATTR_KEYS = ["workStatus", "workStatusUpdatedAt", "plannedStartAt", "plannedDurationMinutes", "waitReason", "waitReviewAt"] as const;

interface JsonRecord {
  [key: string]: JsonValue;
}

export interface BlockStatusAttrs {
  workStatus: WorkStatus | null;
  workStatusUpdatedAt: number | null;
  plannedStartAt: number | null;
  plannedDurationMinutes: number | null;
  waitReason: string;
  waitReviewAt: number | null;
}

function clearStatusAttrs(attrs: JsonRecord): JsonRecord {
  const nextAttrs = { ...attrs };
  STATUS_ATTR_KEYS.forEach((key) => {
    nextAttrs[key] = null;
  });
  return nextAttrs;
}

function isRecord(value: JsonValue): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nodeType(node: JsonRecord): string {
  return typeof node.type === "string" ? node.type : "";
}

export function isStatusBlockType(type: string): boolean {
  return STATUS_BLOCK_TYPES.has(type);
}

export function parseWorkStatus(value: unknown): WorkStatus | null {
  return typeof value === "string" && WORK_STATUS_VALUES.has(value as WorkStatus) ? (value as WorkStatus) : null;
}

export function parseTimestamp(value: unknown): number | null {
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

export function parsePositiveInteger(value: unknown): number | null {
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

export function getBlockStatusAttrs(node: JsonValue): BlockStatusAttrs | null {
  if (!isRecord(node) || !isRecord(node.attrs)) {
    return null;
  }
  const workStatus = parseWorkStatus(node.attrs.workStatus);
  if (!workStatus) {
    return null;
  }
  return {
    workStatus,
    workStatusUpdatedAt: parseTimestamp(node.attrs.workStatusUpdatedAt),
    plannedStartAt: parseTimestamp(node.attrs.plannedStartAt),
    plannedDurationMinutes: parsePositiveInteger(node.attrs.plannedDurationMinutes),
    waitReason: typeof node.attrs.waitReason === "string" ? node.attrs.waitReason.trim() : "",
    waitReviewAt: parseTimestamp(node.attrs.waitReviewAt)
  };
}

export function getPlannedEndAt(value: Pick<StatusBlock, "plannedStartAt" | "plannedDurationMinutes">): number | null {
  const plannedStartAt = parseTimestamp(value.plannedStartAt);
  const plannedDurationMinutes = parsePositiveInteger(value.plannedDurationMinutes);
  if (plannedStartAt === null || plannedDurationMinutes === null) {
    return null;
  }
  return plannedStartAt + plannedDurationMinutes * 60 * 1000;
}

export function formatClockTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function formatMinutesDuration(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  if (hours > 0 && minutes > 0) {
    return `${hours}h${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

export function computeRemainingStatusDurationMinutes(
  value: {
    workStatus?: WorkStatus | null;
    workStatusUpdatedAt?: number | null;
    plannedDurationMinutes?: number | null;
  },
  now = Date.now()
): number | null {
  const plannedDurationMinutes = parsePositiveInteger(value.plannedDurationMinutes);
  if (plannedDurationMinutes === null) {
    return null;
  }
  if (value.workStatus !== "doing") {
    return plannedDurationMinutes;
  }
  const startedAt = parseTimestamp(value.workStatusUpdatedAt);
  if (startedAt === null) {
    return plannedDurationMinutes;
  }
  const elapsedMinutes = Math.floor((now - startedAt) / 60000);
  return Math.max(1, plannedDurationMinutes - Math.max(0, elapsedMinutes));
}

export function formatStatusOverrun(value: Pick<StatusBlock, "plannedStartAt" | "plannedDurationMinutes">, now = Date.now()): string | null {
  const plannedEndAt = getPlannedEndAt(value);
  if (plannedEndAt === null || plannedEndAt >= now) {
    return null;
  }
  const overrunMinutes = Math.max(1, Math.floor((now - plannedEndAt) / 60000));
  return `超计划${formatMinutesDuration(overrunMinutes)}`;
}

function formatTodoBadge(value: Pick<StatusBlock, "plannedStartAt" | "plannedDurationMinutes">, now: number): string {
  const plannedStartAt = parseTimestamp(value.plannedStartAt);
  const plannedDurationMinutes = parsePositiveInteger(value.plannedDurationMinutes);
  const durationText = plannedDurationMinutes !== null ? formatMinutesDuration(plannedDurationMinutes) : "";
  if (plannedStartAt !== null && plannedStartAt <= now) {
    return ["待开始", `逾期:${formatClockTime(plannedStartAt)}`, durationText].filter(Boolean).join(".");
  }
  return ["待开始", plannedStartAt !== null ? formatClockTime(plannedStartAt) : "", durationText].filter(Boolean).join(".");
}

function formatDoingBadge(value: Pick<StatusBlock, "workStatusUpdatedAt" | "plannedDurationMinutes" | "waitReason">, now: number): string {
  const reason = typeof value.waitReason === "string" ? value.waitReason.trim() : "";
  const startedAt = parseTimestamp(value.workStatusUpdatedAt);
  if (reason === "AI已返回结果") {
    const elapsedMinutes = startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 60000));
    return `进行中.${reason}:${formatMinutesDuration(elapsedMinutes)}`;
  }
  const plannedDurationMinutes = parsePositiveInteger(value.plannedDurationMinutes);
  if (startedAt === null || plannedDurationMinutes === null) {
    return "进行中";
  }
  const plannedEndAt = startedAt + plannedDurationMinutes * 60 * 1000;
  if (plannedEndAt <= now) {
    const overtimeMinutes = Math.max(1, Math.floor((now - plannedEndAt) / 60000));
    return `进行中.超时:${formatMinutesDuration(overtimeMinutes)}`;
  }
  const remainingMinutes = Math.max(1, Math.ceil((plannedEndAt - now) / 60000));
  return `进行中.${formatMinutesDuration(plannedDurationMinutes)}.剩余:${formatMinutesDuration(remainingMinutes)}`;
}

export function formatStatusBadge(
  value: Pick<StatusBlock, "workStatus" | "workStatusUpdatedAt" | "plannedStartAt" | "plannedDurationMinutes" | "waitReason" | "waitReviewAt">,
  now = Date.now()
): string {
  if (value.workStatus === "doing") {
    return formatDoingBadge(value, now);
  }
  if (value.workStatus === "waiting") {
    const reason = typeof value.waitReason === "string" && value.waitReason.trim() ? value.waitReason.trim() : "未填写原因";
    const reviewAt = parseTimestamp(value.waitReviewAt);
    return reviewAt ? `等待: ${reason} · ${formatClockTime(reviewAt)}回看` : `等待: ${reason}`;
  }
  if (value.workStatus === "done") {
    return "已完成";
  }
  return formatTodoBadge(value, now);
}

export function compareStatusBlocks(left: StatusBlock, right: StatusBlock, now = Date.now()): number {
  if (left.workStatus === "doing" && right.workStatus === "doing") {
    return (right.workStatusUpdatedAt ?? 0) - (left.workStatusUpdatedAt ?? 0);
  }
  if (left.workStatus === "waiting" && right.workStatus === "waiting") {
    const leftReviewAt = parseTimestamp(left.waitReviewAt);
    const rightReviewAt = parseTimestamp(right.waitReviewAt);
    const rank = (timestamp: number | null) => {
      if (timestamp === null) {
        return 2;
      }
      return timestamp <= now ? 0 : 1;
    };
    const leftRank = rank(leftReviewAt);
    const rightRank = rank(rightReviewAt);
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    if (leftReviewAt !== null && rightReviewAt !== null) {
      return leftRank === 0 ? rightReviewAt - leftReviewAt : leftReviewAt - rightReviewAt;
    }
    return (right.workStatusUpdatedAt ?? 0) - (left.workStatusUpdatedAt ?? 0);
  }
  if (left.workStatus === "todo" && right.workStatus === "todo") {
    const leftStartAt = parseTimestamp(left.plannedStartAt) ?? Number.MAX_SAFE_INTEGER;
    const rightStartAt = parseTimestamp(right.plannedStartAt) ?? Number.MAX_SAFE_INTEGER;
    const leftOverdue = leftStartAt <= now;
    const rightOverdue = rightStartAt <= now;
    if (leftOverdue !== rightOverdue) {
      return leftOverdue ? -1 : 1;
    }
    if (leftStartAt !== rightStartAt) {
      return leftStartAt - rightStartAt;
    }
    return (right.workStatusUpdatedAt ?? 0) - (left.workStatusUpdatedAt ?? 0);
  }
  return 0;
}

export function collectStatusBlocksFromTask(task: { id: string; title: string; blocks: JsonValue }): StatusBlock[] {
  const results: StatusBlock[] = [];

  const visit = (value: JsonValue) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) {
      return;
    }
    const type = nodeType(value);
    const statusAttrs = getBlockStatusAttrs(value);
    const workStatus = statusAttrs?.workStatus ?? null;
    if (statusAttrs && (workStatus === "todo" || workStatus === "doing" || workStatus === "waiting") && isStatusBlockType(type)) {
      const attrs = isRecord(value.attrs) ? value.attrs : null;
      const blockId = typeof attrs?.id === "string" ? attrs.id : "";
      if (blockId) {
        results.push({
          taskId: task.id,
          taskTitle: task.title,
          blockId,
          blockType: type,
          blockContent: normalizePreview(readNodeText(value)),
          workStatus,
          ...(statusAttrs.workStatusUpdatedAt !== null ? { workStatusUpdatedAt: statusAttrs.workStatusUpdatedAt } : {}),
          ...(statusAttrs.plannedStartAt !== null ? { plannedStartAt: statusAttrs.plannedStartAt } : {}),
          ...(statusAttrs.plannedDurationMinutes !== null ? { plannedDurationMinutes: statusAttrs.plannedDurationMinutes } : {}),
          ...(statusAttrs.waitReason ? { waitReason: statusAttrs.waitReason } : {}),
          ...(statusAttrs.waitReviewAt !== null ? { waitReviewAt: statusAttrs.waitReviewAt } : {})
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

export function updateBlockStatusInBlocks(
  blocks: JsonValue,
  blockId: string,
  next: Partial<BlockStatusAttrs>
): { blocks: JsonValue; changed: boolean } {
  const visit = (value: JsonValue, isInsideMatchedBlock = false): { value: JsonValue; changed: boolean; matchedTarget: boolean } => {
    if (Array.isArray(value)) {
      let changed = false;
      let matchedTarget = false;
      const nextArray = value.map((item) => {
        const updated = visit(item, isInsideMatchedBlock);
        if (updated.changed) {
          changed = true;
        }
        if (updated.matchedTarget) {
          matchedTarget = true;
        }
        return updated.value;
      });
      return changed ? { value: nextArray, changed: true, matchedTarget } : { value, changed: false, matchedTarget };
    }
    if (!isRecord(value)) {
      return { value, changed: false, matchedTarget: false };
    }

    let changed = false;
    let nextRecord: JsonRecord = value;

    const isMatchedStatusBlock = isRecord(value.attrs) && value.attrs.id === blockId && isStatusBlockType(nodeType(value));

    if (isMatchedStatusBlock) {
      const currentAttrs = isRecord(value.attrs) ? value.attrs : {};
      const nextAttrs = { ...currentAttrs } as Record<string, JsonValue>;
      delete nextAttrs.startAt;
      delete nextAttrs.dueAt;

      const applyAttr = (key: keyof BlockStatusAttrs, attrValue: unknown) => {
        const normalized = attrValue === undefined ? nextAttrs[key] : attrValue;
        if (normalized === undefined || normalized === null || normalized === "") {
          if (nextAttrs[key] !== null) {
            nextAttrs[key] = null;
          }
          return;
        }
        nextAttrs[key] = normalized as JsonValue;
      };

      STATUS_ATTR_KEYS.forEach((key) => {
        if (key in next) {
          applyAttr(key, next[key]);
        }
      });

      nextRecord = {
        ...nextRecord,
        attrs: nextAttrs
      };
      changed = true;
    }

    if (Array.isArray(value.content)) {
      let contentChanged = false;
      let contentMatchedTarget = false;
      const nextContent = value.content.map((item) => {
        const updated = visit(item, isInsideMatchedBlock || isMatchedStatusBlock);
        if (updated.matchedTarget) {
          contentMatchedTarget = true;
        }
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
      if (contentMatchedTarget && !isMatchedStatusBlock && isStatusBlockType(nodeType(value)) && isRecord(nextRecord.attrs) && getBlockStatusAttrs(nextRecord)) {
        nextRecord = {
          ...nextRecord,
          attrs: clearStatusAttrs(nextRecord.attrs)
        };
        changed = true;
      }
    }

    if (isInsideMatchedBlock && !isMatchedStatusBlock && isStatusBlockType(nodeType(value)) && isRecord(nextRecord.attrs) && getBlockStatusAttrs(nextRecord)) {
      nextRecord = {
        ...nextRecord,
        attrs: clearStatusAttrs(nextRecord.attrs)
      };
      changed = true;
    }

    return changed ? { value: nextRecord, changed: true, matchedTarget: isMatchedStatusBlock } : { value, changed: false, matchedTarget: isMatchedStatusBlock };
  };

  const updated = visit(blocks);
  return {
    blocks: updated.value,
    changed: updated.changed
  };
}
