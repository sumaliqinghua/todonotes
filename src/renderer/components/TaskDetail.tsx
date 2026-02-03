import React, { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import type { Task } from "../../shared/types";
import Breadcrumb from "./Breadcrumb";
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
  ancestors: Task[];
  onNavigate: (taskId: string, reset: boolean) => void;
  onOpenInNewWindow: (taskId: string) => void;
  onUpdateBlocks: (blocks: any) => void;
  onCreateChildFromBlock: (title: string) => Promise<{ taskId: string; title: string }>;
  onRequestTitle: (options: { title: string; placeholder?: string; defaultValue?: string }) => Promise<string | null>;
  onShowMenu: (menu: ContextMenuState | null) => void;
}

export default function TaskDetail({
  task,
  ancestors,
  onNavigate,
  onOpenInNewWindow,
  onUpdateBlocks,
  onCreateChildFromBlock,
  onRequestTitle,
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
  }, [task?.title]);

  useEffect(() => {
    if (!editor || !task) {
      return;
    }
    const next = task.blocks ?? DEFAULT_BLOCKS;
    const current = editor.getJSON();
    if (JSON.stringify(current) !== JSON.stringify(next) && !editor.isFocused) {
      editor.commands.setContent(next, false);
    }
  }, [editor, task?.id, task?.blocks]);

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
    const { from, to, $from, $to } = state.selection;
    const rawText = state.doc.textBetween(from, to, "\n").trim();
    const isSingleLine = $from.sameParent($to) && !rawText.includes("\n");
    if (!isSingleLine) {
      alert("只能转换单行文本");
      return;
    }
    const text = rawText || "未命名任务";
    const created = await onCreateChildFromBlock(text);
    if (!created.taskId) {
      return;
    }
    editor
      .chain()
      .focus()
      .deleteRange({ from, to })
      .insertContentAt(from, [
        {
          type: "taskLink",
          attrs: { taskId: created.taskId, title: created.title }
        },
        { type: "text", text: " " }
      ])
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

    const { state } = editor;
    const { from, to, $from, $to } = state.selection;
    const rawText = state.doc.textBetween(from, to, "\n").trim();
    const canConvert = $from.sameParent($to) && !rawText.includes("\n");
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
        ...(canConvert
          ? [
              {
                label: "转换为子任务",
                action: convertSelectionToChild
              }
            ]
          : [])
      ]
    });
  };

  if (!task) {
    return <div className="panel-card flex h-full items-center justify-center">加载中...</div>;
  }

  return (
    <div className="panel-card panel-enter flex h-full flex-col gap-4 p-5" onContextMenu={handleContextMenu}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-lg font-semibold text-app-text font-display">{title}</div>
        <div className="text-[11px] text-app-muted">Ctrl/Cmd + Shift + T 转为子任务</div>
      </div>
      <div>
        <Breadcrumb ancestors={ancestors} current={task} onNavigate={onNavigate} variant="dark" />
      </div>
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
