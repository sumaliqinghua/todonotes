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
import { CollapsibleListItem } from "../utils/listCollapse";
import { hexToRgba } from "../utils/color";

interface Props {
  windowId: string;
  task: Task | null;
  ancestors: Task[];
  onNavigate: (taskId: string, reset: boolean) => void;
  onOpenInNewWindow: (taskId: string) => void;
  onCreateChildFromBlock: (title: string) => Promise<{ taskId: string; title: string }>;
  onRequestTitle: (options: { title: string; placeholder?: string; defaultValue?: string }) => Promise<string | null>;
  onShowMenu: (menu: { x: number; y: number; items: { label: string; action: () => void }[] } | null) => void;
  isPinned: boolean;
  onTogglePin: () => void;
  onClose: () => void;
  stickyColor: string;
  stickyOpacity: number;
}

export default function StickyView({
  windowId,
  task,
  ancestors,
  onNavigate,
  onOpenInNewWindow,
  onCreateChildFromBlock,
  onRequestTitle,
  onShowMenu,
  isPinned,
  onTogglePin,
  onClose,
  stickyColor,
  stickyOpacity
}: Props) {
  const saveTimer = useRef<number | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const imageHandlers = createImageHandlers(editorRef);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimer = useRef<number | null>(null);
  const editor = useEditor({
    extensions: [StarterKit.configure({ listItem: false }), CollapsibleListItem, TaskList, TaskItem, Image, TaskLinkNode],
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
      window.api.invoke("window:toggleSkinPanel", { windowId, open: false });
    };
  }, [windowId]);

  const handleToggleSkinPanel = () => {
    window.api.invoke("window:toggleSkinPanel", { windowId });
  };

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

  const appendChildTaskToEnd = async () => {
    if (!editor || !task) {
      return;
    }
    try {
      const title =
        (await onRequestTitle({ title: "子任务标题", placeholder: "请输入子任务标题" })) ??
        `新子任务 ${new Date().toLocaleTimeString()}`;
      const created = await onCreateChildFromBlock(title);
      if (!created.taskId) {
        return;
      }
      const endPos = editor.state.doc.content.size;
      editor
        .chain()
        .focus()
        .insertContentAt(endPos, {
          type: "taskLink",
          attrs: { taskId: created.taskId, title: created.title }
        })
        .run();
    } catch (error) {
      console.error("添加子任务失败", error);
      alert("添加子任务失败，请打开控制台查看错误");
    }
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
      items.unshift({
        label: "添加子任务",
        action: appendChildTaskToEnd
      });
      onShowMenu({ x: event.clientX, y: event.clientY, items });
      return;
    }

    onShowMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        {
          label: "添加子任务",
          action: () => {
            void appendChildTaskToEnd();
          }
        },
        {
          label: "转换为子任务",
          action: convertSelectionToChild
        }
      ]
    });
  };

  const today = new Date();
  const footerText = `今天, ${today.getMonth() + 1}月${today.getDate()}日`;
  const stickyBackground = hexToRgba(stickyColor, stickyOpacity);

  if (!task) {
    return <div className="flex h-screen items-center justify-center bg-[#f6e8a6] text-[#2b2b2b]">加载中...</div>;
  }

  return (
    <div
      className="sticky-surface flex h-screen flex-col gap-2 px-3 py-2 text-[#2b2b2b]"
      style={{ "--sticky-base": stickyBackground } as React.CSSProperties}
      onContextMenu={handleContextMenu}
    >
      <div className="drag-region sticky-header">
        <div className="select-none text-sm font-semibold">{task.title}</div>
        <div className="no-drag sticky-controls flex items-center gap-2 text-xs">
          <button type="button" className="sticky-chip" data-active="false" aria-label="皮肤" onClick={handleToggleSkinPanel}>
            🎨
          </button>
          <button type="button" className="sticky-chip" data-active={isPinned} onClick={onTogglePin}>
            {isPinned ? "📌" : "📍"}
          </button>
          <button type="button" className="sticky-chip" data-active="false" onClick={() => window.api.invoke("window:minimize", { windowId })}>
            —
          </button>
          <button type="button" className="sticky-chip" data-active="false" onClick={onClose}>
            ×
          </button>
        </div>
      </div>
      <div className="no-drag">
        <Breadcrumb ancestors={ancestors} current={task} onNavigate={onNavigate} />
      </div>
      <div
        className={`sticky-editor scrollbar-hidden cursor-text ${isScrolling ? "sticky-scrollbar-visible" : ""}`}
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
      <div className="flex items-center justify-between text-[11px] text-black/50">
        <span>{footerText}</span>
        <span>⋯</span>
      </div>
    </div>
  );
}
