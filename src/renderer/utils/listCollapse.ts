import { mergeAttributes } from "@tiptap/core";
import ListItem from "@tiptap/extension-list-item";
import type { EditorState, Transaction } from "prosemirror-state";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

export const listCollapseKey = new PluginKey("listCollapse");

export const getListToggleLabel = (collapsed: boolean) => (collapsed ? "▸" : "▾");

export const toggleListItemCollapsed = (state: EditorState, pos: number): Transaction | null => {
  const node = state.doc.nodeAt(pos);
  if (!node || node.type.name !== "listItem") {
    return null;
  }
  const nextCollapsed = !Boolean(node.attrs?.collapsed);
  return state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, collapsed: nextCollapsed });
};

const listCollapsePlugin = new Plugin({
  key: listCollapseKey,
  props: {
    decorations(state) {
      const decorations: Decoration[] = [];
      state.doc.descendants((node, pos) => {
        if (node.type.name !== "listItem") {
          return;
        }
        let hasNestedList = false;
        node.forEach((child) => {
          if (child.type.name === "bulletList" || child.type.name === "orderedList") {
            hasNestedList = true;
          }
        });
        if (!hasNestedList) {
          return;
        }
        const collapsed = Boolean(node.attrs?.collapsed);
        decorations.push(
          Decoration.widget(
            pos + 1,
            () => {
              const button = document.createElement("button");
              button.type = "button";
              button.className = "list-toggle";
              button.dataset.listItemPos = String(pos);
              button.textContent = getListToggleLabel(collapsed);
              button.setAttribute("aria-label", collapsed ? "展开子项" : "折叠子项");
              return button;
            },
            { side: -1 }
          )
        );
      });
      return DecorationSet.create(state.doc, decorations);
    },
    handleDOMEvents: {
      mousedown(view, event) {
        const target = event.target as HTMLElement | null;
        const button = target?.closest(".list-toggle") as HTMLElement | null;
        if (!button) {
          return false;
        }
        const pos = Number(button.dataset.listItemPos);
        if (Number.isNaN(pos)) {
          return false;
        }
        const tr = toggleListItemCollapsed(view.state, pos);
        if (!tr) {
          return false;
        }
        event.preventDefault();
        event.stopPropagation();
        view.dispatch(tr);
        return true;
      }
    }
  }
});

export const CollapsibleListItem = ListItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      collapsed: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-collapsed") === "true",
        renderHTML: (attributes) =>
          attributes.collapsed
            ? {
                "data-collapsed": "true"
              }
            : {}
      }
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ["li", mergeAttributes(HTMLAttributes), 0];
  },
  addProseMirrorPlugins() {
    return [listCollapsePlugin];
  }
});
