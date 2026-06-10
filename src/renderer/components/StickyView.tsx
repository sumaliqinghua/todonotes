import React, { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { NodeSelection, Selection, TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import type { StatusBlock, Task, WindowBookmark, WorkStatus } from "../../shared/types";
import {
  compareStatusBlocks,
  computeRemainingStatusDurationMinutes,
  formatStatusBadge,
  updateBlockStatusInBlocks
} from "../../shared/blockStatus";
import { TaskLinkNode } from "./TaskLinkNode";
import Breadcrumb from "./Breadcrumb";
import HistoryNav from "./HistoryNav";
import type { ContextMenuState } from "./ContextMenu";
import { createImageHandlers } from "../utils/editorImages";
import { handleCopy } from "../utils/editorMarkdown";
import { HeadingCollapse } from "../utils/headingCollapse";
import { CollapsibleListItem } from "../utils/listCollapse";
import { updateTaskItemIndent } from "../utils/taskIndent";
import { hexToRgba } from "../utils/color";
import { UniqueId } from "../utils/nodeId";
import { scrollToBlock } from "../utils/blockScroll";
import { Priority } from "../utils/priorityExtension";
import {
  BlockStatus,
  clearStatusOnBlockById,
  getStatusNodeSelectionSnapshot,
  setStatusOnBlockById,
  syncBlockStatusDom
} from "../utils/blockStatus";
import PriorityDropdown from "./PriorityDropdown";
import BlockDurationModal from "./BlockDurationModal";
import BlockPlanModal from "./BlockPlanModal";
import BlockWaitingModal from "./BlockWaitingModal";

const FOCUS_SECONDS = 25 * 60;
const BREAK_SECONDS = 5 * 60;
const FOCUS_MINUTES = 25;
const BREAK_MINUTES = 5;

interface Props {
  windowId: string;
  rootTaskId: string;
  task: Task | null;
  ancestors: Task[];
  onNavigate: (taskId: string, reset: boolean) => void;
  onOpenInNewWindow: (taskId: string) => void;
  onCreateChildFromBlock: (title: string) => Promise<{ taskId: string; title: string; isCompleted: boolean }>;
  onLoadInsertableChildren: () => Promise<Task[]>;
  onInsertExistingChildLink: (childId: string) => Promise<void>;
  onMoveChildReference: (childId: string) => Promise<void>;
  onToggleLinkedTaskComplete: (taskId: string, nextCompleted: boolean) => Promise<void>;
  onRenameTaskTitle: (taskId: string, title: string) => Promise<void>;
  onRequestTitle: (options: { title: string; placeholder?: string; defaultValue?: string }) => Promise<string | null>;
  onSendBlockToCodex: (input: { task: Task; blockId: string; blockText: string; blocks: any }) => Promise<void>;
  onOpenCodexSession: (task: Task) => Promise<void>;
  onClearCodexSession: (task: Task) => Promise<void>;
  onShowMenu: (menu: ContextMenuState | null) => void;
  onHistoryBack: () => void;
  onHistoryForward: () => void;
  canHistoryBack: boolean;
  canHistoryForward: boolean;
  isPinned: boolean;
  onTogglePin: () => void;
  onClose: () => void;
  stickyColor: string;
  stickyOpacity: number;
  bookmarks: WindowBookmark[];
  onBookmarksChange: (bookmarks: WindowBookmark[]) => void;
}

type PomodoroPhase = "idle" | "focus" | "break";
type WorkbenchTab = Extract<WorkStatus, "doing" | "waiting" | "todo">;
const WORKBENCH_TAB_ORDER: WorkbenchTab[] = ["doing", "waiting", "todo"];

interface WorkbenchEntry extends StatusBlock {
  key: string;
  blockCursorOffset?: number;
}

interface CachedStatusTarget {
  blockId: string;
  blockPos: number;
  blockType: string;
  workStatus: WorkStatus | null;
  workStatusUpdatedAt: number | null;
  plannedStartAt: number | null;
  plannedDurationMinutes: number | null;
  waitReason: string;
  waitReviewAt: number | null;
}

const buildStatusBlockKey = (statusBlock: Pick<StatusBlock, "taskId" | "blockId">) => `${statusBlock.taskId}_${statusBlock.blockId}`;

export default function StickyView({
  windowId,
  rootTaskId,
  task,
  ancestors,
  onNavigate,
  onOpenInNewWindow,
  onCreateChildFromBlock,
  onLoadInsertableChildren,
  onInsertExistingChildLink,
  onMoveChildReference,
  onToggleLinkedTaskComplete,
  onRenameTaskTitle,
  onRequestTitle,
  onSendBlockToCodex,
  onOpenCodexSession,
  onClearCodexSession,
  onShowMenu,
  onHistoryBack,
  onHistoryForward,
  canHistoryBack,
  canHistoryForward,
  isPinned,
  onTogglePin,
  onClose,
  stickyColor,
  stickyOpacity,
  bookmarks,
  onBookmarksChange
}: Props) {
  const [headerTitle, setHeaderTitle] = useState(task?.title ?? "");
  const [isEditingHeaderTitle, setIsEditingHeaderTitle] = useState(false);
  const saveTimersRef = useRef<Map<string, number>>(new Map());
  const editorRef = useRef<Editor | null>(null);
  const prevTaskIdRef = useRef<string | null>(null);
  const latestTaskIdRef = useRef<string | null>(task?.id ?? null);
  const suppressNextEditorUpdateRef = useRef(false);
  const imageHandlers = createImageHandlers(editorRef);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimer = useRef<number | null>(null);
  const [pomodoroPhase, setPomodoroPhase] = useState<PomodoroPhase>("idle");
  const [pomodoroRemaining, setPomodoroRemaining] = useState(FOCUS_SECONDS);
  const [pomodoroPaused, setPomodoroPaused] = useState(false);
  const pomodoroEndAtRef = useRef<number | null>(null);
  const pomodoroTimerRef = useRef<number | null>(null);
  const [pomodoroTip, setPomodoroTip] = useState<string | null>(null);
  const [bookmarkTip, setBookmarkTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const bookmarkPathCacheRef = useRef<Record<string, string>>({});
  const bookmarkHoverTaskIdRef = useRef<string | null>(null);
  const pomodoroTipTimerRef = useRef<number | null>(null);
  const pomodoroClickTimerRef = useRef<number | null>(null);
  const skipHeaderCommitRef = useRef(false);
  const [pendingPopup, setPendingPopup] = useState<{ x: number; y: number } | null>(null);
  const pendingFocusRef = useRef<{ taskId: string; blockId: string; blockCursorOffset?: number } | null>(null);
  const pendingBlockBookmarkPosRef = useRef<number | null>(null);
  const pendingRemoteBlocksRef = useRef<any | null>(null);
  const lastLocalBlocksHashRef = useRef<string | null>(null);
  const lastStatusTargetRef = useRef<CachedStatusTarget | null>(null);
  const statusTargetDomCacheUntilRef = useRef(0);
  const suppressNextStatusTargetCacheRef = useRef(false);
  const [statusBlocksRefreshVersion, setStatusBlocksRefreshVersion] = useState(0);
  const [activeWorkbenchKey, setActiveWorkbenchKey] = useState<string | null>(null);
  const [showCheckedCheckboxBlocks, setShowCheckedCheckboxBlocks] = useState(true);
  const [statusNow, setStatusNow] = useState(() => Date.now());
  const [statusBlocks, setStatusBlocks] = useState<StatusBlock[]>([]);
  const [workbenchTab, setWorkbenchTab] = useState<WorkbenchTab>("doing");
  const [planModalState, setPlanModalState] = useState<{
    blockId: string;
    plannedStartAt: number;
    plannedDurationMinutes: number;
  } | null>(null);
  const [doingModalState, setDoingModalState] = useState<{
    blockId: string;
    plannedDurationMinutes: number;
  } | null>(null);
  const [waitingModalState, setWaitingModalState] = useState<{
    blockId: string;
    waitReason: string;
    waitReviewAt: number | null;
    plannedDurationMinutes: number | null;
  } | null>(null);
  latestTaskIdRef.current = task?.id ?? null;

  const statusTargetNodeTypes = new Set(["paragraph", "heading", "listItem", "taskItem"]);

  const replaceEditorContentWithoutSaving = (editor: Editor, blocks: any) => {
    suppressNextEditorUpdateRef.current = true;
    try {
      editor.commands.setContent(blocks, false);
    } finally {
      suppressNextEditorUpdateRef.current = false;
    }
  };

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
    extensions: [StarterKit.configure({ listItem: false }), HeadingCollapse, CollapsibleListItem, TaskList, TaskItemWithIndent, Image, TaskLinkNode, UniqueId, Priority, BlockStatus],
    content: (task?.blocks as any) ?? { type: "doc", content: [{ type: "paragraph" }] },
    editable: true,
    editorProps: {
      handlePaste: imageHandlers.handlePaste,
      handleDrop: imageHandlers.handleDrop,
      handleKeyDown: (view, event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
          return false;
        }
        const { selection, doc } = view.state;
        const moveCaret = (pos: number) => {
          const safePos = Math.max(1, Math.min(doc.content.size, pos));
          view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, safePos)));
          return true;
        };
        if (selection instanceof NodeSelection && selection.node.type.name === "taskLink") {
          event.preventDefault();
          return event.key === "ArrowLeft" ? moveCaret(selection.from) : moveCaret(selection.to);
        }
        if (!selection.empty) {
          return false;
        }
        const { $from } = selection;
        if (event.key === "ArrowLeft") {
          const nodeBefore = $from.nodeBefore;
          if (nodeBefore?.type.name === "taskLink") {
            event.preventDefault();
            return moveCaret(selection.from - nodeBefore.nodeSize);
          }
          return false;
        }
        const nodeAfter = $from.nodeAfter;
        if (nodeAfter?.type.name === "taskLink") {
          event.preventDefault();
          return moveCaret(selection.from + nodeAfter.nodeSize);
        }
        return false;
      },
      clipboardTextSerializer: () => "",
      handleDOMEvents: {
        copy: handleCopy,
        mousedown: (_view, event) => {
          cacheStatusTargetFromEditorEvent(event);
          return false;
        }
      },
      handleClick: (_view, _pos, event) => {
        const target = event.target as HTMLElement | null;
        cacheStatusTargetFromEditorEvent(event);
        const linkEl = target?.closest?.(".task-link-block") as HTMLElement | null;
        const taskId = linkEl?.dataset.taskId;
        const isCheckboxClick = Boolean(target?.closest?.(".task-link-checkbox"));
        const isTitleClick = Boolean(target?.closest?.(".task-link-title"));
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
        if (taskId && isTitleClick) {
          onNavigate(taskId, false);
          return true;
        }
        return false;
      }
    },
    onUpdate: ({ editor }) => {
      if (suppressNextEditorUpdateRef.current) {
        suppressNextEditorUpdateRef.current = false;
        return;
      }
      const taskId = latestTaskIdRef.current;
      if (!taskId) {
        return;
      }
      const nextBlocks = editor.getJSON();
      lastLocalBlocksHashRef.current = JSON.stringify(nextBlocks);
      const existingTimer = saveTimersRef.current.get(taskId);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }
      const timerId = window.setTimeout(() => {
        saveTimersRef.current.delete(taskId);
        window.api.invoke("task:update", { id: taskId, blocks: nextBlocks });
      }, 400);
      saveTimersRef.current.set(taskId, timerId);
    }
  }, [task?.id]);

  useEffect(() => {
    if (!editor || !task) {
      return;
    }
    const next = (task.blocks as any) ?? { type: "doc", content: [{ type: "paragraph" }] };
    const current = editor.getJSON();
    const taskIdChanged = prevTaskIdRef.current !== task.id;
    const currentSerialized = JSON.stringify(current);
    const nextSerialized = JSON.stringify(next);
    if (taskIdChanged) {
      replaceEditorContentWithoutSaving(editor, next);
      pendingRemoteBlocksRef.current = null;
      lastLocalBlocksHashRef.current = nextSerialized;
    } else if (currentSerialized !== nextSerialized) {
      // 本地保存回流不应重置光标，直接忽略
      if (nextSerialized === lastLocalBlocksHashRef.current) {
        pendingRemoteBlocksRef.current = null;
      } else if (editor.isFocused) {
        // 正在输入时先缓存远端内容，等失焦再应用，避免光标跳到文末
        pendingRemoteBlocksRef.current = next;
      } else {
        replaceEditorContentWithoutSaving(editor, next);
        pendingRemoteBlocksRef.current = null;
        lastLocalBlocksHashRef.current = nextSerialized;
      }
    }
    prevTaskIdRef.current = task.id;
  }, [editor, task?.id, task?.blocks]);

  useEffect(() => {
    const handleScrollToBlock = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      const blockId = customEvent.detail;
      if (!blockId) return;
      if (!editor || !task) {
        pendingFocusRef.current = { taskId: latestTaskIdRef.current ?? "", blockId };
        return;
      }
      pendingFocusRef.current = { taskId: task.id, blockId };

      setTimeout(() => {
        if (!editor || !task) {
          return;
        }
        const blockElement = editor.view.dom.querySelector(`[data-node-id="${blockId}"]`);
        if (blockElement) {
          blockElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          blockElement.classList.add('bg-blue-50', 'dark:bg-blue-900/30', 'transition-colors', 'duration-500');
          setTimeout(() => {
            blockElement.classList.remove('bg-blue-50', 'dark:bg-blue-900/30');
          }, 2000);
          pendingFocusRef.current = null;
        }
      }, 300);
    };

    window.addEventListener('scroll-to-block', handleScrollToBlock);
    return () => window.removeEventListener('scroll-to-block', handleScrollToBlock);
  }, [editor, task?.id]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    const applyPendingRemoteBlocks = () => {
      const pending = pendingRemoteBlocksRef.current;
      if (!pending || editor.isFocused) {
        return;
      }
      const current = editor.getJSON();
      const currentSerialized = JSON.stringify(current);
      const pendingSerialized = JSON.stringify(pending);
      if (currentSerialized !== pendingSerialized) {
        replaceEditorContentWithoutSaving(editor, pending);
      }
      pendingRemoteBlocksRef.current = null;
      lastLocalBlocksHashRef.current = pendingSerialized;
    };
    editor.on("blur", applyPendingRemoteBlocks);
    return () => {
      editor.off("blur", applyPendingRemoteBlocks);
    };
  }, [editor]);

  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending || !editor || !task) {
      return;
    }
    if (pending.taskId !== task.id) {
      return;
    }
    const found = scrollToBlock(editor, pending.blockId, pending.blockCursorOffset);
    if (found) {
      pendingFocusRef.current = null;
      return;
    }
    const retryTimer = window.setTimeout(() => {
      const latest = pendingFocusRef.current;
      if (!latest || latest.taskId !== task.id) {
        return;
      }
      if (scrollToBlock(editor, latest.blockId, latest.blockCursorOffset)) {
        pendingFocusRef.current = null;
      }
    }, 120);

    return () => window.clearTimeout(retryTimer);
  }, [editor, task?.id, task?.blocks]);

  useEffect(() => {
    setHeaderTitle(task?.title ?? "");
    setIsEditingHeaderTitle(false);
  }, [task?.title]);

  useEffect(() => {
    if (!task) {
      return;
    }
    const hasMatched = bookmarks.some((bookmark) => bookmark.taskId === task.id && bookmark.title !== task.title);
    if (!hasMatched) {
      return;
    }
    onBookmarksChange(bookmarks.map((bookmark) => (bookmark.taskId === task.id ? { ...bookmark, title: task.title } : bookmark)));
  }, [task?.id, task?.title, bookmarks, onBookmarksChange]);

  useEffect(() => {
    bookmarkPathCacheRef.current = {};
  }, [bookmarks]);

  useEffect(() => {
    const offUpdated = window.api.on("task:updated", () => {
      setStatusBlocksRefreshVersion((prev) => prev + 1);
    });
    const offDeleted = window.api.on("task:deleted", () => {
      setStatusBlocksRefreshVersion((prev) => prev + 1);
    });
    return () => {
      offUpdated();
      offDeleted();
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setStatusBlocksRefreshVersion((prev) => prev + 1);
    }, 120000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let canceled = false;
    const loadStatusBlocks = async () => {
      try {
        const result = await window.api.invoke("task:listStatusBlocksByRoot", { rootTaskId });
        if (!canceled) {
          setStatusBlocks(Array.isArray(result) ? result : []);
        }
      } catch {
        if (!canceled) {
          setStatusBlocks([]);
        }
      }
    };
    void loadStatusBlocks();
    return () => {
      canceled = true;
    };
  }, [rootTaskId, statusBlocksRefreshVersion]);

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
    const nextTitle = headerTitle.trim();
    if (!nextTitle) {
      setHeaderTitle(task.title);
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
      setHeaderTitle(task.title);
      setIsEditingHeaderTitle(false);
      alert(errorToMessage(error, "重命名失败，请稍后重试"));
    }
  };

  useEffect(() => {
    editorRef.current = editor ?? null;
  }, [editor]);

  useEffect(() => {
    let intervalId: number | null = null;
    const tick = () => setStatusNow(Date.now());
    const delay = Math.max(1000, 60000 - (Date.now() % 60000));
    const timeoutId = window.setTimeout(() => {
      tick();
      intervalId = window.setInterval(tick, 60000);
    }, delay);
    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  useEffect(() => {
    if (!editor) {
      return;
    }
    const timer = window.setTimeout(() => {
      syncBlockStatusDom(editor.view, statusNow);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [editor, statusNow, task?.blocks]);

  useEffect(() => {
    if (!editor) {
      lastStatusTargetRef.current = null;
      return;
    }
    const cacheSelectionTarget = () => {
      if (suppressNextStatusTargetCacheRef.current) {
        suppressNextStatusTargetCacheRef.current = false;
        return;
      }
      const snapshot = getStatusNodeSelectionSnapshot(editor);
      if (!snapshot) {
        return;
      }
      if (Date.now() < statusTargetDomCacheUntilRef.current && snapshot.blockId !== lastStatusTargetRef.current?.blockId) {
        return;
      }
      cacheStatusTarget({
        blockId: snapshot.blockId,
        blockPos: snapshot.pos,
        blockType: snapshot.nodeName,
        workStatus: snapshot.workStatus,
        workStatusUpdatedAt: snapshot.workStatusUpdatedAt,
        plannedStartAt: snapshot.plannedStartAt,
        plannedDurationMinutes: snapshot.plannedDurationMinutes,
        waitReason: snapshot.waitReason,
        waitReviewAt: snapshot.waitReviewAt
      });
    };
    cacheSelectionTarget();
    editor.on("selectionUpdate", cacheSelectionTarget);
    editor.on("focus", cacheSelectionTarget);
    editor.on("update", cacheSelectionTarget);
    return () => {
      editor.off("selectionUpdate", cacheSelectionTarget);
      editor.off("focus", cacheSelectionTarget);
      editor.off("update", cacheSelectionTarget);
    };
  }, [editor]);

  useEffect(() => {
    return () => {
      saveTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      saveTimersRef.current.clear();
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
    try {
      const { state } = editor;
      const { from, to, $from, $to } = state.selection;
      const hasSelection = from !== to;
      const rangeFrom = hasSelection ? from : $from.start();
      const rangeTo = hasSelection ? to : $from.end();
      const rawText = state.doc.textBetween(rangeFrom, rangeTo, "\n").trim();
      const isSingleLine = hasSelection ? $from.sameParent($to) && !rawText.includes("\n") : !rawText.includes("\n");
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
        .deleteRange({ from: rangeFrom, to: rangeTo })
        .insertContentAt(rangeFrom, [
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
        .insertContentAt(endPos, [
          {
            type: "taskLink",
            attrs: { taskId: created.taskId, title: created.title, isCompleted: created.isCompleted }
          },
          { type: "text", text: " " }
        ])
        .run();
    } catch (error) {
      console.error("添加子任务失败", error);
      alert(errorToMessage(error, "添加子任务失败，请稍后重试"));
    }
  };

  const addCurrentTaskBookmark = () => {
    if (!task) {
      return;
    }
    onBookmarksChange((() => {
      const existingIndex = bookmarks.findIndex((bookmark) => bookmark.taskId === task.id && !bookmark.blockId);
      if (existingIndex === -1) {
        return [...bookmarks, { taskId: task.id, title: task.title }];
      }
      const next = bookmarks.slice();
      next[existingIndex] = { taskId: task.id, title: task.title };
      return next;
    })());
  };

  const countNodeIdOccurrences = (doc: Editor["state"]["doc"], nodeId: string): number => {
    let count = 0;
    doc.descendants((node) => {
      if (node.attrs?.id === nodeId) {
        count += 1;
      }
      return true;
    });
    return count;
  };

  const readPositiveNumberAttr = (value: unknown): number | null => {
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
  };

  const isStatusTargetNode = (node: any) => {
    return Boolean(node?.type?.name && statusTargetNodeTypes.has(node.type.name));
  };

  const cacheStatusTarget = (target: CachedStatusTarget | null, source: "selection" | "pointer" = "selection") => {
    if (!target) {
      return null;
    }
    if (source === "pointer") {
      statusTargetDomCacheUntilRef.current = Date.now() + 2500;
    }
    lastStatusTargetRef.current = target;
    return target;
  };

  const cacheStatusContextTarget = (target: CachedStatusTarget | null, source: "selection" | "pointer" = "selection") => {
    if (!target) {
      return null;
    }
    return cacheStatusTarget({
      blockId: target.blockId,
      blockPos: target.blockPos,
      blockType: target.blockType,
      workStatus: target.workStatus,
      workStatusUpdatedAt: target.workStatusUpdatedAt,
      plannedStartAt: target.plannedStartAt,
      plannedDurationMinutes: target.plannedDurationMinutes,
      waitReason: target.waitReason,
      waitReviewAt: target.waitReviewAt
    }, source);
  };

  const resolveStatusContextTargetAtCachedPosition = (target: CachedStatusTarget) => {
    if (!editor) {
      return null;
    }
    const node = editor.state.doc.nodeAt(target.blockPos);
    if (node && isStatusTargetNode(node) && node.attrs?.id === target.blockId) {
      return resolveStatusContextTarget(target.blockPos);
    }
    return null;
  };

  const findStatusContextTargetById = (blockId: string) => {
    if (!editor || !blockId) {
      return null;
    }
    let matchedPos: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (!isStatusTargetNode(node)) {
        return true;
      }
      if (node.attrs?.id === blockId) {
        matchedPos = pos;
        return false;
      }
      return true;
    });
    return typeof matchedPos === "number" ? resolveStatusContextTarget(matchedPos) : null;
  };

  const findStatusContextTargetByDomElement = (element: HTMLElement, blockId: string) => {
    if (!editor || !blockId) {
      return null;
    }
    const matches: number[] = [];
    let domMatchedPos: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (!isStatusTargetNode(node) || node.attrs?.id !== blockId) {
        return true;
      }
      matches.push(pos);
      const nodeDom = editor.view.nodeDOM(pos);
      if (nodeDom instanceof HTMLElement && (nodeDom === element || nodeDom.contains(element) || element.contains(nodeDom))) {
        domMatchedPos = pos;
        return false;
      }
      return true;
    });
    if (typeof domMatchedPos === "number") {
      return resolveStatusContextTarget(domMatchedPos);
    }
    return matches.length === 1 ? resolveStatusContextTarget(matches[0]) : null;
  };

  const pickStatusContextTarget = (targets: CachedStatusTarget[]) => {
    return (
      targets.find((target) => Boolean(target.workStatus)) ??
      targets.find((target) => target.blockType === "taskItem" || target.blockType === "listItem") ??
      targets[0] ??
      null
    );
  };

  const resolveStatusContextTargetFromElement = (element: HTMLElement) => {
    if (!editor) {
      return null;
    }
    const targets: CachedStatusTarget[] = [];
    const pushTarget = (target: CachedStatusTarget | null) => {
      if (!target) {
        return;
      }
      if (targets.some((item) => item.blockId === target.blockId && item.blockPos === target.blockPos)) {
        return;
      }
      targets.push(target);
    };
    let current: HTMLElement | null = element;
    while (current && current !== editor.view.dom) {
      const blockId = current.dataset.nodeId;
      if (blockId) {
        pushTarget(findStatusContextTargetByDomElement(current, blockId));
        const byId = findStatusContextTargetById(blockId);
        pushTarget(byId);
        try {
          const domPos = editor.view.posAtDOM(current, 0);
          const byDomPos = resolveStatusContextTarget(domPos);
          pushTarget(byDomPos);
        } catch {
          // DOM 装饰节点可能无法映射到文档位置，继续向父级查找真实文本块。
        }
      }
      current = current.parentElement;
    }
    return pickStatusContextTarget(targets);
  };

  const cacheStatusTargetFromEditorEvent = (event: MouseEvent | React.MouseEvent) => {
    if (!editor || suppressNextStatusTargetCacheRef.current) {
      return;
    }
    const eventTarget = event.target;
    const targetElement =
      eventTarget instanceof HTMLElement
        ? eventTarget
        : eventTarget instanceof Node
          ? eventTarget.parentElement
          : null;
    if (!targetElement || !editor.view.dom.contains(targetElement)) {
      return;
    }

    const byElement = resolveStatusContextTargetFromElement(targetElement);
    if (cacheStatusContextTarget(byElement, "pointer")) {
      return;
    }

    const pos = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
    if (typeof pos?.pos === "number") {
      cacheStatusContextTarget(resolveStatusContextTarget(pos.pos), "pointer");
    }
  };

  const resolveStatusContextTarget = (rawPos: number): CachedStatusTarget | null => {
    if (!editor) {
      return null;
    }
    const directNode = editor.state.doc.nodeAt(rawPos);
    const anchor = directNode && isStatusTargetNode(directNode)
      ? {
          blockNode: directNode,
          blockPos: rawPos,
          lineEndPos: rawPos + directNode.nodeSize - 1
        }
      : resolveBlockAnchor(editor.state.doc, rawPos);
    if (!anchor) {
      return null;
    }
    let { blockNode, blockPos } = anchor;
    if (!isStatusTargetNode(blockNode)) {
      return null;
    }
    let blockId = typeof blockNode.attrs?.id === "string" && blockNode.attrs.id.trim()
      ? blockNode.attrs.id
      : "";
    const shouldResetId = !blockId || countNodeIdOccurrences(editor.state.doc, blockId) > 1;
    if (shouldResetId) {
      blockId = `node_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(blockPos, undefined, {
          ...blockNode.attrs,
          id: blockId
        })
      );
      const refreshed = editor.state.doc.nodeAt(blockPos);
      if (refreshed) {
        blockNode = refreshed;
      }
    }
    return {
      blockId,
      blockPos,
      blockType: blockNode.type.name,
      workStatus: typeof blockNode.attrs?.workStatus === "string" ? blockNode.attrs.workStatus : null,
      plannedStartAt: readPositiveNumberAttr(blockNode.attrs?.plannedStartAt),
      plannedDurationMinutes: readPositiveNumberAttr(blockNode.attrs?.plannedDurationMinutes),
      waitReason: typeof blockNode.attrs?.waitReason === "string" ? blockNode.attrs.waitReason : "",
      waitReviewAt: readPositiveNumberAttr(blockNode.attrs?.waitReviewAt),
      workStatusUpdatedAt: readPositiveNumberAttr(blockNode.attrs?.workStatusUpdatedAt)
    };
  };

  const resolveBlockAnchor = (
    doc: Editor["state"]["doc"],
    rawPos: number
  ): { blockNode: any; blockPos: number; lineEndPos: number | null } | null => {
    const safePos = Math.max(1, Math.min(doc.content.size, rawPos));

    const findFirstTextblockWithin = (
      containerPos: number,
      containerNode: any
    ): { blockNode: any; blockPos: number; lineEndPos: number } | null => {
      const fromPos = Math.max(1, containerPos + 1);
      const toPos = Math.min(doc.content.size, containerPos + containerNode.nodeSize - 1);
      if (fromPos > toPos) {
        return null;
      }
      let matched: { blockNode: any; blockPos: number; lineEndPos: number } | null = null;
      doc.nodesBetween(fromPos, toPos, (node, pos) => {
        if (node.isTextblock) {
          matched = {
            blockNode: node,
            blockPos: pos,
            lineEndPos: pos + node.nodeSize - 1
          };
          return false;
        }
        return true;
      });
      return matched;
    };

    const directNode = doc.nodeAt(safePos);
    if (directNode?.isTextblock) {
      return {
        blockNode: directNode,
        blockPos: safePos,
        lineEndPos: safePos + directNode.nodeSize - 1
      };
    }
    if (directNode?.isBlock && directNode.type.name !== "doc") {
      const nested = findFirstTextblockWithin(safePos, directNode);
      if (nested) {
        return nested;
      }
    }

    const nearSelection = Selection.near(doc.resolve(safePos), -1);
    const $pos = doc.resolve(nearSelection.from);

    for (let depth = $pos.depth; depth > 0; depth--) {
      const node = $pos.node(depth);
      if (node.isTextblock) {
        return {
          blockNode: node,
          blockPos: $pos.before(depth),
          lineEndPos: $pos.end(depth)
        };
      }
    }

    for (let depth = $pos.depth; depth > 0; depth--) {
      const node = $pos.node(depth);
      if (node.isBlock && node.type.name !== "doc") {
        const fallbackPos = $pos.before(depth);
        const nested = findFirstTextblockWithin(fallbackPos, node);
        if (nested) {
          return nested;
        }
        return {
          blockNode: node,
          blockPos: fallbackPos,
          lineEndPos: null
        };
      }
    }

    return null;
  };

  const addBlockBookmark = () => {
    if (!task || !editor) {
      return;
    }

    // 优先使用“右键点击位置”，避免总是落在旧光标所在块
    const rawFrom = typeof pendingBlockBookmarkPosRef.current === "number"
      ? pendingBlockBookmarkPosRef.current
      : editor.state.selection.from;
    pendingBlockBookmarkPosRef.current = null;
    const anchor = resolveBlockAnchor(editor.state.doc, rawFrom);
    if (!anchor) {
      alert("无法定位到文本块");
      return;
    }
    let { blockNode, blockPos, lineEndPos } = anchor;

    // 获取或生成节点ID；若命中重复ID，强制为当前块重置唯一ID，避免回跳到同ID的其他块
    let blockId = typeof blockNode.attrs.id === "string" && blockNode.attrs.id.trim()
      ? blockNode.attrs.id
      : "";
    const shouldResetId = !blockId || countNodeIdOccurrences(editor.state.doc, blockId) > 1;
    if (shouldResetId) {
      blockId = `node_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const tr = editor.state.tr;
      tr.setNodeMarkup(blockPos, undefined, {
        ...blockNode.attrs,
        id: blockId
      });
      editor.view.dispatch(tr);
      const refreshed = editor.state.doc.nodeAt(blockPos);
      if (refreshed) {
        blockNode = refreshed;
      }
      if (lineEndPos !== null) {
        lineEndPos = blockPos + blockNode.nodeSize - 1;
      }
    }

    let blockCursorOffset = Math.max(1, blockNode.nodeSize - 1);
    if (typeof lineEndPos === "number") {
      blockCursorOffset = Math.max(1, Math.min(blockNode.nodeSize - 1, lineEndPos - blockPos));
    }

    // 获取文本块内容（前100个字符）
    const blockContent = blockNode.textContent.slice(0, 100);
    const blockType = blockNode.type.name;

    if (!blockContent.trim()) {
      alert("文本块内容为空，无法添加书签");
      return;
    }

    // 添加书签
    onBookmarksChange((() => {
      const existingIndex = bookmarks.findIndex(
        (bookmark) =>
          bookmark.taskId === task.id &&
          bookmark.blockId === blockId &&
          (typeof bookmark.blockCursorOffset !== "number" || bookmark.blockCursorOffset === blockCursorOffset)
      );
      if (existingIndex === -1) {
        return [...bookmarks, {
          taskId: task.id,
          title: task.title,
          blockId,
          blockCursorOffset,
          blockContent,
          blockType
        }];
      }
      // 更新现有书签
      const next = bookmarks.slice();
      next[existingIndex] = {
        taskId: task.id,
        title: task.title,
        blockId,
        blockCursorOffset,
        blockContent,
        blockType
      };
      return next;
    })());
  };

  const removeBookmark = (taskId: string, blockId?: string, blockCursorOffset?: number) => {
    setBookmarkTip(null);
    onBookmarksChange(bookmarks.filter((bookmark) => {
      if (blockId) {
        if (typeof blockCursorOffset === "number") {
          return !(
            bookmark.taskId === taskId &&
            bookmark.blockId === blockId &&
            bookmark.blockCursorOffset === blockCursorOffset
          );
        }
        return !(bookmark.taskId === taskId && bookmark.blockId === blockId);
      }
      return !(bookmark.taskId === taskId && !bookmark.blockId);
    }));
  };

  const buildBookmarkLabel = (title: string) => `${(title || "未命名").slice(0, 2)}...`;

  const focusWorkbenchEntry = (entry: WorkbenchEntry, options?: { closePopup?: boolean }) => {
    if (options?.closePopup !== false) {
      setPendingPopup(null);
    }
    setBookmarkTip(null);
    bookmarkHoverTaskIdRef.current = null;
    if (!entry.blockId) {
      return;
    }
    suppressNextStatusTargetCacheRef.current = true;
    setActiveWorkbenchKey(entry.key);
    pendingFocusRef.current = {
      taskId: entry.taskId,
      blockId: entry.blockId,
      blockCursorOffset: entry.blockCursorOffset
    };

    // 如果不在当前页面，先跳转到对应页面
    if (entry.taskId !== task?.id) {
      onNavigate(entry.taskId, false);
    } else {
      // 在当前页面，直接滚动到文本块
      if (editor) {
        const found = scrollToBlock(editor, entry.blockId, entry.blockCursorOffset);
        if (found) {
          pendingFocusRef.current = null;
        }
      }
    }
  };

  const handleWorkbenchEntryClick = (entry: WorkbenchEntry) => {
    focusWorkbenchEntry(entry, { closePopup: true });
  };

  const clearStatusBlockFromTask = async (entry: WorkbenchEntry) => {
    if (!entry.blockId) {
      return;
    }
    if (entry.taskId === task?.id && editor) {
      clearStatusOnBlockById(editor, entry.blockId);
      return;
    }
    const detail = await window.api.invoke("task:get", { id: entry.taskId });
    if (!detail) {
      return;
    }
    const updated = updateBlockStatusInBlocks(detail.blocks, entry.blockId, {
      workStatus: null,
      workStatusUpdatedAt: null,
      plannedStartAt: null,
      plannedDurationMinutes: null,
      waitReason: "",
      waitReviewAt: null
    });
    if (!updated.changed) {
      return;
    }
    await window.api.invoke("task:update", { id: entry.taskId, blocks: updated.blocks });
  };

  const removeWorkbenchEntry = async (entry: WorkbenchEntry) => {
    try {
      await clearStatusBlockFromTask(entry);
    } catch (error) {
      alert(errorToMessage(error, "清除状态失败，请稍后重试"));
    }
  };

  const buildBookmarkPathText = (ancestorsChain: Task[], currentTitle: string) => {
    const fullPath = [...ancestorsChain.map((item) => item.title || "未命名"), currentTitle || "未命名"];
    const trimmedPath = fullPath.length > 1 ? fullPath.slice(1) : fullPath;
    return trimmedPath.join("/");
  };

  const showBookmarkTip = async (event: React.MouseEvent<HTMLButtonElement>, bookmark: WindowBookmark) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top - 8;
    bookmarkHoverTaskIdRef.current = bookmark.taskId;

    const cached = bookmarkPathCacheRef.current[bookmark.taskId];
    if (cached) {
      setBookmarkTip({ text: cached, x, y });
      return;
    }

    const fallback = bookmark.title || "未命名";
    setBookmarkTip({ text: fallback, x, y });
    try {
      const [ancestorsChain, taskDetail] = await Promise.all([
        window.api.invoke("task:getAncestors", { taskId: bookmark.taskId }),
        window.api.invoke("task:get", { id: bookmark.taskId })
      ]);
      const pathText = buildBookmarkPathText(ancestorsChain, taskDetail?.title || fallback);
      bookmarkPathCacheRef.current[bookmark.taskId] = pathText;
      if (bookmarkHoverTaskIdRef.current === bookmark.taskId) {
        setBookmarkTip({ text: pathText, x, y });
      }
    } catch {
      bookmarkPathCacheRef.current[bookmark.taskId] = fallback;
    }
  };

  const computeRemainingDurationMinutes = (target: {
    workStatus?: WorkStatus | null;
    workStatusUpdatedAt?: number | null;
    plannedDurationMinutes?: number | null;
  }) => {
    return computeRemainingStatusDurationMinutes({
      workStatus: target.workStatus ?? null,
      workStatusUpdatedAt: target.workStatusUpdatedAt ?? null,
      plannedDurationMinutes: target.plannedDurationMinutes ?? null
    });
  };

  const resolveDoingDurationMinutes = (current?: {
    workStatus?: WorkStatus | null;
    workStatusUpdatedAt?: number | null;
    plannedDurationMinutes?: number | null;
  }) => {
    return computeRemainingDurationMinutes(current ?? {}) ?? 25;
  };

  const applyDoingStatus = (blockId: string, current?: { plannedDurationMinutes?: number | null }) => {
    if (!editor) {
      return;
    }
    setStatusNow(Date.now());
    setStatusOnBlockById(editor, blockId, {
      workStatus: "doing",
      plannedDurationMinutes: current?.plannedDurationMinutes ?? null
    });
  };

  const openDoingModal = (
    blockId: string,
    current?: { workStatus?: WorkStatus | null; workStatusUpdatedAt?: number | null; plannedDurationMinutes?: number | null },
    options?: { submitImmediately?: boolean }
  ) => {
    const plannedDurationMinutes = resolveDoingDurationMinutes(current);
    if (options?.submitImmediately && editor) {
      setStatusNow(Date.now());
      const updated = setStatusOnBlockById(editor, blockId, {
        workStatus: "doing",
        plannedDurationMinutes
      });
      if (!updated) {
        alert("当前文本块已不存在，无法设置状态");
      }
      return;
    }
    setDoingModalState({
      blockId,
      plannedDurationMinutes
    });
  };

  const applyDoneStatus = (blockId: string) => {
    if (!editor) {
      return;
    }
    setStatusNow(Date.now());
    setStatusOnBlockById(editor, blockId, {
      workStatus: "done"
    });
  };

  const clearBlockStatus = (blockId: string) => {
    if (!editor) {
      return;
    }
    setStatusNow(Date.now());
    clearStatusOnBlockById(editor, blockId);
  };

  const openPlanModal = (blockId: string, current?: { plannedStartAt?: number | null; plannedDurationMinutes?: number | null }) => {
    setPlanModalState({
      blockId,
      plannedStartAt: current?.plannedStartAt ?? Date.now(),
      plannedDurationMinutes: current?.plannedDurationMinutes ?? 25
    });
  };

  const openWaitingModal = (
    blockId: string,
    current?: { waitReason?: string | null; waitReviewAt?: number | null; workStatus?: WorkStatus | null; workStatusUpdatedAt?: number | null; plannedDurationMinutes?: number | null }
  ) => {
    setWaitingModalState({
      blockId,
      waitReason: current?.waitReason ?? "",
      waitReviewAt: current?.waitReviewAt ?? null,
      plannedDurationMinutes: computeRemainingDurationMinutes(current ?? {})
    });
  };

  const getCurrentStatusTarget = () => {
    const cached = lastStatusTargetRef.current;
    if (!cached) {
      return null;
    }
    const latest = resolveStatusContextTargetAtCachedPosition(cached) ?? findStatusContextTargetById(cached.blockId);
    if (!latest) {
      lastStatusTargetRef.current = null;
      return null;
    }
    return cacheStatusContextTarget(latest);
  };

  const requireCurrentStatusTarget = () => {
    const target = getCurrentStatusTarget();
    if (!target) {
      alert("请先把光标放到要设置状态的文本行中");
      return null;
    }
    return target;
  };

  const quickOpenDoing = () => {
    const target = requireCurrentStatusTarget();
    if (!target) {
      return;
    }
    openDoingModal(
      target.blockId,
      {
        workStatus: target.workStatus,
        workStatusUpdatedAt: target.workStatusUpdatedAt,
        plannedDurationMinutes: target.plannedDurationMinutes
      },
      { submitImmediately: target.workStatus === "waiting" }
    );
  };

  const quickOpenWaiting = () => {
    const target = requireCurrentStatusTarget();
    if (!target) {
      return;
    }
    openWaitingModal(target.blockId, {
      waitReason: target.waitReason,
      waitReviewAt: target.waitReviewAt,
      workStatus: target.workStatus,
      workStatusUpdatedAt: target.workStatusUpdatedAt,
      plannedDurationMinutes: target.plannedDurationMinutes
    });
  };

  const quickOpenPlan = () => {
    const target = requireCurrentStatusTarget();
    if (!target) {
      return;
    }
    openPlanModal(target.blockId, {
      plannedStartAt: target.plannedStartAt,
      plannedDurationMinutes: target.plannedDurationMinutes
    });
  };

  const quickApplyDone = () => {
    const target = requireCurrentStatusTarget();
    if (!target) {
      return;
    }
    applyDoneStatus(target.blockId);
  };

  const quickSendCurrentBlockToCodex = () => {
    if (!editor || !task) {
      return;
    }
    const target = requireCurrentStatusTarget();
    if (!target) {
      return;
    }
    const node = editor.state.doc.nodeAt(target.blockPos);
    const blockText = node?.textContent.trim() ?? "";
    if (!blockText) {
      alert("当前文本块没有可发送内容");
      return;
    }
    void onSendBlockToCodex({
      task,
      blockId: target.blockId,
      blockText,
      blocks: editor.getJSON()
    });
  };

  const keepEditorSelectionOnToolbarMouseDown = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  const handleContextMenu = async (event: React.MouseEvent) => {
    event.preventDefault();
    if (!editor || !task) {
      return;
    }
    const target = event.target as HTMLElement;

    // 右键打开菜单时，将编辑器选择同步到鼠标点击位置
    if (editor.view.dom.contains(target)) {
      const candidatePositions: number[] = [];
      let current: HTMLElement | null = target;
      while (current && current !== editor.view.dom) {
        if (current.hasAttribute("data-node-id")) {
          try {
            candidatePositions.push(editor.view.posAtDOM(current, 0));
          } catch {
            // 忽略不可解析节点，继续向上查找
          }
        }
        current = current.parentElement;
      }

      let contextPos: number | null = null;
      for (const candidate of candidatePositions) {
        const resolved = resolveBlockAnchor(editor.state.doc, candidate);
        if (resolved) {
          contextPos = resolved.blockPos;
          break;
        }
      }
      if (contextPos === null) {
        const pos = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (typeof pos?.pos === "number") {
          const resolved = resolveBlockAnchor(editor.state.doc, pos.pos);
          contextPos = resolved ? resolved.blockPos : pos.pos;
        }
      }

      if (typeof contextPos === "number") {
        pendingBlockBookmarkPosRef.current = contextPos;
        const safePos = Math.max(1, Math.min(editor.state.doc.content.size, contextPos));
        const normalizedPos = Selection.near(editor.state.doc.resolve(safePos), 1).from;
        editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, normalizedPos)));
      }
    } else {
      pendingBlockBookmarkPosRef.current = null;
    }

    const linkEl = target.closest(".task-link-block") as HTMLElement | null;
    const toggleCheckedMenuItem = {
      label: showCheckedCheckboxBlocks ? "隐藏已打钩checkbox文本块" : "显示已打钩checkbox文本块",
      action: () => setShowCheckedCheckboxBlocks((prev) => !prev)
    };
    const addCurrentTaskBookmarkMenuItem = {
      label: "添加当前页到书签",
      action: addCurrentTaskBookmark
    };
    const canBookmarkCurrentTask = task.id !== rootTaskId;
    if (linkEl) {
      const taskId = linkEl.dataset.taskId;
      if (!taskId) {
        return;
      }
      const pos = editor.view.posAtDOM(linkEl, 0);
      const node = editor.state.doc.nodeAt(pos);
      const items = [
        ...(canBookmarkCurrentTask ? [addCurrentTaskBookmarkMenuItem] : []),
        {
          label: "添加子任务",
          action: appendChildTaskToEnd
        },
        {
          label: "打开子任务",
          action: () => onNavigate(taskId, false)
        },
        {
          label: "在新便签中打开",
          action: () => onOpenInNewWindow(taskId)
        },
        {
          label: "移动到...",
          action: () => {
            void onMoveChildReference(taskId);
          }
        },
        {
          label: "优先级",
          children: [
            {
              label: "高",
              action: () => {
                editor.chain().focus().updateAttributes("taskLink", { priority: "high" }).run();
              }
            },
            {
              label: "中",
              action: () => {
                editor.chain().focus().updateAttributes("taskLink", { priority: "medium" }).run();
              }
            },
            {
              label: "低",
              action: () => {
                editor.chain().focus().updateAttributes("taskLink", { priority: "low" }).run();
              }
            },
            {
              label: "无",
              action: () => {
                editor.chain().focus().updateAttributes("taskLink", { priority: null }).run();
              }
            }
          ]
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
      items.push(toggleCheckedMenuItem);
      onShowMenu({ x: event.clientX, y: event.clientY, items });
      return;
    }

    const { state } = editor;
    const { from, to, $from, $to } = state.selection;
    const rawText = state.doc.textBetween(from, to, "\n").trim();
    const canConvert = $from.sameParent($to) && !rawText.includes("\n");
    const insertableChildren = await onLoadInsertableChildren();
    const insertChildMenuItem =
      insertableChildren.length > 0
        ? {
            label: "插入子任务",
            children: insertableChildren.map((child) => ({
              label: child.title,
              action: () => {
                void onInsertExistingChildLink(child.id);
              }
            }))
          }
        : {
            label: "插入子任务",
            children: [{ label: "暂无可选子任务", disabled: true }]
          };

    // determine current node type for priority
    const currentNode = $from.parent;
    let nodeName = currentNode.type.name;
    // taskItem wrapper is actual item, but sometimes selection is in paragraph inside taskItem
    if (nodeName === "paragraph" && $from.node(-1)?.type.name === "taskItem") {
      nodeName = "taskItem";
    } else if (nodeName === "paragraph" && $from.node(-1)?.type.name === "listItem") {
      nodeName = "listItem";
    }
    const contextRawPos = typeof pendingBlockBookmarkPosRef.current === "number"
      ? pendingBlockBookmarkPosRef.current
      : editor.state.selection.from;
    const statusTarget = resolveStatusContextTarget(contextRawPos) ?? getStatusNodeSelectionSnapshot(editor);

    const priorityMenuItem = {
      label: "优先级",
      children: [
        {
          label: "高",
          action: () => {
            editor.chain().focus().updateAttributes(nodeName, { priority: "high" }).run();
          }
        },
        {
          label: "中",
          action: () => {
            editor.chain().focus().updateAttributes(nodeName, { priority: "medium" }).run();
          }
        },
        {
          label: "低",
          action: () => {
            editor.chain().focus().updateAttributes(nodeName, { priority: "low" }).run();
          }
        },
        {
          label: "无",
          action: () => {
            editor.chain().focus().updateAttributes(nodeName, { priority: null }).run();
          }
        }
      ]
    };

    const statusMenuItem = statusTarget
      ? {
          label: "状态标记...",
          children: [
            {
              label: "进行中",
              action: () => openDoingModal(
                statusTarget.blockId,
                {
                  workStatus: statusTarget.workStatus,
                  workStatusUpdatedAt: statusTarget.workStatusUpdatedAt,
                  plannedDurationMinutes: statusTarget.plannedDurationMinutes
                },
                { submitImmediately: statusTarget.workStatus === "waiting" }
              )
            },
            {
              label: "等待中...",
              action: () => openWaitingModal(statusTarget.blockId, {
                waitReason: statusTarget.waitReason,
                waitReviewAt: statusTarget.waitReviewAt,
                workStatus: statusTarget.workStatus,
                workStatusUpdatedAt: statusTarget.workStatusUpdatedAt,
                plannedDurationMinutes: statusTarget.plannedDurationMinutes
              })
            },
            {
              label: "待开始...",
              action: () => openPlanModal(statusTarget.blockId, {
                plannedStartAt: statusTarget.plannedStartAt,
                plannedDurationMinutes: statusTarget.plannedDurationMinutes
              })
            },
            {
              label: "已完成",
              action: () => applyDoneStatus(statusTarget.blockId)
            },
            {
              label: "清除状态",
              disabled: !statusTarget.workStatus,
              action: () => clearBlockStatus(statusTarget.blockId)
            }
          ]
        }
      : {
          label: "状态标记...",
          disabled: true
        };
    const codexMenuItems = statusTarget
      ? [
          {
            label: "用当前块追问 Codex",
            action: () => {
              const targetPos = "blockPos" in statusTarget ? statusTarget.blockPos : statusTarget.pos;
              const node = editor.state.doc.nodeAt(targetPos);
              const blockText = node?.textContent.trim() ?? "";
              if (!blockText) {
                alert("当前文本块没有可发送内容");
                return;
              }
              void onSendBlockToCodex({
                task,
                blockId: statusTarget.blockId,
                blockText,
                blocks: editor.getJSON()
              });
            }
          },
          {
            label: "打开本页 Codex 会话",
            disabled: !task.codexSessionId,
            action: () => {
              void onOpenCodexSession(task);
            }
          },
          {
            label: "清除本页 Codex 会话",
            disabled: !task.codexSessionId,
            action: () => {
              void onClearCodexSession(task);
            }
          }
        ]
      : [
          {
            label: "用当前块追问 Codex",
            disabled: true
          },
          {
            label: "打开本页 Codex 会话",
            disabled: !task.codexSessionId,
            action: () => {
              void onOpenCodexSession(task);
            }
          },
          {
            label: "清除本页 Codex 会话",
            disabled: !task.codexSessionId,
            action: () => {
              void onClearCodexSession(task);
            }
          }
        ];

    onShowMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        ...codexMenuItems,
        statusMenuItem,
        priorityMenuItem,
        ...(canBookmarkCurrentTask ? [addCurrentTaskBookmarkMenuItem] : []),
        insertChildMenuItem,
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
          : []),
        toggleCheckedMenuItem
      ]
    });
  };

  const today = new Date();
  const footerText = `今天, ${today.getMonth() + 1}月${today.getDate()}日`;
  const stickyBackground = hexToRgba(stickyColor, stickyOpacity);

  useEffect(() => {
    document.documentElement.style.setProperty("--sticky-panel-color", stickyBackground);
    return () => {
      document.documentElement.style.removeProperty("--sticky-panel-color");
    };
  }, [stickyBackground]);

  const taskBookmarks = bookmarks.filter((bookmark) => !bookmark.blockId);
  const allWorkbenchEntries = useMemo<WorkbenchEntry[]>(() => {
    return statusBlocks
      .filter((statusBlock) => statusBlock.workStatus !== "done")
      .map((statusBlock) => ({
        ...statusBlock,
        key: buildStatusBlockKey(statusBlock)
      }));
  }, [statusBlocks]);
  const visibleWorkbenchEntries = useMemo(() => {
    return allWorkbenchEntries
      .filter((entry) => entry.workStatus === workbenchTab)
      .slice()
      .sort((left, right) => compareStatusBlocks(left, right, statusNow));
  }, [allWorkbenchEntries, statusNow, workbenchTab]);
  const orderedWorkbenchEntries = useMemo(() => {
    return WORKBENCH_TAB_ORDER.flatMap((tab) =>
      allWorkbenchEntries
        .filter((entry) => entry.workStatus === tab)
        .slice()
        .sort((left, right) => compareStatusBlocks(left, right, statusNow))
    );
  }, [allWorkbenchEntries, statusNow]);
  const activeWorkbenchIndex = activeWorkbenchKey
    ? visibleWorkbenchEntries.findIndex((entry) => entry.key === activeWorkbenchKey)
    : -1;

  useEffect(() => {
    if (visibleWorkbenchEntries.length === 0) {
      if (activeWorkbenchKey !== null) {
        setActiveWorkbenchKey(null);
      }
      return;
    }
    if (activeWorkbenchKey && visibleWorkbenchEntries.some((entry) => entry.key === activeWorkbenchKey)) {
      return;
    }
    setActiveWorkbenchKey(visibleWorkbenchEntries[0].key);
  }, [activeWorkbenchKey, visibleWorkbenchEntries]);

  const focusWorkbenchByDelta = (delta: number) => {
    if (orderedWorkbenchEntries.length === 0) {
      return;
    }
    const keyList = orderedWorkbenchEntries.map((entry) => entry.key);
    const currentIndex = activeWorkbenchKey ? keyList.indexOf(activeWorkbenchKey) : -1;
    const nextIndex =
      currentIndex === -1
        ? delta >= 0 ? 0 : orderedWorkbenchEntries.length - 1
        : (currentIndex + delta + orderedWorkbenchEntries.length) % orderedWorkbenchEntries.length;
    const next = orderedWorkbenchEntries[nextIndex];
    if (!next) {
      return;
    }
    setWorkbenchTab(next.workStatus as WorkbenchTab);
    focusWorkbenchEntry(next, { closePopup: false });
  };

  if (!task) {
    return <div className="flex h-screen items-center justify-center bg-[#f6e8a6] text-[#2b2b2b]">加载中...</div>;
  }

  return (
    <div
      className={`sticky-surface flex h-screen flex-col px-3 py-2 text-[#2b2b2b]${showCheckedCheckboxBlocks ? "" : " sticky-hide-checked-blocks"}`}
      style={{ "--sticky-base": stickyBackground } as React.CSSProperties}
      onContextMenu={handleContextMenu}
      onClick={() => setPendingPopup(null)}
    >
      {pomodoroTip ? <div className="no-drag sticky-tip">{pomodoroTip}</div> : null}
      {bookmarkTip ? (
        <div className="no-drag sticky-bookmark-tip" style={{ left: bookmarkTip.x, top: bookmarkTip.y }}>
          {bookmarkTip.text}
        </div>
      ) : null}
      {pendingPopup ? (
        <div
          className="no-drag sticky-pending-popup"
          style={{ left: pendingPopup.x, top: pendingPopup.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="sticky-pending-tabs">
            <button
              type="button"
              className={`sticky-pending-tab${workbenchTab === "doing" ? " is-active" : ""}`}
              onClick={() => setWorkbenchTab("doing")}
            >
              进行中
            </button>
            <button
              type="button"
              className={`sticky-pending-tab${workbenchTab === "waiting" ? " is-active" : ""}`}
              onClick={() => setWorkbenchTab("waiting")}
            >
              等待中
            </button>
            <button
              type="button"
              className={`sticky-pending-tab${workbenchTab === "todo" ? " is-active" : ""}`}
              onClick={() => setWorkbenchTab("todo")}
            >
              待开始
            </button>
          </div>
          {visibleWorkbenchEntries.length === 0 ? (
            <div className="sticky-pending-empty">当前状态下没有文本块</div>
          ) : visibleWorkbenchEntries.map((entry, index) => {
            const isActive = activeWorkbenchKey === entry.key;
            const statusBadge = formatStatusBadge(entry, statusNow);
            return (
              <div
                key={entry.key}
                className={`sticky-pending-item${isActive ? " is-active" : ""}`}
              >
                <div className="sticky-pending-index" aria-hidden>
                  {index + 1}
                </div>
                <button
                  type="button"
                  className="sticky-pending-content"
                  onClick={() => handleWorkbenchEntryClick(entry)}
                  title={entry.blockContent}
                >
                  <div className={`sticky-pending-timing sticky-pending-timing-${entry.workStatus}`}>
                    {statusBadge}
                  </div>
                  <div className="sticky-pending-text">{entry.blockContent}</div>
                  <div className="sticky-pending-meta">
                    {entry.taskTitle}
                  </div>
                </button>
                <button
                  type="button"
                  className="sticky-pending-remove"
                  aria-label="清除状态"
                  onClick={() => {
                    void removeWorkbenchEntry(entry);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="drag-region sticky-titlebar">
        <div className="sticky-header">
          {isEditingHeaderTitle ? (
            <input
              className="input-field no-drag h-7 min-w-[180px] max-w-[320px] rounded-lg border-black/30 bg-white/65 px-2 py-1 text-sm font-semibold text-black"
              value={headerTitle}
              autoFocus
              onChange={(event) => setHeaderTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void commitHeaderTitle();
                }
                if (event.key === "Escape") {
                  skipHeaderCommitRef.current = true;
                  setHeaderTitle(task.title);
                  setIsEditingHeaderTitle(false);
                }
              }}
              onBlur={() => {
                void commitHeaderTitle();
              }}
            />
          ) : (
            <div
              className="select-none text-sm font-semibold"
              onDoubleClick={() => {
                setHeaderTitle(task.title);
                setIsEditingHeaderTitle(true);
              }}
              title="双击编辑标题"
            >
              {task.title}
            </div>
          )}
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
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1 flex items-center gap-1">
            <Breadcrumb ancestors={ancestors} current={task} onNavigate={onNavigate} />
            <PriorityDropdown editor={editor} variant="light" onNavigate={(taskId) => onNavigate(taskId, true)} currentTaskId={task.id} />
          </div>
          <HistoryNav
            variant="light"
            canBack={canHistoryBack}
            canForward={canHistoryForward}
            onBack={onHistoryBack}
            onForward={onHistoryForward}
          />
        </div>
        {taskBookmarks.length > 0 || allWorkbenchEntries.length > 0 ? (
          <div className="no-drag sticky-bookmark-strip" aria-label="书签栏">
            {taskBookmarks.map((bookmark) => (
              <div key={bookmark.taskId} className="sticky-bookmark-item">
                <button
                  type="button"
                  className="sticky-bookmark-link"
                  onMouseEnter={(event) => {
                    void showBookmarkTip(event, bookmark);
                  }}
                  onMouseLeave={() => {
                    bookmarkHoverTaskIdRef.current = null;
                    setBookmarkTip(null);
                  }}
                  onClick={() => {
                    bookmarkHoverTaskIdRef.current = null;
                    setBookmarkTip(null);
                    onNavigate(bookmark.taskId, false);
                  }}
                >
                  {buildBookmarkLabel(bookmark.title)}
                </button>
                <button
                  type="button"
                  className="sticky-bookmark-remove"
                  aria-label={`移除书签 ${bookmark.title}`}
                  onClick={() => removeBookmark(bookmark.taskId)}
                >
                  ×
                </button>
              </div>
            ))}
            {allWorkbenchEntries.length > 0 ? (
              <div className="sticky-bookmark-item">
                <button
                  type="button"
                  className="sticky-bookmark-link sticky-pending-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    const rect = event.currentTarget.getBoundingClientRect();
                    setPendingPopup((current) =>
                      current ? null : { x: rect.left, y: rect.bottom + 4 }
                    );
                  }}
                  title="状态工作台"
                >
                  状态 ({allWorkbenchEntries.length})
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div
        className={`sticky-editor scrollbar-hidden cursor-text ${isScrolling ? "sticky-scrollbar-visible" : ""}`}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            editor?.commands.focus();
          }
        }}
        onMouseDown={cacheStatusTargetFromEditorEvent}
        onScroll={() => {
          setIsScrolling(true);
          if (scrollTimer.current) {
            window.clearTimeout(scrollTimer.current);
          }
          scrollTimer.current = window.setTimeout(() => setIsScrolling(false), 3000);
        }}
      >
        <EditorContent key={task.id} editor={editor} />
      </div>
      <div className="flex items-center justify-between text-[11px] text-black/50">
        <span>{footerText}</span>
        <div className="no-drag sticky-status-quick-actions" aria-label="快捷设置状态">
          <button type="button" className="sticky-status-quick-btn" title="设置为进行中" onMouseDown={keepEditorSelectionOnToolbarMouseDown} onClick={quickOpenDoing}>
            ▶
          </button>
          <button type="button" className="sticky-status-quick-btn" title="设置为等待中" onMouseDown={keepEditorSelectionOnToolbarMouseDown} onClick={quickOpenWaiting}>
            ⏳
          </button>
          <button type="button" className="sticky-status-quick-btn" title="设置为待开始" onMouseDown={keepEditorSelectionOnToolbarMouseDown} onClick={quickOpenPlan}>
            ⏱
          </button>
          <button type="button" className="sticky-status-quick-btn" title="标记为已完成" onMouseDown={keepEditorSelectionOnToolbarMouseDown} onClick={quickApplyDone}>
            ✓
          </button>
          <button type="button" className="sticky-status-quick-btn" title="用当前块追问 Codex" onMouseDown={keepEditorSelectionOnToolbarMouseDown} onClick={quickSendCurrentBlockToCodex}>
            AI
          </button>
        </div>
        {orderedWorkbenchEntries.length > 0 ? (
          <div className="no-drag sticky-pending-focus-nav" aria-label="待处理聚焦跳转">
            <button
              type="button"
              className="sticky-pending-focus-btn"
              onClick={() => focusWorkbenchByDelta(-1)}
              title="上一个状态块"
            >
              ◀
            </button>
            <span className="sticky-pending-focus-text">
              状态 {activeWorkbenchKey ? Math.max(0, orderedWorkbenchEntries.findIndex((entry) => entry.key === activeWorkbenchKey)) + 1 : 0}/{orderedWorkbenchEntries.length}
            </span>
            <button
              type="button"
              className="sticky-pending-focus-btn"
              onClick={() => focusWorkbenchByDelta(1)}
              title="下一个状态块"
            >
              ▶
            </button>
          </div>
        ) : (
          <span>⋯</span>
        )}
      </div>
      <BlockPlanModal
        open={Boolean(planModalState)}
        initialStartAt={planModalState?.plannedStartAt ?? Date.now()}
        initialDurationMinutes={planModalState?.plannedDurationMinutes ?? 25}
        onCancel={() => setPlanModalState(null)}
        onSubmit={(value) => {
          if (!editor || !planModalState) {
            setPlanModalState(null);
            return;
          }
          setStatusNow(Date.now());
          const updated = setStatusOnBlockById(editor, planModalState.blockId, {
            workStatus: "todo",
            plannedStartAt: value.plannedStartAt,
            plannedDurationMinutes: value.plannedDurationMinutes
          });
          setPlanModalState(null);
          if (!updated) {
            alert("当前文本块已不存在，无法设置状态");
          }
        }}
      />
      <BlockDurationModal
        open={Boolean(doingModalState)}
        title="设置进行中"
        initialDurationMinutes={doingModalState?.plannedDurationMinutes ?? 25}
        onCancel={() => setDoingModalState(null)}
        onSubmit={(value) => {
          if (!editor || !doingModalState) {
            setDoingModalState(null);
            return;
          }
          setStatusNow(Date.now());
          const updated = setStatusOnBlockById(editor, doingModalState.blockId, {
            workStatus: "doing",
            plannedDurationMinutes: value.plannedDurationMinutes
          });
          setDoingModalState(null);
          if (!updated) {
            alert("当前文本块已不存在，无法设置状态");
          }
        }}
      />
      <BlockWaitingModal
        open={Boolean(waitingModalState)}
        initialReason={waitingModalState?.waitReason ?? ""}
        initialReviewAt={waitingModalState?.waitReviewAt ?? null}
        onCancel={() => setWaitingModalState(null)}
        onSubmit={(value) => {
          if (!editor || !waitingModalState) {
            setWaitingModalState(null);
            return;
          }
          setStatusNow(Date.now());
          const updated = setStatusOnBlockById(editor, waitingModalState.blockId, {
            workStatus: "waiting",
            plannedDurationMinutes: waitingModalState.plannedDurationMinutes,
            waitReason: value.waitReason,
            waitReviewAt: value.waitReviewAt
          });
          setWaitingModalState(null);
          if (!updated) {
            alert("当前文本块已不存在，无法设置状态");
          }
        }}
      />
    </div>
  );
}
