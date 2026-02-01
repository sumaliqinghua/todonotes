import React, { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import type { Task } from "../../shared/types";
import { TaskLinkNode } from "./TaskLinkNode";
import Breadcrumb from "./Breadcrumb";
import { createImageHandlers } from "../utils/editorImages";

interface Props {
  windowId: string;
  task: Task | null;
  ancestors: Task[];
  onNavigate: (taskId: string, reset: boolean) => void;
  onOpenInNewWindow: (taskId: string) => void;
  onCreateChildFromBlock: (title: string) => Promise<{ taskId: string; title: string }>;
  onShowMenu: (menu: { x: number; y: number; items: { label: string; action: () => void }[] } | null) => void;
  isPinned: boolean;
  onTogglePin: () => void;
  onClose: () => void;
}

export default function StickyView({
  windowId,
  task,
  ancestors,
  onNavigate,
  onOpenInNewWindow,
  onCreateChildFromBlock,
  onShowMenu,
  isPinned,
  onTogglePin,
  onClose
}: Props) {
  const saveTimer = useRef<number | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const imageHandlers = createImageHandlers(editorRef);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimer = useRef<number | null>(null);
  const editor = useEditor({
    extensions: [StarterKit, TaskList, TaskItem, Image, TaskLinkNode],
    content: task?.blocks ?? { type: "doc", content: [{ type: "paragraph" }] },
    editable: true,
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
      if (!task) {
        return;
      }
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
      }
      saveTimer.current = window.setTimeout(() => {
        window.api.invoke("task:update", { id: task.id, blocks: editor.getJSON() });
      }, 400);
    }
  });

  useEffect(() => {
    if (editor && task) {
      editor.commands.setContent(task.blocks, false);
    }
  }, [editor, task?.id]);

  useEffect(() => {
    editorRef.current = editor ?? null;
  }, [editor]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
      }
      if (scrollTimer.current) {
        window.clearTimeout(scrollTimer.current);
      }
    };
  }, []);

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

  const today = new Date();
  const footerText = `今天, ${today.getMonth() + 1}月${today.getDate()}日`;

  if (!task) {
    return <div className="sticky-view">加载中...</div>;
  }

  return (
    <div className="sticky-view" onContextMenu={handleContextMenu}>
      <div className="sticky-header">
        <div className="sticky-title">{task.title}</div>
        <div className="sticky-actions">
          <button type="button" className={`sticky-pin ${isPinned ? "active" : ""}`} onClick={onTogglePin}>
            {isPinned ? "📌" : "📍"}
          </button>
          <button type="button" onClick={() => window.api.invoke("window:minimize", { windowId })}>
            —
          </button>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
      </div>
      <div className="sticky-nav">
        <Breadcrumb ancestors={ancestors} current={task} onNavigate={onNavigate} />
      </div>
      <div
        className={`sticky-content ${isScrolling ? "scrolling" : ""}`}
        onClick={() => {
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
      <div className="sticky-footer">
        <span>{footerText}</span>
        <span>⋯</span>
      </div>
    </div>
  );
}
