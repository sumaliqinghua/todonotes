import React, { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import type { Task } from "../../shared/types";
import { TaskLinkNode } from "./TaskLinkNode";
import type { ContextMenuState } from "./ContextMenu";
import { createImageHandlers } from "../utils/editorImages";
import { CollapsibleListItem } from "../utils/listCollapse";

const DEFAULT_BLOCKS = {
  type: "doc",
  content: [{ type: "paragraph" }]
};

interface Props {
  task: Task | null;
  onNavigate: (taskId: string, reset: boolean) => void;
  onOpenInNewWindow: (taskId: string) => void;
  onUpdateBlocks: (blocks: any) => void;
  onCreateChildFromBlock: (title: string) => Promise<{ taskId: string; title: string }>;
  onShowMenu: (menu: ContextMenuState | null) => void;
}

export default function TaskDetail({
  task,
  onNavigate,
  onOpenInNewWindow,
  onUpdateBlocks,
  onCreateChildFromBlock,
  onShowMenu
}: Props) {
  const [title, setTitle] = useState(task?.title ?? "");
  const blocksTimer = useRef<number | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const imageHandlers = createImageHandlers(editorRef);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimer = useRef<number | null>(null);

  const editor = useEditor({
    extensions: [StarterKit.configure({ listItem: false }), CollapsibleListItem, TaskList, TaskItem, Image, TaskLinkNode],
    content: task?.blocks ?? DEFAULT_BLOCKS,
    editorProps: {
      handlePaste: imageHandlers.handlePaste,
      handleDrop: imageHandlers.handleDrop,
      handleClick: (_view, _pos, event) => {
        const target = event.target as HTMLElement | null;
        const linkEl = target?.closest?.(".task-link-block") as HTMLElement | null;
        const taskId = linkEl?.dataset.taskId;
        if (taskId) {
          onNavigate(taskId, false);
          return true;
        }
        return false;
      }
    },
    onUpdate: ({ editor }) => {
      if (blocksTimer.current) {
        window.clearTimeout(blocksTimer.current);
      }
      blocksTimer.current = window.setTimeout(() => {
        onUpdateBlocks(editor.getJSON());
      }, 500);
    }
  });

  useEffect(() => {
    setTitle(task?.title ?? "");
    if (editor && task) {
      editor.commands.setContent(task.blocks ?? DEFAULT_BLOCKS, false);
    }
  }, [task?.id, editor]);

  useEffect(() => {
    editorRef.current = editor ?? null;
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        convertSelectionToChild();
      }
    };
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [editor, task?.id]);

  useEffect(() => {
    return () => {
      if (blocksTimer.current) {
        window.clearTimeout(blocksTimer.current);
      }
      if (scrollTimer.current) {
        window.clearTimeout(scrollTimer.current);
      }
    };
  }, []);

  const convertSelectionToChild = async () => {
    if (!editor || !task) {
      return;
    }
    const { state } = editor;
    const { $from } = state.selection;
    let depth = $from.depth;
    let node = $from.node(depth);
    while (depth > 0 && !["paragraph", "heading"].includes(node.type.name)) {
      depth -= 1;
      node = $from.node(depth);
    }
    if (!node || !["paragraph", "heading"].includes(node.type.name)) {
      alert("当前块类型暂不支持转换");
      return;
    }
    const text = node.textContent.trim() || "未命名任务";
    const pos = $from.before(depth);
    const created = await onCreateChildFromBlock(text);
    if (!created.taskId) {
      return;
    }
    editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .insertContentAt(pos, {
        type: "taskLink",
        attrs: { taskId: created.taskId, title: created.title }
      })
      .run();
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    if (!editor || !task) {
      return;
    }
    const target = event.target as HTMLElement;
    const linkEl = target.closest(".task-link-block") as HTMLElement | null;
    if (linkEl) {
      const taskId = linkEl.dataset.taskId;
      if (!taskId) {
        return;
      }
      const pos = editor.view.posAtDOM(linkEl, 0);
      const node = editor.state.doc.nodeAt(pos);
      const items = [
        {
          label: "打开子任务",
          action: () => onNavigate(taskId, false)
        },
        {
          label: "在新便签中打开",
          action: () => onOpenInNewWindow(taskId)
        }
      ];
      if (node) {
        items.push({
          label: "删除链接块",
          action: () => {
            editor
              .chain()
              .focus()
              .deleteRange({ from: pos, to: pos + node.nodeSize })
              .run();
          }
        });
      }
      onShowMenu({ x: event.clientX, y: event.clientY, items });
      return;
    }

    onShowMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        {
          label: "转换为子任务",
          action: convertSelectionToChild
        }
      ]
    });
  };

  if (!task) {
    return <div className="flex h-full items-center justify-center rounded-2xl border border-app-border bg-app-panel">加载中...</div>;
  }

  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-app-border bg-app-panel p-5 shadow-soft" onContextMenu={handleContextMenu}>
      <div className="text-lg font-semibold text-app-text">{title}</div>
      <div
        className={`editor-surface scrollbar-hidden cursor-text ${isScrolling ? "scrollbar-visible" : ""}`}
        onClick={() => {
          onShowMenu(null);
          editor?.commands.focus();
        }}
        onScroll={() => {
          setIsScrolling(true);
          if (scrollTimer.current) {
            window.clearTimeout(scrollTimer.current);
          }
          scrollTimer.current = window.setTimeout(() => setIsScrolling(false), 3000);
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
