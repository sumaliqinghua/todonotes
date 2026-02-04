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
import { handleCopy } from "../utils/editorMarkdown";
import { CollapsibleListItem } from "../utils/listCollapse";
import { updateTaskItemIndent } from "../utils/taskIndent";
import { hexToRgba } from "../utils/color";

const FOCUS_SECONDS = 25 * 60;
const BREAK_SECONDS = 5 * 60;
const FOCUS_MINUTES = 25;
const BREAK_MINUTES = 5;

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

type PomodoroPhase = "idle" | "focus" | "break";

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
  const prevTaskIdRef = useRef<string | null>(null);
  const imageHandlers = createImageHandlers(editorRef);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimer = useRef<number | null>(null);
  const [pomodoroPhase, setPomodoroPhase] = useState<PomodoroPhase>("idle");
  const [pomodoroRemaining, setPomodoroRemaining] = useState(FOCUS_SECONDS);
  const [pomodoroPaused, setPomodoroPaused] = useState(false);
  const pomodoroEndAtRef = useRef<number | null>(null);
  const pomodoroTimerRef = useRef<number | null>(null);
  const [pomodoroTip, setPomodoroTip] = useState<string | null>(null);
  const pomodoroTipTimerRef = useRef<number | null>(null);
  const pomodoroClickTimerRef = useRef<number | null>(null);
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
    content: task?.blocks ?? { type: "doc", content: [{ type: "paragraph" }] },
    editable: true,
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
    if (!editor || !task) {
      return;
    }
    const next = task.blocks ?? { type: "doc", content: [{ type: "paragraph" }] };
    const current = editor.getJSON();
    const taskIdChanged = prevTaskIdRef.current !== task.id;
    if (taskIdChanged || (JSON.stringify(current) !== JSON.stringify(next) && !editor.isFocused)) {
      editor.commands.setContent(next, false);
    }
    prevTaskIdRef.current = task.id;
  }, [editor, task?.id, task?.blocks]);

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
      if (pomodoroTimerRef.current) {
        window.clearInterval(pomodoroTimerRef.current);
      }
      if (pomodoroTipTimerRef.current) {
        window.clearTimeout(pomodoroTipTimerRef.current);
      }
      if (pomodoroClickTimerRef.current) {
        window.clearTimeout(pomodoroClickTimerRef.current);
      }
      window.api.invoke("window:toggleSkinPanel", { windowId, open: false });
    };
  }, [windowId]);

  const handleToggleSkinPanel = () => {
    window.api.invoke("window:toggleSkinPanel", { windowId });
  };

  const showPomodoroTip = (message: string) => {
    setPomodoroTip(message);
    if (pomodoroTipTimerRef.current) {
      window.clearTimeout(pomodoroTipTimerRef.current);
    }
    pomodoroTipTimerRef.current = window.setTimeout(() => setPomodoroTip(null), 2600);
  };

  const clearPomodoroTimer = () => {
    if (pomodoroTimerRef.current) {
      window.clearInterval(pomodoroTimerRef.current);
      pomodoroTimerRef.current = null;
    }
  };

  const stopPomodoro = (showTip = true) => {
    const wasActive = pomodoroPhase !== "idle" || pomodoroPaused;
    clearPomodoroTimer();
    pomodoroEndAtRef.current = null;
    setPomodoroPhase("idle");
    setPomodoroRemaining(FOCUS_SECONDS);
    setPomodoroPaused(false);
    if (showTip && wasActive) {
      showPomodoroTip("已停止，回到 25 分钟");
    }
  };

  const startPomodoroTimer = (phase: Exclude<PomodoroPhase, "idle">) => {
    clearPomodoroTimer();
    pomodoroTimerRef.current = window.setInterval(() => {
      if (!pomodoroEndAtRef.current) {
        return;
      }
      const remaining = Math.max(0, Math.ceil((pomodoroEndAtRef.current - Date.now()) / 1000));
      setPomodoroRemaining(remaining);
      if (remaining <= 0) {
        if (phase === "focus") {
          showPomodoroTip(`进入休息 ${BREAK_MINUTES} 分钟`);
          startPomodoroPhase("break");
        } else {
          stopPomodoro(false);
          showPomodoroTip("番茄完成，休息结束");
        }
      }
    }, 300);
  };

  const startPomodoroPhase = (phase: Exclude<PomodoroPhase, "idle">) => {
    const duration = phase === "focus" ? FOCUS_SECONDS : BREAK_SECONDS;
    setPomodoroPhase(phase);
    setPomodoroRemaining(duration);
    setPomodoroPaused(false);
    pomodoroEndAtRef.current = Date.now() + duration * 1000;
    startPomodoroTimer(phase);
  };

  const pausePomodoro = () => {
    if (pomodoroPhase === "idle" || pomodoroPaused) {
      return;
    }
    clearPomodoroTimer();
    pomodoroEndAtRef.current = null;
    setPomodoroPaused(true);
    showPomodoroTip("已暂停");
  };

  const resumePomodoro = () => {
    if (pomodoroPhase === "idle" || !pomodoroPaused) {
      return;
    }
    setPomodoroPaused(false);
    pomodoroEndAtRef.current = Date.now() + pomodoroRemaining * 1000;
    startPomodoroTimer(pomodoroPhase === "break" ? "break" : "focus");
    showPomodoroTip("继续进行");
  };

  const handlePomodoroSingleClick = () => {
    if (pomodoroPhase === "idle") {
      startPomodoroPhase("focus");
      showPomodoroTip(`专注开始 ${FOCUS_MINUTES} 分钟`);
      return;
    }
    if (pomodoroPaused) {
      resumePomodoro();
      return;
    }
    pausePomodoro();
  };

  const handlePomodoroClick = () => {
    if (pomodoroClickTimerRef.current) {
      window.clearTimeout(pomodoroClickTimerRef.current);
    }
    pomodoroClickTimerRef.current = window.setTimeout(() => {
      pomodoroClickTimerRef.current = null;
      handlePomodoroSingleClick();
    }, 260);
  };

  const handlePomodoroDoubleClick = () => {
    if (pomodoroClickTimerRef.current) {
      window.clearTimeout(pomodoroClickTimerRef.current);
      pomodoroClickTimerRef.current = null;
    }
    stopPomodoro(true);
  };

  const pomodoroDuration = pomodoroPhase === "break" ? BREAK_SECONDS : FOCUS_SECONDS;
  const pomodoroProgress = pomodoroPhase === "idle" ? 1 : 1 - pomodoroRemaining / pomodoroDuration;
  const pomodoroStroke =
    pomodoroPhase === "break" ? "#43b883" : pomodoroPhase === "focus" ? "#4b8fe6" : "#b0b0b0";
  const pomodoroMinutes = Math.ceil(pomodoroRemaining / 60);
  const pomodoroLabel =
    pomodoroPhase === "focus"
      ? pomodoroPaused
        ? `已暂停 ${pomodoroMinutes} 分`
        : `专注中 ${pomodoroMinutes} 分`
      : pomodoroPhase === "break"
        ? pomodoroPaused
          ? `休息暂停 ${pomodoroMinutes} 分`
          : `休息中 ${pomodoroMinutes} 分`
        : "开始番茄钟";

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
      {pomodoroTip ? <div className="no-drag sticky-tip">{pomodoroTip}</div> : null}
      <div className="drag-region sticky-titlebar">
        <div className="sticky-header">
          <div className="select-none text-sm font-semibold">{task.title}</div>
          <div className="no-drag sticky-controls flex items-center gap-2 text-xs">
            <button
              type="button"
              className="pomodoro-button no-drag"
              data-phase={pomodoroPhase}
              data-paused={pomodoroPaused}
              aria-label={pomodoroLabel}
              title={pomodoroLabel}
              onClick={handlePomodoroClick}
              onDoubleClick={handlePomodoroDoubleClick}
            >
              <svg className="pomodoro-ring" viewBox="0 0 32 32" aria-hidden>
                <circle cx="16" cy="16" r="11" className="pomodoro-ring-track" />
                <circle
                  cx="16"
                  cy="16"
                  r="11"
                  className="pomodoro-ring-progress"
                  style={
                    {
                      "--pomodoro-stroke": pomodoroStroke,
                      "--pomodoro-progress": pomodoroProgress
                    } as React.CSSProperties
                  }
                />
              </svg>
              <span className="pomodoro-label">
                {pomodoroPaused ? (
                  <span className="pomodoro-icon" aria-hidden>⏸</span>
                ) : (
                  <span>{pomodoroPhase === "break" ? String(BREAK_MINUTES) : String(pomodoroMinutes || FOCUS_MINUTES)}</span>
                )}
              </span>
            </button>
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
        <div>
          <Breadcrumb ancestors={ancestors} current={task} onNavigate={onNavigate} />
        </div>
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
