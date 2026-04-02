import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { describe, expect, it } from "vitest";
import { Priority } from "../priorityExtension";

const createParagraphEditor = () =>
  new Editor({
    extensions: [StarterKit, Priority],
    content:
      '<p data-priority="high">第一行</p>'
  });

const createBulletListEditor = () =>
  new Editor({
    extensions: [StarterKit, Priority],
    content:
      '<ul><li data-priority="high">第一项</li></ul>'
  });

const createTaskListEditor = () =>
  new Editor({
    extensions: [
      StarterKit.configure({ listItem: false, bulletList: false, orderedList: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Priority
    ],
    content:
      '<ul data-type="taskList"><li data-type="taskItem" data-priority="high" data-checked="false"><div><p>第一项</p></div></li></ul>'
  });

describe("priorityExtension", () => {
  it("普通段落回车后，新段落不继承优先级", () => {
    const editor = createParagraphEditor();

    editor.commands.setTextSelection(4);
    editor.commands.splitBlock();

    const json = editor.getJSON();
    expect(json.content?.[0]?.attrs?.priority).toBe("high");
    expect(json.content?.[1]?.attrs?.priority ?? null).toBeNull();

    editor.destroy();
  });

  it("无序列表回车后，新列表项不继承优先级", () => {
    const editor = createBulletListEditor();

    editor.commands.setTextSelection(5);
    editor.commands.splitListItem("listItem");

    const listContent = editor.getJSON().content?.[0]?.content ?? [];
    expect(listContent[0]?.attrs?.priority).toBe("high");
    expect(listContent[1]?.attrs?.priority ?? null).toBeNull();

    editor.destroy();
  });

  it("任务列表回车后，新任务项不继承优先级", () => {
    const editor = createTaskListEditor();

    editor.commands.setTextSelection(5);
    editor.commands.splitListItem("taskItem");

    const listContent = editor.getJSON().content?.[0]?.content ?? [];
    expect(listContent[0]?.attrs?.priority).toBe("high");
    expect(listContent[1]?.attrs?.priority ?? null).toBeNull();

    editor.destroy();
  });
});
