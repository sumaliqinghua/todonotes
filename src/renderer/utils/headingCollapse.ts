import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

type HeadingCollapseMeta = {
  type: "toggle";
  headingKey: string;
};

export interface HeadingSection {
  headingKey: string;
  headingId: string;
  headingLevel: number;
  headingPos: number;
  contentPositions: number[];
}

export const headingCollapseKey = new PluginKey<Set<string>>("headingCollapse");

export const getHeadingToggleLabel = (collapsed: boolean) => (collapsed ? "▸" : "▾");

const isHeadingNode = (node: ProseMirrorNode) => node.type.name === "heading";

const getHeadingLevel = (node: ProseMirrorNode) => {
  const parsed = Number(node.attrs?.level);
  return Number.isNaN(parsed) ? 1 : parsed;
};

const getHeadingId = (node: ProseMirrorNode) => {
  const headingId = node.attrs?.id;
  return typeof headingId === "string" && headingId.length > 0 ? headingId : null;
};

export const collectHeadingSections = (doc: ProseMirrorNode): HeadingSection[] => {
  const topLevelNodes: Array<{ node: ProseMirrorNode; pos: number }> = [];
  doc.descendants((node, pos, parent) => {
    if (parent?.type.name === "doc") {
      topLevelNodes.push({ node, pos });
    }
    return parent?.type.name !== "doc";
  });

  const sections: HeadingSection[] = [];
  const headingIdCounts = new Map<string, number>();

  for (let index = 0; index < topLevelNodes.length; index += 1) {
    const currentNode = topLevelNodes[index];
    if (!isHeadingNode(currentNode.node)) {
      continue;
    }

    const headingId = getHeadingId(currentNode.node);
    if (!headingId) {
      continue;
    }
    const duplicateIndex = headingIdCounts.get(headingId) ?? 0;
    headingIdCounts.set(headingId, duplicateIndex + 1);
    const headingKey = duplicateIndex === 0 ? headingId : `${headingId}#${duplicateIndex}`;

    const currentLevel = getHeadingLevel(currentNode.node);
    const contentPositions: number[] = [];

    for (let nextIndex = index + 1; nextIndex < topLevelNodes.length; nextIndex += 1) {
      const nextNode = topLevelNodes[nextIndex];
      if (isHeadingNode(nextNode.node) && getHeadingLevel(nextNode.node) <= currentLevel) {
        break;
      }
      contentPositions.push(nextNode.pos);
    }

    if (contentPositions.length === 0) {
      continue;
    }

    sections.push({
      headingKey,
      headingId,
      headingLevel: currentLevel,
      headingPos: currentNode.pos,
      contentPositions
    });
  }

  return sections;
};

const buildCollapsedHeadingIds = (
  doc: ProseMirrorNode,
  previousIds: Set<string>,
  meta?: HeadingCollapseMeta
) => {
  const sections = collectHeadingSections(doc);
  const validHeadingIds = new Set(sections.map((section) => section.headingKey));
  const nextIds = new Set(Array.from(previousIds).filter((headingId) => validHeadingIds.has(headingId)));

  if (meta?.type === "toggle" && validHeadingIds.has(meta.headingKey)) {
    if (nextIds.has(meta.headingKey)) {
      nextIds.delete(meta.headingKey);
    } else {
      nextIds.add(meta.headingKey);
    }
  }

  return nextIds;
};

export const toggleHeadingCollapsed = (state: EditorState, headingKey: string): Transaction =>
  state.tr.setMeta(headingCollapseKey, {
    type: "toggle",
    headingKey
  } satisfies HeadingCollapseMeta);

const clearHeadingDomState = (dom: HTMLElement) => {
  dom.classList.remove("heading-collapsible", "heading-collapsed-content");
  delete dom.dataset.headingKey;
  delete dom.dataset.headingId;
  delete dom.dataset.headingCollapsible;
  delete dom.dataset.headingCollapsed;
  delete dom.dataset.headingToggle;
  dom.removeAttribute("aria-hidden");
};

const syncHeadingCollapseDom = (view: EditorView) => {
  const domObserver = (view as EditorView & { domObserver?: { stop: () => void; start: () => void } }).domObserver;
  domObserver?.stop();
  try {
    const collapsedHeadingIds = headingCollapseKey.getState(view.state) ?? new Set<string>();
    const sections = collectHeadingSections(view.state.doc);
    const topLevelNodePositions: number[] = [];

    view.state.doc.descendants((_node, pos, parent) => {
      if (parent?.type.name === "doc") {
        topLevelNodePositions.push(pos);
      }
      return parent?.type.name !== "doc";
    });

    for (const pos of topLevelNodePositions) {
      const dom = view.nodeDOM(pos);
      if (dom instanceof HTMLElement) {
        clearHeadingDomState(dom);
      }
    }

    for (const section of sections) {
      const headingDom = view.nodeDOM(section.headingPos);
      if (!(headingDom instanceof HTMLElement)) {
        continue;
      }
      const isCollapsed = collapsedHeadingIds.has(section.headingKey);
      headingDom.classList.add("heading-collapsible");
      headingDom.dataset.headingKey = section.headingKey;
      headingDom.dataset.headingId = section.headingId;
      headingDom.dataset.headingCollapsible = "true";
      headingDom.dataset.headingCollapsed = isCollapsed ? "true" : "false";
      headingDom.dataset.headingToggle = getHeadingToggleLabel(isCollapsed);

      if (!isCollapsed) {
        continue;
      }

      for (const contentPos of section.contentPositions) {
        const contentDom = view.nodeDOM(contentPos);
        if (!(contentDom instanceof HTMLElement)) {
          continue;
        }
        contentDom.classList.add("heading-collapsed-content");
        contentDom.setAttribute("aria-hidden", "true");
      }
    }
  } finally {
    domObserver?.start();
  }
};

const headingCollapsePlugin = new Plugin<Set<string>>({
  key: headingCollapseKey,
  state: {
    init: (_config, state) => buildCollapsedHeadingIds(state.doc, new Set<string>()),
    apply: (tr, collapsedHeadingIds, _oldState, newState) =>
      buildCollapsedHeadingIds(newState.doc, collapsedHeadingIds, tr.getMeta(headingCollapseKey) as HeadingCollapseMeta | undefined)
  },
  view: (view) => {
    syncHeadingCollapseDom(view);
    queueMicrotask(() => {
      if (view.dom.isConnected) {
        syncHeadingCollapseDom(view);
      }
    });
    return {
      update(updatedView) {
        syncHeadingCollapseDom(updatedView);
      },
      destroy() {
        const topLevelNodePositions: number[] = [];
        view.state.doc.descendants((_node, pos, parent) => {
          if (parent?.type.name === "doc") {
            topLevelNodePositions.push(pos);
          }
          return parent?.type.name !== "doc";
        });
        for (const pos of topLevelNodePositions) {
          const dom = view.nodeDOM(pos);
          if (dom instanceof HTMLElement) {
            clearHeadingDomState(dom);
          }
        }
      }
    };
  },
  props: {
    handleDOMEvents: {
      mousedown(view, event) {
        const target = event.target as HTMLElement | null;
        const headingEl = target?.closest("[data-heading-collapsible='true']") as HTMLElement | null;
        if (!headingEl) {
          return false;
        }
        const rect = headingEl.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        // 仅在标题左侧折叠区点击时切换，避免干扰正文光标定位。
        if (offsetX < 0 || offsetX > 22) {
          return false;
        }
        const headingKey = headingEl.dataset.headingKey;
        if (!headingKey) {
          return false;
        }
        event.preventDefault();
        event.stopPropagation();
        view.dispatch(toggleHeadingCollapsed(view.state, headingKey));
        return true;
      }
    }
  }
});

export const HeadingCollapse = Extension.create({
  name: "headingCollapse",

  addProseMirrorPlugins() {
    return [headingCollapsePlugin];
  }
});
