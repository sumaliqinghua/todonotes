import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { CollapsibleListItem, getListToggleLabel, toggleListItemCollapsed } from "../listCollapse";

const createEditor = () => {
  return new Editor({
    extensions: [StarterKit.configure({ listItem: false }), CollapsibleListItem],
    content: "<ul><li>Parent<ul><li>Child</li></ul></li></ul>"
  });
};

const findFirstListItemPos = (doc: any) => {
  let found: number | null = null;
  doc.descendants((node: any, pos: number) => {
    if (found === null && node.type.name === "listItem") {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
};

describe("listCollapse", () => {
  it("toggles list item collapsed state", () => {
    const editor = createEditor();
    const pos = findFirstListItemPos(editor.state.doc);
    expect(pos).not.toBeNull();
    const tr = toggleListItemCollapsed(editor.state, pos as number);
    expect(tr).not.toBeNull();
    const nextState = editor.state.apply(tr!);
    expect(nextState.doc.nodeAt(pos as number)?.attrs.collapsed).toBe(true);
    editor.destroy();
  });

  it("returns the correct toggle label", () => {
    expect(getListToggleLabel(true)).toBe("▸");
    expect(getListToggleLabel(false)).toBe("▾");
  });
});
