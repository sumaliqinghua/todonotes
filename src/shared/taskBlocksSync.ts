import type { JsonValue, Task } from "./types";

interface JsonRecord {
  [key: string]: JsonValue;
}

interface TaskItemStats {
  checkedCount: number;
  uncheckedCount: number;
}

interface TaskLinkStats {
  checkedCount: number;
  uncheckedCount: number;
}

interface TaskLinkState {
  hasCompleted: boolean;
  isCompleted: boolean;
}

export interface CompletionChange {
  childId: string;
  isCompleted: boolean;
}

export interface SyncChildInput {
  id: string;
  title: string;
  isCompleted: boolean;
}

function isRecord(value: JsonValue): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneRecord(record: JsonRecord): JsonRecord {
  return { ...record };
}

function nodeType(node: JsonRecord): string {
  return typeof node.type === "string" ? node.type : "";
}

function normalizeTitle(title: string): string {
  return title.trim();
}

function readTaskLinkState(node: JsonRecord): { taskId: string; title: string; state: TaskLinkState } | null {
  if (nodeType(node) !== "taskLink") {
    return null;
  }
  if (!isRecord(node.attrs)) {
    return null;
  }
  const attrs = node.attrs;
  const taskId = typeof attrs.taskId === "string" ? attrs.taskId : "";
  const title = typeof attrs.title === "string" ? normalizeTitle(attrs.title) : "";
  if (!taskId && !title) {
    return null;
  }
  const hasCompleted = Object.prototype.hasOwnProperty.call(attrs, "isCompleted");
  const isCompleted = attrs.isCompleted === true;
  return {
    taskId,
    title,
    state: {
      hasCompleted,
      isCompleted
    }
  };
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

function readTaskItemLabel(node: JsonRecord): string {
  if (nodeType(node) !== "taskItem" || !Array.isArray(node.content)) {
    return "";
  }
  const paragraph = node.content.find((child) => isRecord(child) && nodeType(child) === "paragraph");
  if (!paragraph || !isRecord(paragraph)) {
    return "";
  }
  if (!Array.isArray(paragraph.content)) {
    return "";
  }
  return normalizeTitle(readInlineText(paragraph.content));
}

function replaceTaskItemLabel(node: JsonRecord, nextTitle: string): { node: JsonRecord; changed: boolean } {
  if (!Array.isArray(node.content)) {
    return { node, changed: false };
  }
  const paragraphIndex = node.content.findIndex((child) => isRecord(child) && nodeType(child) === "paragraph");
  if (paragraphIndex < 0) {
    return { node, changed: false };
  }
  const paragraph = node.content[paragraphIndex];
  if (!isRecord(paragraph)) {
    return { node, changed: false };
  }
  const currentText = readTaskItemLabel(node);
  if (currentText === nextTitle) {
    return { node, changed: false };
  }
  const nextParagraph: JsonRecord = {
    ...paragraph,
    content: [{ type: "text", text: nextTitle }]
  };
  const nextContent = node.content.slice();
  nextContent[paragraphIndex] = nextParagraph;
  return {
    node: {
      ...node,
      content: nextContent
    },
    changed: true
  };
}

function collectTaskLinkStates(blocks: JsonValue): Map<string, TaskLinkState> {
  const map = new Map<string, TaskLinkState>();
  const visit = (value: JsonValue) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) {
      return;
    }
    const link = readTaskLinkState(value);
    if (link) {
      map.set(link.taskId, link.state);
    }
    if (Array.isArray(value.content)) {
      value.content.forEach(visit);
    }
  };
  visit(blocks);
  return map;
}

function collectTaskLinkStatsByTitle(blocks: JsonValue): Map<string, TaskLinkStats> {
  const map = new Map<string, TaskLinkStats>();
  const visit = (value: JsonValue) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) {
      return;
    }
    const link = readTaskLinkState(value);
    if (link) {
      const title = link.title;
      if (title) {
        const current = map.get(title) ?? { checkedCount: 0, uncheckedCount: 0 };
        if (link.state.isCompleted) {
          current.checkedCount += 1;
        } else {
          current.uncheckedCount += 1;
        }
        map.set(title, current);
      }
    }
    if (Array.isArray(value.content)) {
      value.content.forEach(visit);
    }
  };
  visit(blocks);
  return map;
}

function collectTaskItemStats(blocks: JsonValue): Map<string, TaskItemStats> {
  const map = new Map<string, TaskItemStats>();
  const visit = (value: JsonValue) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) {
      return;
    }
    if (nodeType(value) === "taskItem") {
      const label = readTaskItemLabel(value);
      if (label) {
        const checked = isRecord(value.attrs) ? value.attrs.checked === true : false;
        const current = map.get(label) ?? { checkedCount: 0, uncheckedCount: 0 };
        if (checked) {
          current.checkedCount += 1;
        } else {
          current.uncheckedCount += 1;
        }
        map.set(label, current);
      }
    }
    if (Array.isArray(value.content)) {
      value.content.forEach(visit);
    }
  };
  visit(blocks);
  return map;
}

function resolveTaskItemNextCompleted(stats: TaskItemStats): boolean | null {
  if (stats.checkedCount > 0 && stats.uncheckedCount === 0) {
    return true;
  }
  if (stats.uncheckedCount > 0 && stats.checkedCount === 0) {
    return false;
  }
  return null;
}

function createUniqueTitleMap(children: Pick<Task, "id" | "title">[]): Map<string, string> {
  const titleMap = new Map<string, string>();
  const duplicated = new Set<string>();
  children.forEach((child) => {
    const normalized = normalizeTitle(child.title);
    if (!normalized) {
      return;
    }
    if (titleMap.has(normalized)) {
      duplicated.add(normalized);
      titleMap.delete(normalized);
      return;
    }
    if (!duplicated.has(normalized)) {
      titleMap.set(normalized, child.id);
    }
  });
  return titleMap;
}

export function normalizeTaskTitle(title: string): string {
  return normalizeTitle(title);
}

export function deriveChildCompletionChangesFromBlocksDiff(
  previousBlocks: JsonValue,
  nextBlocks: JsonValue,
  children: Array<Pick<Task, "id" | "title" | "isCompleted">>
): CompletionChange[] {
  const desired = new Map<string, boolean>();
  const childById = new Map(children.map((child) => [child.id, child]));

  const beforeLinks = collectTaskLinkStates(previousBlocks);
  const afterLinks = collectTaskLinkStates(nextBlocks);
  children.forEach((child) => {
    const before = beforeLinks.get(child.id);
    const after = afterLinks.get(child.id);
    if (!before || !after) {
      return;
    }
    if (!before.hasCompleted || !after.hasCompleted) {
      return;
    }
    if (before.isCompleted !== after.isCompleted) {
      desired.set(child.id, after.isCompleted);
    }
  });

  const titleToChildId = createUniqueTitleMap(children);
  const beforeLinkStats = collectTaskLinkStatsByTitle(previousBlocks);
  const afterLinkStats = collectTaskLinkStatsByTitle(nextBlocks);
  titleToChildId.forEach((childId, normalizedTitle) => {
    if (desired.has(childId) || childById.get(childId)?.isCompleted === undefined) {
      return;
    }
    const before = beforeLinkStats.get(normalizedTitle);
    const after = afterLinkStats.get(normalizedTitle);
    if (!before || !after) {
      return;
    }
    if (before.checkedCount === after.checkedCount && before.uncheckedCount === after.uncheckedCount) {
      return;
    }
    const nextCompleted = resolveTaskItemNextCompleted(after);
    if (nextCompleted === null) {
      return;
    }
    desired.set(childId, nextCompleted);
  });

  const beforeTaskItems = collectTaskItemStats(previousBlocks);
  const afterTaskItems = collectTaskItemStats(nextBlocks);
  titleToChildId.forEach((childId, normalizedTitle) => {
    if (desired.has(childId)) {
      return;
    }
    const before = beforeTaskItems.get(normalizedTitle);
    const after = afterTaskItems.get(normalizedTitle);
    if (!before || !after) {
      return;
    }
    if (before.checkedCount === after.checkedCount && before.uncheckedCount === after.uncheckedCount) {
      return;
    }
    const nextCompleted = resolveTaskItemNextCompleted(after);
    if (nextCompleted === null) {
      return;
    }
    desired.set(childId, nextCompleted);
  });

  return Array.from(desired.entries()).map(([childId, isCompleted]) => ({ childId, isCompleted }));
}

export function syncChildStateInBlocks(
  blocks: JsonValue,
  child: SyncChildInput,
  previousTitle?: string
): { blocks: JsonValue; changed: boolean } {
  const normalizedCurrentTitle = normalizeTitle(child.title);
  const normalizedPreviousTitle = previousTitle ? normalizeTitle(previousTitle) : "";

  const visit = (value: JsonValue): { value: JsonValue; changed: boolean } => {
    if (Array.isArray(value)) {
      let changed = false;
      const nextArray = value.map((item) => {
        const next = visit(item);
        if (next.changed) {
          changed = true;
        }
        return next.value;
      });
      return changed ? { value: nextArray, changed: true } : { value, changed: false };
    }

    if (!isRecord(value)) {
      return { value, changed: false };
    }

    let current: JsonRecord = value;
    let changed = false;

    if (nodeType(current) === "taskLink" && isRecord(current.attrs)) {
      const taskId = typeof current.attrs.taskId === "string" ? current.attrs.taskId : "";
      if (taskId === child.id) {
        const nextAttrs: JsonRecord = {
          ...current.attrs,
          title: child.title,
          isCompleted: child.isCompleted
        };
        const attrsChanged =
          nextAttrs.title !== current.attrs.title ||
          nextAttrs.isCompleted !== current.attrs.isCompleted ||
          !Object.prototype.hasOwnProperty.call(current.attrs, "isCompleted") ||
          !Object.prototype.hasOwnProperty.call(current.attrs, "title");
        if (attrsChanged) {
          current = {
            ...current,
            attrs: nextAttrs
          };
          changed = true;
        }
      }
    }

    if (nodeType(current) === "taskItem") {
      let nextNode = current;

      if (normalizedPreviousTitle && normalizedPreviousTitle !== normalizedCurrentTitle) {
        const currentLabel = readTaskItemLabel(nextNode);
        if (currentLabel && normalizeTitle(currentLabel) === normalizedPreviousTitle) {
          const renamed = replaceTaskItemLabel(nextNode, child.title);
          if (renamed.changed) {
            nextNode = renamed.node;
            changed = true;
          }
        }
      }

      const updatedLabel = readTaskItemLabel(nextNode);
      if (updatedLabel && normalizeTitle(updatedLabel) === normalizedCurrentTitle) {
        const attrs = isRecord(nextNode.attrs) ? cloneRecord(nextNode.attrs) : {};
        const checked = attrs.checked === true;
        if (checked !== child.isCompleted) {
          attrs.checked = child.isCompleted;
          nextNode = {
            ...nextNode,
            attrs
          };
          changed = true;
        }
      }

      current = nextNode;
    }

    if (Array.isArray(current.content)) {
      const nextContent = current.content.map((item) => visit(item));
      if (nextContent.some((item) => item.changed)) {
        current = {
          ...current,
          content: nextContent.map((item) => item.value)
        };
        changed = true;
      }
    }

    return changed ? { value: current, changed: true } : { value, changed: false };
  };

  const result = visit(blocks);
  return {
    blocks: result.value,
    changed: result.changed
  };
}
