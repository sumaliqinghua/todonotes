import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { WorkStatus } from "../../shared/types";
import { formatStatusBadge, parsePositiveInteger, parseTimestamp, parseWorkStatus } from "../../shared/blockStatus";
import { generateNodeId } from "./nodeId";

const STATUS_NODE_TYPES = new Set(["paragraph", "heading", "listItem", "taskItem"]);
const STATUS_ATTR_KEYS = ["workStatus", "workStatusUpdatedAt", "plannedStartAt", "plannedDurationMinutes", "waitReason", "waitReviewAt"] as const;

interface StatusNodeTarget {
  pos: number;
  node: ProseMirrorNode;
  nodeName: string;
  blockId: string;
  workStatus: WorkStatus | null;
  workStatusUpdatedAt: number | null;
  plannedStartAt: number | null;
  plannedDurationMinutes: number | null;
  waitReason: string;
  waitReviewAt: number | null;
}

export interface StatusNodeAttrs {
  workStatus: WorkStatus | null;
  plannedStartAt?: number | null;
  plannedDurationMinutes?: number | null;
  waitReason?: string | null;
  waitReviewAt?: number | null;
}

function readStatusTarget(node: ProseMirrorNode, pos: number, blockId: string): StatusNodeTarget {
  return {
    pos,
    node,
    nodeName: node.type.name,
    blockId,
    workStatus: parseWorkStatus(node.attrs?.workStatus),
    workStatusUpdatedAt: parseTimestamp(node.attrs?.workStatusUpdatedAt),
    plannedStartAt: parseTimestamp(node.attrs?.plannedStartAt),
    plannedDurationMinutes: parsePositiveInteger(node.attrs?.plannedDurationMinutes),
    waitReason: typeof node.attrs?.waitReason === "string" ? node.attrs.waitReason : "",
    waitReviewAt: parseTimestamp(node.attrs?.waitReviewAt)
  };
}

function hasWorkStatusAttrs(node: ProseMirrorNode): boolean {
  return parseWorkStatus(node.attrs?.workStatus) !== null;
}

function clearStatusAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const nextAttrs = { ...attrs };
  STATUS_ATTR_KEYS.forEach((key) => {
    nextAttrs[key] = null;
  });
  return nextAttrs;
}

function clearStatusDescendants(tr: ReturnType<Editor["state"]["tr"]["setNodeMarkup"]>, target: StatusNodeTarget) {
  target.node.descendants((child, offset) => {
    if (!STATUS_NODE_TYPES.has(child.type.name) || !hasWorkStatusAttrs(child)) {
      return true;
    }
    const childPos = target.pos + 1 + offset;
    tr.setNodeMarkup(childPos, undefined, clearStatusAttrs(child.attrs as Record<string, unknown>));
    return true;
  });
}

function clearStatusAncestors(editor: Editor, tr: ReturnType<Editor["state"]["tr"]["setNodeMarkup"]>, target: StatusNodeTarget) {
  const $pos = editor.state.doc.resolve(target.pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const ancestor = $pos.node(depth);
    if (!STATUS_NODE_TYPES.has(ancestor.type.name) || !hasWorkStatusAttrs(ancestor)) {
      continue;
    }
    const ancestorPos = $pos.before(depth);
    if (ancestorPos === target.pos) {
      continue;
    }
    tr.setNodeMarkup(ancestorPos, undefined, clearStatusAttrs(ancestor.attrs as Record<string, unknown>));
  }
}

function clearBlockStatusDomState(container: HTMLElement) {
  container.querySelectorAll("[data-block-status-render-host='true']").forEach((element) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }
    delete element.dataset.blockStatusBadge;
    delete element.dataset.blockStatusRenderHost;
    element.classList.remove(
      "has-block-status",
      "has-work-status-todo",
      "has-work-status-doing",
      "has-work-status-waiting",
      "has-work-status-done"
    );
  });
}

function resolveBlockStatusHost(nodeName: string, nodeDom: HTMLElement): HTMLElement | null {
  if (nodeName === "taskItem") {
    return (
      nodeDom.querySelector(":scope > div > p") as HTMLElement | null
    ) ?? (
      nodeDom.querySelector(":scope > div") as HTMLElement | null
    ) ?? nodeDom;
  }
  if (nodeName === "listItem") {
    return (
      nodeDom.querySelector(":scope > p") as HTMLElement | null
    ) ?? nodeDom;
  }
  return nodeDom;
}

export const syncBlockStatusDom = (view: EditorView, now = Date.now()) => {
  const domObserver = (view as EditorView & { domObserver?: { stop: () => void; start: () => void } }).domObserver;
  domObserver?.stop();
  try {
    clearBlockStatusDomState(view.dom);

    view.state.doc.descendants((node, pos) => {
      if (!STATUS_NODE_TYPES.has(node.type.name)) {
        return true;
      }
      const workStatus = parseWorkStatus(node.attrs?.workStatus);
      if (!workStatus) {
        return true;
      }
      const nodeDom = view.nodeDOM(pos);
      if (!(nodeDom instanceof HTMLElement)) {
        return true;
      }
      const host = resolveBlockStatusHost(node.type.name, nodeDom);
      if (!host) {
        return true;
      }
      const badgeText = formatStatusBadge(
        {
          workStatus,
          workStatusUpdatedAt: parseTimestamp(node.attrs?.workStatusUpdatedAt) ?? undefined,
          plannedStartAt: parseTimestamp(node.attrs?.plannedStartAt) ?? undefined,
          plannedDurationMinutes: parsePositiveInteger(node.attrs?.plannedDurationMinutes) ?? undefined,
          waitReason: typeof node.attrs?.waitReason === "string" ? node.attrs.waitReason : undefined,
          waitReviewAt: parseTimestamp(node.attrs?.waitReviewAt) ?? undefined
        },
        now
      );
      host.dataset.blockStatusBadge = badgeText;
      host.dataset.blockStatusRenderHost = "true";
      host.classList.add("has-block-status", `has-work-status-${workStatus}`);
      return true;
    });
  } finally {
    domObserver?.start();
  }
};

const blockStatusPlugin = new Plugin({
  view: (view) => {
    syncBlockStatusDom(view);
    queueMicrotask(() => {
      if (view.dom.isConnected) {
        syncBlockStatusDom(view);
      }
    });
    return {
      update(updatedView) {
        syncBlockStatusDom(updatedView);
      },
      destroy() {
        clearBlockStatusDomState(view.dom);
      }
    };
  }
});

export const BlockStatus = Extension.create({
  name: "blockStatus",

  addGlobalAttributes() {
    return [
      {
        types: Array.from(STATUS_NODE_TYPES),
        attributes: {
          workStatus: {
            default: null,
            keepOnSplit: false,
            parseHTML: (element) => parseWorkStatus(element.getAttribute("data-work-status")),
            renderHTML: (attributes) =>
              attributes.workStatus ? { "data-work-status": attributes.workStatus } : {}
          },
          workStatusUpdatedAt: {
            default: null,
            keepOnSplit: false,
            parseHTML: (element) => parseTimestamp(element.getAttribute("data-work-status-updated-at")),
            renderHTML: (attributes) =>
              attributes.workStatusUpdatedAt ? { "data-work-status-updated-at": String(attributes.workStatusUpdatedAt) } : {}
          },
          plannedStartAt: {
            default: null,
            keepOnSplit: false,
            parseHTML: (element) => parseTimestamp(element.getAttribute("data-planned-start-at")),
            renderHTML: (attributes) =>
              attributes.plannedStartAt ? { "data-planned-start-at": String(attributes.plannedStartAt) } : {}
          },
          plannedDurationMinutes: {
            default: null,
            keepOnSplit: false,
            parseHTML: (element) => parsePositiveInteger(element.getAttribute("data-planned-duration-minutes")),
            renderHTML: (attributes) =>
              attributes.plannedDurationMinutes ? { "data-planned-duration-minutes": String(attributes.plannedDurationMinutes) } : {}
          },
          waitReason: {
            default: null,
            keepOnSplit: false,
            parseHTML: (element) => element.getAttribute("data-wait-reason"),
            renderHTML: (attributes) =>
              attributes.waitReason ? { "data-wait-reason": String(attributes.waitReason) } : {}
          },
          waitReviewAt: {
            default: null,
            keepOnSplit: false,
            parseHTML: (element) => parseTimestamp(element.getAttribute("data-wait-review-at")),
            renderHTML: (attributes) =>
              attributes.waitReviewAt ? { "data-wait-review-at": String(attributes.waitReviewAt) } : {}
          }
        }
      }
    ];
  },

  addProseMirrorPlugins() {
    return [blockStatusPlugin];
  }
});

function resolveStatusNodeTarget(editor: Editor): StatusNodeTarget | null {
  const { $from } = editor.state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const ancestor = $from.node(depth);
    if (ancestor.type.name === "taskItem" || ancestor.type.name === "listItem") {
      const pos = $from.before(depth);
      const currentId = typeof ancestor.attrs?.id === "string" && ancestor.attrs.id ? ancestor.attrs.id : generateNodeId();
      if (currentId !== ancestor.attrs?.id) {
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(pos, undefined, {
            ...ancestor.attrs,
            id: currentId
          })
        );
      }
      const updatedNode = editor.state.doc.nodeAt(pos);
      return updatedNode ? readStatusTarget(updatedNode, pos, currentId) : null;
    }
  }

  const currentNode = $from.parent;
  if (!STATUS_NODE_TYPES.has(currentNode.type.name)) {
    return null;
  }
  const pos = $from.before($from.depth);
  const currentId = typeof currentNode.attrs?.id === "string" && currentNode.attrs.id ? currentNode.attrs.id : generateNodeId();
  if (currentId !== currentNode.attrs?.id) {
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(pos, undefined, {
        ...currentNode.attrs,
        id: currentId
      })
    );
  }
  const updatedNode = editor.state.doc.nodeAt(pos);
  return updatedNode ? readStatusTarget(updatedNode, pos, currentId) : null;
}

function findStatusNodeById(editor: Editor, blockId: string): StatusNodeTarget | null {
  let target: StatusNodeTarget | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (!STATUS_NODE_TYPES.has(node.type.name)) {
      return true;
    }
    if (node.attrs?.id === blockId) {
      target = readStatusTarget(node, pos, blockId);
      return false;
    }
    return true;
  });
  return target;
}

function applyStatusNodeAttrs(
  editor: Editor,
  target: StatusNodeTarget,
  attrs: StatusNodeAttrs
): StatusNodeTarget | null {
  const nextId = target.blockId || generateNodeId();
  const nextAttrs = { ...(target.node.attrs as Record<string, unknown>) };
  delete nextAttrs.startAt;
  delete nextAttrs.dueAt;

  const now = Date.now();
  if (attrs.workStatus === null) {
    nextAttrs.workStatus = null;
    nextAttrs.workStatusUpdatedAt = null;
    nextAttrs.plannedStartAt = null;
    nextAttrs.plannedDurationMinutes = null;
    nextAttrs.waitReason = null;
    nextAttrs.waitReviewAt = null;
  } else {
    nextAttrs.workStatus = attrs.workStatus;
    nextAttrs.workStatusUpdatedAt = now;
    nextAttrs.plannedStartAt = attrs.workStatus === "todo" ? attrs.plannedStartAt ?? null : null;
    nextAttrs.plannedDurationMinutes =
      attrs.workStatus === "todo" || attrs.workStatus === "doing" || attrs.workStatus === "waiting"
        ? attrs.plannedDurationMinutes ?? null
        : null;
    nextAttrs.waitReason = attrs.workStatus === "waiting" ? attrs.waitReason ?? "" : null;
    nextAttrs.waitReviewAt = attrs.workStatus === "waiting" ? attrs.waitReviewAt ?? null : null;
  }

  const tr = editor.state.tr;
  clearStatusAncestors(editor, tr, target);
  clearStatusDescendants(tr, target);
  tr.setNodeMarkup(target.pos, undefined, {
      ...nextAttrs,
      id: nextId
    });

  editor.view.dispatch(tr);
  const updatedNode = editor.view.state.doc.nodeAt(target.pos);
  if (!updatedNode) {
    return null;
  }
  syncBlockStatusDom(editor.view);
  return readStatusTarget(updatedNode, target.pos, nextId);
}

export function getStatusNodeSelectionSnapshot(editor: Editor): StatusNodeTarget | null {
  return resolveStatusNodeTarget(editor);
}

export function setStatusOnBlockById(
  editor: Editor,
  blockId: string,
  attrs: StatusNodeAttrs
): StatusNodeTarget | null {
  const target = findStatusNodeById(editor, blockId);
  if (!target) {
    return null;
  }
  return applyStatusNodeAttrs(editor, target, attrs);
}

export function clearStatusOnBlockById(editor: Editor, blockId: string): StatusNodeTarget | null {
  return setStatusOnBlockById(editor, blockId, { workStatus: null });
}
