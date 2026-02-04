import type { Editor } from "@tiptap/react";

const MAX_TASK_INDENT = 8;

const clampIndent = (value: number) => Math.max(0, Math.min(MAX_TASK_INDENT, value));

export const updateTaskItemIndent = (editor: Editor, delta: number) => {
  const { state, view } = editor;
  const { $from } = state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== "taskItem") {
      continue;
    }
    const pos = $from.before(depth);
    const current = typeof node.attrs?.indent === "number" ? node.attrs.indent : 0;
    const next = clampIndent(current + delta);
    if (next === current) {
      return;
    }
    const tr = state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
    view.dispatch(tr);
    return;
  }
};
