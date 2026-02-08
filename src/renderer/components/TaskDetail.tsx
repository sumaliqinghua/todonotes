import React, { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import type { Task } from "../../shared/types";
import Breadcrumb from "./Breadcrumb";
import HistoryNav from "./HistoryNav";
import { TaskLinkNode } from "./TaskLinkNode";
import type { ContextMenuState } from "./ContextMenu";
import { createImageHandlers } from "../utils/editorImages";
import { handleCopy } from "../utils/editorMarkdown";
import { CollapsibleListItem } from "../utils/listCollapse";
import { updateTaskItemIndent } from "../utils/taskIndent";

const DEFAULT_BLOCKS = {
  type: "doc",
  content: [{ type: "paragraph" }]
} as any;

interface Props {
  task: Task | null;
  ancestors: Task[];
  onNavigate: (taskId: string, reset: boolean) => void;
  onOpenInNewWindow: (taskId: string) => void;
  onUpdateBlocks: (blocks: any) => void;
  onCreateChildFromBlock: (title: string) => Promise<{ taskId: string; title: string; isCompleted: boolean }>;
  onToggleLinkedTaskComplete: (taskId: string, nextCompleted: boolean) => Promise<void>;
  onRenameTaskTitle: (taskId: string, title: string) => Promise<void>;
  onRequestTitle: (options: { title: string; placeholder?: string; defaultValue?: string }) => Promise<string | null>;
  onShowMenu: (menu: ContextMenuState | null) => void;
  onHistoryBack: () => void;
  onHistoryForward: () => void;
  canHistoryBack: boolean;
  canHistoryForward: boolean;
}

export default function TaskDetail({
  task,
  ancestors,
  onNavigate,
  onOpenInNewWindow,
  onUpdateBlocks,
  onCreateChildFromBlock,
  onToggleLinkedTaskComplete,
  onRenameTaskTitle,
  onRequestTitle,
  onShowMenu,
  onHistoryBack,
  onHistoryForward,
  canHistoryBack,
  canHistoryForward
}: Props) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [isEditingHeaderTitle, setIsEditingHeaderTitle] = useState(false);
  const blocksTimer = useRef<number | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const prevTaskIdRef = useRef<string | null>(null);
  const skipHeaderCommitRef = useRef(false);
  const imageHandlers = createImageHandlers(editorRef);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimer = useRef<number | null>(null);

  const errorToMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return fallback;
  };

  const TaskItemWithIndent = TaskItem.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        indent: {
          default: 0,
          parseHTML: (element) => {
            const raw = element.getAttribute("data-indent");
            const parsed = raw ? Number(raw) : 0;
            return Number.isNaN(parsed) ? 0 : parsed;
          },
          renderHTML: (attributes) =>
            attributes.indent > 0
              ? {
                  "data-indent": String(attributes.indent),
                  style: `--task-indent-level: ${attributes.indent};`
                }
              : {}
        }
      };
    }
  }).configure({ nested: true });

  const editor = useEditor({
    extensions: [StarterKit.configure({ listItem: false }), CollapsibleListItem, TaskList, TaskItemWithIndent, Image, TaskLinkNode],
    content: (task?.blocks as any) ?? DEFAULT_BLOCKS,
    editorProps: {
      handlePaste: imageHandlers.handlePaste,
      handleDrop: imageHandlers.handleDrop,
      clipboardTextSerializer: () => "",
      handleDOMEvents: {
        copy: handleCopy
      },
      handleClick: (_view, _pos, event) => {
        const target = event.target as HTMLElement | null;
        const linkEl = target?.closest?.(".task-link-block") as HTMLElement | null;
        const taskId = linkEl?.dataset.taskId;
        const isCheckboxClick = Boolean(target?.closest?.(".task-link-checkbox"));
        if (taskId && isCheckboxClick) {
          event.preventDefault();
          event.stopPropagation();
          const currentCompleted = linkEl?.dataset.taskCompleted === "1";
          const pos = linkEl ? editor?.view.posAtDOM(linkEl, 0) : null;
          const node = typeof pos === "number" ? editor?.state.doc.nodeAt(pos) : null;
          if (editor && typeof pos === "number" && node) {
            editor
              .chain()
              .focus()
              .command(({ tr, dispatch }) => {
                tr.setNodeMarkup(pos, undefined, {
                  ...(node.attrs as Record<string, unknown>),
                  isCompleted: !currentCompleted
                });
                if (dispatch) {
                  dispatch(tr);
                }
                return true;
              })
              .run();
            const safePos = Math.min(pos + node.nodeSize, editor.state.doc.content.size);
            editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, safePos)));
          }
          void onToggleLinkedTaskComplete(taskId, !currentCompleted);
          return true;
        }
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
    setIsEditingHeaderTitle(false);
  }, [task?.title]);

  const commitHeaderTitle = async () => {
    if (!task) {
      setIsEditingHeaderTitle(false);
      return;
    }
    if (skipHeaderCommitRef.current) {
      skipHeaderCommitRef.current = false;
      setIsEditingHeaderTitle(false);
      return;
    }
    const nextTitle = title.trim();
    if (!nextTitle) {
      setTitle(task.title);
      setIsEditingHeaderTitle(false);
      return;
    }
    if (nextTitle === task.title) {
      setIsEditingHeaderTitle(false);
      return;
    }
    try {
      await onRenameTaskTitle(task.id, nextTitle);
      setIsEditingHeaderTitle(false);
    } catch (error) {
      setTitle(task.title);
      setIsEditingHeaderTitle(false);
      alert(errorToMessage(error, "重命名失败，请稍后重试"));
    }
  };

  useEffect(() => {
    if (!editor || !task) {
      return;
    }
    const next = (task.blocks as any) ?? DEFAULT_BLOCKS;
    const current = editor.getJSON();
    const taskIdChanged = prevTaskIdRef.current !== task.id;
    if (taskIdChanged || JSON.stringify(current) !== JSON.stringify(next)) {
      editor.commands.setContent(next, false);
    }
    prevTaskIdRef.current = task.id;
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
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        toggleCheckbox();
      }
      // Tab key for task list visual indentation
      if (event.key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const { $from } = editor.state.selection;
        const isInTaskItem = $from.parent.type.name === "taskItem" || $from.node(-1)?.type.name === "taskItem";
        if (isInTaskItem) {
          event.preventDefault();
          if (event.shiftKey) {
            updateTaskItemIndent(editor, -1);
          } else {
            updateTaskItemIndent(editor, 1);
          }
        }
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
    try {
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
            attrs: { taskId: created.taskId, title: created.title, isCompleted: created.isCompleted }
          },
          { type: "text", text: " " }
        ])
        .run();
    } catch (error) {
      alert(errorToMessage(error, "转换为子任务失败，请稍后重试"));
    }
  };

  const toggleCheckbox = () => {
    if (!editor) {
      return;
    }
    const { state } = editor;
    const { $from } = state.selection;
    const currentNode = $from.parent;

    // Check if we're in a task item
    if (currentNode.type.name === "taskItem") {
      // Toggle the checkbox state
      editor.chain().focus().toggleTaskList().run();
    } else {
      // Convert current line to a task item
      editor.chain().focus().toggleTaskList().run();
    }
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
          attrs: { taskId: created.taskId, title: created.title, isCompleted: created.isCompleted }
        })
        .run();
    } catch (error) {
      console.error("添加子任务失败", error);
      alert(errorToMessage(error, "添加子任务失败，请稍后重试"));
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
        {isEditingHeaderTitle ? (
          <input
            className="input-field h-8 min-w-[240px] max-w-[520px] text-base font-semibold"
            value={title}
            autoFocus
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void commitHeaderTitle();
              }
              if (event.key === "Escape") {
                skipHeaderCommitRef.current = true;
                setTitle(task.title);
                setIsEditingHeaderTitle(false);
              }
            }}
            onBlur={() => {
              void commitHeaderTitle();
            }}
          />
        ) : (
          <div
            className="select-none text-lg font-semibold text-app-text font-display"
            onDoubleClick={() => {
              setTitle(task.title);
              setIsEditingHeaderTitle(true);
            }}
            title="双击编辑标题"
          >
            {title}
          </div>
        )}
        <div className="text-[11px] text-app-muted">Ctrl/Cmd + Shift + T 转为子任务 | Ctrl/Cmd + Shift + S 切换复选框</div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Breadcrumb ancestors={ancestors} current={task} onNavigate={onNavigate} variant="dark" />
        </div>
        <HistoryNav
          variant="dark"
          canBack={canHistoryBack}
          canForward={canHistoryForward}
          onBack={onHistoryBack}
          onForward={onHistoryForward}
        />
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
