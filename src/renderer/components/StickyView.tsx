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
  onShowMenu: (menu: { x: number; y: number; items: { label: string; action: () => void }[] } | null) => void;
  isPinned: boolean;
  onTogglePin: () => void;
  onClose: () => void;
  stickyColor: string;
  stickyOpacity: number;
  onStickyColorChange: (color: string) => void;
  onStickyOpacityChange: (opacity: number) => void;
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
  onClose,
  stickyColor,
  stickyOpacity,
  onStickyColorChange,
  onStickyOpacityChange
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
  const stickyPalette = [
    { label: "浅黄", value: "#f6e8a6" },
    { label: "雾白", value: "#f2f1ec" },
    { label: "浅粉", value: "#f7d6d6" },
    { label: "浅蓝", value: "#d7e6fb" },
    { label: "浅绿", value: "#d9f2df" }
  ];
  const stickyBackground = hexToRgba(stickyColor, stickyOpacity);

  if (!task) {
    return <div className="flex h-screen items-center justify-center bg-[#f6e8a6] text-[#2b2b2b]">加载中...</div>;
  }

  return (
    <div
      className="sticky-surface flex h-screen flex-col gap-3 px-4 py-3 text-[#2b2b2b]"
      style={{ backgroundColor: stickyBackground }}
      onContextMenu={handleContextMenu}
    >
      <div className="drag-region flex items-center justify-between gap-3">
        <div className="text-base font-semibold">{task.title}</div>
        <div className="no-drag flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1 rounded-full bg-black/10 px-2 py-1">
            {stickyPalette.map((color) => (
              <button
                key={color.value}
                type="button"
                className={`h-4 w-4 rounded-full border ${stickyColor === color.value ? "border-black/60 ring-2 ring-black/40" : "border-black/20"}`}
                style={{ backgroundColor: color.value }}
                aria-label={`便签颜色-${color.label}`}
                onClick={() => onStickyColorChange(color.value)}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-full bg-black/10 px-2 py-1">
            <span>透明度</span>
            <input
              type="range"
              min={0.6}
              max={1}
              step={0.05}
              value={stickyOpacity}
              className="w-20 accent-[#b67a00]"
              onChange={(event) => onStickyOpacityChange(Number(event.target.value))}
            />
          </div>
          <button
            type="button"
            className={`rounded-full px-2 py-1 ${isPinned ? "bg-black/15 text-black" : "bg-black/5 text-black/70"}`}
            onClick={onTogglePin}
          >
            {isPinned ? "📌" : "📍"}
          </button>
          <button type="button" className="rounded-full px-2 py-1 hover:bg-black/10" onClick={() => window.api.invoke("window:minimize", { windowId })}>
            —
          </button>
          <button type="button" className="rounded-full px-2 py-1 hover:bg-black/10" onClick={onClose}>
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
