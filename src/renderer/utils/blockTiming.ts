import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { formatBlockTimingBadge, getBlockTiming } from "../../shared/blockTiming";
import { generateNodeId } from "./nodeId";

const TIMED_NODE_TYPES = new Set(["paragraph", "heading", "listItem", "taskItem"]);

interface TimedNodeTarget {
  pos: number;
  node: ProseMirrorNode;
  nodeName: string;
  blockId: string;
  dueAt: number | null;
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

function clearBlockTimingDomState(container: HTMLElement) {
  container.querySelectorAll(".block-time-badge[data-generated='true']").forEach((element) => {
    element.remove();
  });
  container.querySelectorAll("[data-block-time-render-host='true']").forEach((element) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }
    delete element.dataset.blockTimeRenderHost;
    element.classList.remove("has-block-time", "has-block-time-due");
  });
}

function resolveBlockTimingHost(nodeName: string, nodeDom: HTMLElement): HTMLElement | null {
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

export const syncBlockTimingDom = (view: EditorView, now = Date.now()) => {
  const domObserver = (view as EditorView & { domObserver?: { stop: () => void; start: () => void } }).domObserver;
  domObserver?.stop();
  try {
    clearBlockTimingDomState(view.dom);

    view.state.doc.descendants((node, pos) => {
      if (!TIMED_NODE_TYPES.has(node.type.name)) {
        return true;
      }
      const display = formatBlockTimingBadge(
        {
          dueAt: parseTimestamp(node.attrs?.dueAt) ?? undefined
        },
        now
      );
      if (!display) {
        return true;
      }
      const nodeDom = view.nodeDOM(pos);
      if (!(nodeDom instanceof HTMLElement)) {
        return true;
      }
      const host = resolveBlockTimingHost(node.type.name, nodeDom);
      if (!host) {
        return true;
      }
      const badge = document.createElement("span");
      badge.className = "block-time-badge";
      badge.dataset.generated = "true";
      badge.textContent = display.text;
      host.dataset.blockTimeRenderHost = "true";
      host.classList.add("has-block-time", "has-block-time-due");
      host.insertBefore(badge, host.firstChild);
      return true;
    });
  } finally {
    domObserver?.start();
  }
};

const blockTimingPlugin = new Plugin({
  view: (view) => {
    syncBlockTimingDom(view);
    queueMicrotask(() => {
      if (view.dom.isConnected) {
        syncBlockTimingDom(view);
      }
    });
    return {
      update(updatedView) {
        syncBlockTimingDom(updatedView);
      },
      destroy() {
        clearBlockTimingDomState(view.dom);
      }
    };
  }
});

export const BlockTiming = Extension.create({
  name: "blockTiming",

  addGlobalAttributes() {
    return [
      {
        types: Array.from(TIMED_NODE_TYPES),
        attributes: {
          dueAt: {
            default: null,
            keepOnSplit: false,
            parseHTML: (element) => parseTimestamp(element.getAttribute("data-due-at")),
            renderHTML: (attributes) =>
              attributes.dueAt
                ? {
                    "data-due-at": String(attributes.dueAt)
                  }
                : {}
          }
        }
      }
    ];
  },

  addProseMirrorPlugins() {
    return [blockTimingPlugin];
  }
});

function resolveTimedNodeTarget(editor: Editor): TimedNodeTarget | null {
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
      if (!updatedNode) {
        return null;
      }
      return {
        pos,
        node: updatedNode,
        nodeName: updatedNode.type.name,
        blockId: currentId,
        dueAt: parseTimestamp(updatedNode.attrs?.dueAt)
      };
    }
  }

  const currentNode = $from.parent;
  if (!TIMED_NODE_TYPES.has(currentNode.type.name)) {
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
  if (!updatedNode) {
    return null;
  }
  return {
    pos,
    node: updatedNode,
    nodeName: updatedNode.type.name,
    blockId: currentId,
    dueAt: parseTimestamp(updatedNode.attrs?.dueAt)
  };
}

function findTimedNodeById(editor: Editor, blockId: string): TimedNodeTarget | null {
  let target: TimedNodeTarget | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (!TIMED_NODE_TYPES.has(node.type.name)) {
      return true;
    }
    if (node.attrs?.id === blockId) {
      target = {
        pos,
        node,
        nodeName: node.type.name,
        blockId,
        dueAt: parseTimestamp(node.attrs?.dueAt)
      };
      return false;
    }
    return true;
  });
  return target;
}

function applyTimedNodeAttrs(
  editor: Editor,
  target: TimedNodeTarget,
  attrs: { dueAt: number | null }
): TimedNodeTarget | null {
  const nextId = target.blockId || generateNodeId();
  const nextAttrs = { ...(target.node.attrs as Record<string, unknown>) };
  delete nextAttrs.startAt;
  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(target.pos, undefined, {
      ...nextAttrs,
      id: nextId,
      dueAt: attrs.dueAt
    })
  );
  const updatedNode = editor.state.doc.nodeAt(target.pos);
  if (!updatedNode) {
    return null;
  }
  syncBlockTimingDom(editor.view);
  return {
    pos: target.pos,
    node: updatedNode,
    nodeName: updatedNode.type.name,
    blockId: nextId,
    dueAt: parseTimestamp(updatedNode.attrs?.dueAt)
  };
}

export function getTimedNodeSelectionSnapshot(editor: Editor): TimedNodeTarget | null {
  return resolveTimedNodeTarget(editor);
}

export function setTimingOnBlockById(
  editor: Editor,
  blockId: string,
  input: { timestamp: number }
): TimedNodeTarget | null {
  const target = findTimedNodeById(editor, blockId);
  if (!target) {
    return null;
  }
  return applyTimedNodeAttrs(editor, target, {
    dueAt: Math.floor(input.timestamp)
  });
}

export function clearTimingOnBlockById(editor: Editor, blockId: string): TimedNodeTarget | null {
  const target = findTimedNodeById(editor, blockId);
  if (!target) {
    return null;
  }
  return applyTimedNodeAttrs(editor, target, {
    dueAt: null
  });
}
