import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Task, WindowBookmark } from "../shared/types";
import ContextMenu, { ContextMenuState } from "./components/ContextMenu";
import LibraryPanel, { TaskTreeNode } from "./components/LibraryPanel";
import ReminderModal from "./components/ReminderModal";
import StickyView from "./components/StickyView";
import TaskDetail from "./components/TaskDetail";
import TitleBar from "./components/TitleBar";
import PromptModal from "./components/PromptModal";
import { useAppStore, type LibraryTab } from "./store/useAppStore";
import { appendTaskLinkToBlocksEnd, removeTaskLinksByTaskId } from "../shared/taskBlocksSync";

interface Props {
  windowId: string;
  rootTaskId: string;
  windowType: "library" | "sticky";
}

const matchesTabFilter = (task: Task, tab: LibraryTab) => {
  if (tab === "inProgress") {
    return !task.isCompleted && !task.isArchived && !task.isDeleted;
  }
  if (tab === "completed") {
    return task.isCompleted && !task.isArchived && !task.isDeleted;
  }
  if (tab === "deleted") {
    return task.isDeleted;
  }
  return task.isArchived && !task.isDeleted;
};

const shouldShowInTab = (task: Task, tab: LibraryTab) => {
  if (tab === "deleted") {
    return task.isDeleted;
  }
  if (tab === "archived") {
    return task.isArchived && !task.isDeleted;
  }
  return !task.isArchived && !task.isDeleted;
};

const shouldIncludeRoot = (task: Task, tab: LibraryTab) => {
  if (tab === "inProgress") {
    return !task.isCompleted && !task.isArchived && !task.isDeleted;
  }
  if (tab === "completed") {
    return task.isCompleted && !task.isArchived && !task.isDeleted;
  }
  if (tab === "deleted") {
    return task.isDeleted;
  }
  return task.isArchived && !task.isDeleted;
};

const filterTreeNode = (node: TaskTreeNode, tab: LibraryTab): TaskTreeNode | null => {
  if (!shouldShowInTab(node.task, tab)) {
    return null;
  }
  const children = node.children
    .map((child) => filterTreeNode(child, tab))
    .filter((child): child is TaskTreeNode => Boolean(child));
  return { task: node.task, children };
};

const filterTaskTreeByTab = (nodes: TaskTreeNode[], tab: LibraryTab): TaskTreeNode[] => {
  return nodes.flatMap((node) => {
    if (!shouldIncludeRoot(node.task, tab)) {
      return [];
    }
    const filtered = filterTreeNode(node, tab);
    return filtered ? [filtered] : [];
  });
};

export default function App({ windowId, rootTaskId, windowType }: Props) {
  const api = window.api;
  const {
    navPath,
    currentTask,
    ancestors,
    libraryTasks,
    taskTree,
    searchQuery,
    reminders,
    windowSettings,
    libraryTab,
    setNavPath,
    setCurrentTask,
    setAncestors,
    setLibraryTasks,
    setTaskTree,
    setSearchQuery,
    setReminders,
    setLibraryTab,
    updateWindowSettings
  } = useAppStore();
  if (!api) {
    return <div className="panel-card flex h-full items-center justify-center">请在桌面应用中运行</div>;
  }
  const { opacity, alwaysOnTop, stickyColor, stickyOpacity } = windowSettings;
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [promptState, setPromptState] = useState<{
    title: string;
    placeholder?: string;
    defaultValue?: string;
    resolve: (value: string | null) => void;
  } | null>(null);
  const [history, setHistory] = useState<{ stack: string[]; index: number }>({ stack: [], index: -1 });
  const [stickyBookmarks, setStickyBookmarks] = useState<WindowBookmark[]>([]);
  const historyRef = useRef(history);
  const searchTimer = useRef<number | null>(null);
  const currentTaskIdRef = useRef<string | null>(null);
  const navPathRef = useRef<string[]>([]);
  const loadTaskRequestIdRef = useRef(0);
  const refreshLibraryRequestIdRef = useRef(0);

  const currentTaskId = navPath[navPath.length - 1];
  useEffect(() => {
    currentTaskIdRef.current = currentTaskId ?? null;
  }, [currentTaskId]);
  useEffect(() => {
    navPathRef.current = navPath;
  }, [navPath]);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const requestTitle = (options: { title: string; placeholder?: string; defaultValue?: string }) => {
    return new Promise<string | null>((resolve) => {
      setPromptState({ ...options, resolve });
    });
  };

  const errorToMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return fallback;
  };

  const validateUniqueTitle = async (title: string, excludeTaskId?: string) => {
    const result = await api.invoke("task:validateUniqueTitle", { title, excludeTaskId });
    if (!result.ok) {
      throw new Error(result.message || `任务标题“${result.normalizedTitle}”已存在`);
    }
    return result.normalizedTitle || title.trim();
  };

  const renameTask = async (taskId: string, title: string) => {
    const normalizedTitle = await validateUniqueTitle(title, taskId);
    await api.invoke("task:update", { id: taskId, title: normalizedTitle });
    if (windowType === "library") {
      await refreshLibrary(searchQuery, libraryTab);
    }
    if (currentTaskIdRef.current === taskId) {
      await loadTask(taskId);
    }
  };

  const loadInsertableChildren = async () => {
    if (!currentTask) {
      return [] as Task[];
    }
    const children = await api.invoke("task:listChildrenFlat", {
      parentId: currentTask.id,
      includeArchived: false,
      includeDeleted: false
    });
    return children;
  };

  const selectTaskFromCandidates = async (
    candidates: Task[],
    options?: { title?: string; placeholder?: string; listTitle?: string }
  ) => {
    if (candidates.length === 0) {
      return null;
    }
    const lines = candidates.map((task, index) => `${index + 1}. ${task.title}`).join("\n");
    const raw = await requestTitle({
      title: options?.title ?? "选择任务",
      placeholder: options?.placeholder,
      defaultValue: `1\n\n${options?.listTitle ?? "可选任务"}：\n${lines}`
    });
    if (!raw) {
      return null;
    }
    const firstLine = raw.split("\n")[0]?.trim() ?? "";
    const byIndex = Number(firstLine);
    if (!Number.isNaN(byIndex) && byIndex >= 1 && byIndex <= candidates.length) {
      return candidates[byIndex - 1];
    }
    const normalized = firstLine.toLowerCase();
    return candidates.find((task) => task.title.trim().toLowerCase() === normalized) ?? null;
  };

  const insertExistingChildLink = async (childId: string) => {
    if (!currentTask || !childId) {
      return;
    }
    await api.invoke("task:insertExistingChildLink", { parentId: currentTask.id, childId });
    await loadTask(currentTask.id);
  };

  const moveChildReference = async (childId: string) => {
    if (!currentTask) {
      return;
    }
    const candidateParents = await api.invoke("task:listRoots", {
      includeArchived: false,
      includeDeleted: false
    });
    const options = candidateParents.filter((task) => task.id !== currentTask.id && task.id !== childId);
    if (options.length === 0) {
      alert("暂无可移动到的目标父任务");
      return;
    }
    const target = await selectTaskFromCandidates(options, {
      title: "移动到...",
      placeholder: "输入目标父任务序号或完整标题",
      listTitle: "目标父任务"
    });
    if (!target) {
      alert("未找到目标父任务");
      return;
    }
    try {
      await api.invoke("task:moveChildReference", {
        sourceParentId: currentTask.id,
        targetParentId: target.id,
        childId
      });
    } catch (error) {
      alert(errorToMessage(error, "移动子任务引用失败"));
      return;
    }
    await loadTask(currentTask.id);
    if (windowType === "library") {
      await refreshLibrary(searchQuery, libraryTab);
    }
  };

  const moveTaskInTree = async (input: { taskId: string; targetParentId?: string }) => {
    const { taskId, targetParentId } = input;
    if (!taskId) {
      return;
    }
    const parents = await api.invoke("task:listParents", { childId: taskId });
    const fromParentId = parents[0]?.id;
    if (fromParentId === targetParentId) {
      return;
    }
    try {
      await api.invoke("edge:reparent", { childId: taskId, fromParentId, toParentId: targetParentId });
    } catch (error) {
      alert(errorToMessage(error, "拖拽调整层级失败"));
      return;
    }

    if (fromParentId) {
      const fromParent = await api.invoke("task:get", { id: fromParentId });
      if (fromParent) {
        const removed = removeTaskLinksByTaskId(fromParent.blocks, taskId);
        if (removed.changed) {
          await api.invoke("task:update", { id: fromParent.id, blocks: removed.blocks });
        }
      }
    }

    if (targetParentId) {
      const targetParent = await api.invoke("task:get", { id: targetParentId });
      const moved = await api.invoke("task:get", { id: taskId });
      if (targetParent && moved) {
        const appended = appendTaskLinkToBlocksEnd(targetParent.blocks, {
          taskId: moved.id,
          title: moved.title,
          isCompleted: moved.isCompleted
        });
        if (appended.changed) {
          await api.invoke("task:update", { id: targetParent.id, blocks: appended.blocks });
        }
      }
    }

    if (windowType === "library") {
      await refreshLibrary(searchQuery, libraryTab);
    }
    if (currentTaskIdRef.current) {
      await loadTask(currentTaskIdRef.current);
    }
  };

  const toggleLinkedTaskComplete = async (taskId: string, nextCompleted: boolean) => {
    await api.invoke("task:update", { id: taskId, isCompleted: nextCompleted });
    if (windowType === "library") {
      await refreshLibrary(searchQuery, libraryTab);
    }
    if (currentTaskIdRef.current === taskId || currentTaskIdRef.current === currentTask?.id) {
      const currentId = currentTaskIdRef.current;
      if (currentId) {
        await loadTask(currentId);
      }
    }
    if (currentTask && currentTask.id !== taskId) {
      await loadTask(currentTask.id);
    }
  };

  const refreshLibrary = async (query = searchQuery, tab = libraryTab) => {
    const requestId = ++refreshLibraryRequestIdRef.current;
    const trimmed = query.trim();
    if (trimmed) {
      const includeArchived = tab === "archived" || tab === "deleted";
      const includeDeleted = tab === "deleted";
      const results = await api.invoke("task:search", { query: trimmed, includeArchived, includeDeleted });
      if (requestId !== refreshLibraryRequestIdRef.current) {
        return;
      }
      const filtered = results.filter((task) => matchesTabFilter(task, tab));
      setLibraryTasks(filtered);
      setTaskTree([]);
      return;
    }
    const roots = await api.invoke("task:listRoots", { includeArchived: true, includeDeleted: true });
    if (requestId !== refreshLibraryRequestIdRef.current) {
      return;
    }
    const visited = new Set<string>();
    const buildNode = async (task: Task): Promise<TaskTreeNode> => {
      if (visited.has(task.id)) {
        return { task, children: [] };
      }
      visited.add(task.id);
      const children = await api.invoke("task:listChildren", {
        parentId: task.id,
        includeArchived: true,
        includeDeleted: true
      });
      const childNodes: TaskTreeNode[] = [];
      for (const child of children) {
        childNodes.push(await buildNode(child));
      }
      return { task, children: childNodes };
    };
    const treeNodes: TaskTreeNode[] = [];
    for (const root of roots) {
      treeNodes.push(await buildNode(root));
    }
    if (requestId !== refreshLibraryRequestIdRef.current) {
      return;
    }
    const filteredTree = filterTaskTreeByTab(treeNodes, tab);
    setLibraryTasks([]);
    setTaskTree(filteredTree);
  };

  const loadTask = async (taskId: string) => {
    const requestId = ++loadTaskRequestIdRef.current;
    const task = await api.invoke("task:get", { id: taskId });
    if (requestId !== loadTaskRequestIdRef.current) {
      return;
    }
    if (!task) {
      setCurrentTask(null);
      return;
    }
    const chain = await api.invoke("task:getAncestors", { taskId });
    if (requestId !== loadTaskRequestIdRef.current) {
      return;
    }
    setCurrentTask(task);
    setAncestors(chain);
  };

  const syncWindowState = (nextPath: string[]) => {
    api.invoke("window:updateState", {
      windowId,
      rootTaskId: nextPath[0] ?? rootTaskId,
      navPathTaskIds: nextPath
    });
  };

  const pushHistory = (taskId: string) => {
    if (!taskId) {
      return;
    }
    const prev = historyRef.current;
    if (prev.stack[prev.index] === taskId) {
      return;
    }
    const trimmed = prev.stack.slice(0, prev.index + 1);
    const next = { stack: [...trimmed, taskId], index: trimmed.length };
    historyRef.current = next;
    setHistory(next);
  };

  const navigateToTask = async (taskId: string, reset: boolean, recordHistory = true) => {
    if (reset) {
      const chain = await api.invoke("task:getAncestors", { taskId });
      const nextPath = [...chain.map((task) => task.id), taskId];
      setNavPath(nextPath);
      syncWindowState(nextPath);
      await loadTask(taskId);
      if (recordHistory) {
        pushHistory(taskId);
      }
      return;
    }
    const nextPath = [...navPathRef.current, taskId];
    setNavPath(nextPath);
    syncWindowState(nextPath);
    await loadTask(taskId);
    if (recordHistory) {
      pushHistory(taskId);
    }
  };

  const handleNavigate = async (taskId: string, reset: boolean) => {
    await navigateToTask(taskId, reset, true);
  };

  const handleHistoryBack = async () => {
    const prev = historyRef.current;
    if (prev.index <= 0) {
      return;
    }
    const next = { ...prev, index: prev.index - 1 };
    historyRef.current = next;
    setHistory(next);
    await navigateToTask(next.stack[next.index], true, false);
  };

  const handleHistoryForward = async () => {
    const prev = historyRef.current;
    if (prev.index >= prev.stack.length - 1) {
      return;
    }
    const next = { ...prev, index: prev.index + 1 };
    historyRef.current = next;
    setHistory(next);
    await navigateToTask(next.stack[next.index], true, false);
  };

  const handleBackFromRef = async () => {
    if (historyRef.current.index > 0) {
      await handleHistoryBack();
      return;
    }
    const path = navPathRef.current;
    if (path.length <= 1) {
      return;
    }
    const nextPath = path.slice(0, -1);
    setNavPath(nextPath);
    syncWindowState(nextPath);
    await loadTask(nextPath[nextPath.length - 1]);
  };

  const handleCreateRoot = async () => {
    try {
      const input = await requestTitle({ title: "新任务标题", placeholder: "请输入任务标题" });
      const title = input && input.trim() ? input.trim() : `新任务 ${new Date().toLocaleTimeString()}`;
      await validateUniqueTitle(title);
      const task = await api.invoke("task:create", { title });
      await refreshLibrary();
      await handleNavigate(task.id, true);
    } catch (error) {
      alert(errorToMessage(error, "创建任务失败，请稍后重试"));
    }
  };

  const handleLibraryMenu = (event: React.MouseEvent, task: Task) => {
    event.preventDefault();
    const restoreItem = task.isDeleted
      ? [
          {
            label: "从回收站恢复",
            action: async () => {
              await api.invoke("task:restore", { id: task.id });
              await refreshLibrary();
            }
          }
        ]
      : [];
    setMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        {
          label: "添加子任务",
          action: async () => {
            try {
              const input = await requestTitle({ title: "子任务标题", placeholder: "请输入子任务标题" });
              const title = input?.trim() || `新子任务 ${new Date().toLocaleTimeString()}`;
              await validateUniqueTitle(title);
              const child = await api.invoke("task:createFromBlock", { parentId: task.id, title });
              const parent = await api.invoke("task:get", { id: task.id });
              if (parent) {
                const appended = appendTaskLinkToBlocksEnd(parent.blocks, {
                  taskId: child.id,
                  title: child.title,
                  isCompleted: child.isCompleted
                });
                if (appended.changed) {
                  await api.invoke("task:update", { id: task.id, blocks: appended.blocks });
                }
              }
              await refreshLibrary();
            } catch (error) {
              console.error("添加子任务失败", error);
              alert(errorToMessage(error, "添加子任务失败，请稍后重试"));
            }
          }
        },
        {
          label: "打开置顶便签",
          action: () => api.invoke("window:open", { rootTaskId: task.id, windowType: "sticky" })
        },
        {
          label: "归档已完成子任务",
          action: async () => {
            const confirmed = window.confirm("将归档该任务下所有已完成子任务，并移除正文链接块，是否继续？");
            if (!confirmed) {
              return;
            }
            const result = await api.invoke("task:archiveCompletedChildren", { parentId: task.id });
            if (result.archivedIds.length === 0) {
              alert("没有可归档的已完成子任务");
              return;
            }
            await refreshLibrary();
            if (currentTaskIdRef.current === task.id) {
              await loadTask(task.id);
            }
            alert(`已归档 ${result.archivedIds.length} 个子任务`);
          }
        },
        {
          label: task.isArchived ? "取消归档" : "归档",
          action: async () => {
            await api.invoke("task:update", { id: task.id, isArchived: !task.isArchived });
            await refreshLibrary();
          }
        },
        {
          label: task.isCompleted ? "标记为未完成" : "标记为完成",
          action: async () => {
            await api.invoke("task:update", { id: task.id, isCompleted: !task.isCompleted });
            await refreshLibrary();
          }
        },
        {
          label: "重命名",
          action: async () => {
            const title = (await requestTitle({ title: "新的标题", defaultValue: task.title }))?.trim();
            if (!title) {
              return;
            }
            try {
              await renameTask(task.id, title);
            } catch (error) {
              alert(errorToMessage(error, "重命名失败，请稍后重试"));
            }
          }
        },
        {
          label: "删除到回收站",
          action: async () => {
            await api.invoke("task:delete", { id: task.id });
            await refreshLibrary();
          }
        },
        ...restoreItem
      ]
    });
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimer.current) {
      window.clearTimeout(searchTimer.current);
    }
    searchTimer.current = window.setTimeout(() => {
      refreshLibrary(value, libraryTab);
    }, 300);
  };

  const handleCreateChildFromBlock = async (title: string) => {
    if (!currentTask) {
      return { taskId: "", title: "", isCompleted: false };
    }
    await validateUniqueTitle(title);
    const task = await api.invoke("task:createFromBlock", { parentId: currentTask.id, title });
    await loadTask(currentTask.id);
    return { taskId: task.id, title: task.title, isCompleted: task.isCompleted };
  };

  useEffect(() => {
    const init = async () => {
      const state = await api.invoke("window:getState", { windowId });
      if (state) {
        setNavPath(state.navPathTaskIds);
        setStickyBookmarks(Array.isArray(state.stickyBookmarks) ? state.stickyBookmarks : []);
        updateWindowSettings({
          opacity: state.opacity,
          alwaysOnTop: state.alwaysOnTop,
          stickyColor: state.stickyColor ?? "#f6e8a6",
          stickyOpacity: state.stickyOpacity ?? 1
        });
        const lastTaskId = state.navPathTaskIds[state.navPathTaskIds.length - 1];
        const firstBookmarkTaskId = Array.isArray(state.stickyBookmarks) && state.stickyBookmarks.length > 0 ? state.stickyBookmarks[0].taskId : null;
        if (!state.rootTaskId && firstBookmarkTaskId) {
          api.invoke("window:updateState", { windowId, rootTaskId: firstBookmarkTaskId });
        }
        await loadTask(lastTaskId);
        pushHistory(lastTaskId);
      } else {
        const initialPath = [rootTaskId];
        setNavPath(initialPath);
        setStickyBookmarks([]);
        syncWindowState(initialPath);
        await loadTask(rootTaskId);
        pushHistory(rootTaskId);
      }
      if (windowType === "library") {
        await refreshLibrary();
      }
    };

    init();

    const offUpdated = api.on("task:updated", ({ taskId }) => {
      if (taskId === currentTaskIdRef.current) {
        loadTask(taskId);
      }
      if (windowType === "library") {
        const { searchQuery: nextQuery, libraryTab: nextTab } = useAppStore.getState();
        refreshLibrary(nextQuery, nextTab);
      }
    });

    const offDeleted = api.on("task:deleted", ({ taskId }) => {
      if (taskId === currentTaskIdRef.current) {
        handleBackFromRef();
      }
      if (windowType === "library") {
        const { searchQuery: nextQuery, libraryTab: nextTab } = useAppStore.getState();
        refreshLibrary(nextQuery, nextTab);
      }
    });

    const offReminder = api.on("reminder:trigger", ({ reminders }) => {
      setReminders(reminders);
    });
    const offSettings = api.on("window:settings-updated", (payload) => {
      if (payload.windowId !== windowId) {
        return;
      }
      const next: Partial<typeof windowSettings> = {};
      if (typeof payload.stickyColor === "string") {
        next.stickyColor = payload.stickyColor;
      }
      if (typeof payload.stickyOpacity === "number") {
        next.stickyOpacity = payload.stickyOpacity;
      }
      if (typeof payload.opacity === "number") {
        next.opacity = payload.opacity;
      }
      if (typeof payload.alwaysOnTop === "boolean") {
        next.alwaysOnTop = payload.alwaysOnTop;
      }
      if (Object.keys(next).length > 0) {
        updateWindowSettings(next);
      }
    });

    const offStickyShared = api.on("window:sticky-shared-updated", (payload) => {
      if (windowType !== "sticky" || payload.rootTaskId !== rootTaskId) {
        return;
      }
      if (Array.isArray(payload.stickyBookmarks)) {
        setStickyBookmarks(payload.stickyBookmarks);
      }
      const next: Partial<typeof windowSettings> = {};
      if (typeof payload.stickyColor === "string") {
        next.stickyColor = payload.stickyColor;
      }
      if (typeof payload.stickyOpacity === "number") {
        next.stickyOpacity = payload.stickyOpacity;
      }
      if (Object.keys(next).length > 0) {
        updateWindowSettings(next);
      }
    });

    return () => {
      offUpdated();
      offDeleted();
      offReminder();
      offSettings();
      offStickyShared();
    };
  }, []);

  useEffect(() => {
    if (windowType === "library") {
      refreshLibrary(searchQuery, libraryTab);
    }
  }, [libraryTab]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) {
        return;
      }
      if (event.key === "ArrowLeft") {
        if (historyRef.current.index > 0) {
          event.preventDefault();
          void handleHistoryBack();
        }
      }
      if (event.key === "ArrowRight") {
        if (historyRef.current.index < historyRef.current.stack.length - 1) {
          event.preventDefault();
          void handleHistoryForward();
        }
      }
    };
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, []);

  const titleText = useMemo(() => currentTask?.title ?? "未选择任务", [currentTask?.title]);
  const canHistoryBack = history.index > 0;
  const canHistoryForward = history.index >= 0 && history.index < history.stack.length - 1;

  if (windowType === "sticky") {
    return (
      <div className="h-screen overflow-hidden" onClick={() => setMenu(null)}>
        <StickyView
          windowId={windowId}
          task={currentTask}
          ancestors={ancestors}
          onNavigate={handleNavigate}
          onHistoryBack={handleHistoryBack}
          onHistoryForward={handleHistoryForward}
          canHistoryBack={canHistoryBack}
          canHistoryForward={canHistoryForward}
          onOpenInNewWindow={(taskId) => api.invoke("window:open", { rootTaskId: taskId, windowType: "sticky" })}
          onCreateChildFromBlock={handleCreateChildFromBlock}
          onLoadInsertableChildren={loadInsertableChildren}
          onInsertExistingChildLink={insertExistingChildLink}
          onMoveChildReference={moveChildReference}
          onToggleLinkedTaskComplete={toggleLinkedTaskComplete}
          onRenameTaskTitle={renameTask}
          onRequestTitle={requestTitle}
          onShowMenu={setMenu}
          isPinned={alwaysOnTop}
          onTogglePin={() => {
            const next = !alwaysOnTop;
            updateWindowSettings({ alwaysOnTop: next });
            api.invoke("window:updateState", { windowId, alwaysOnTop: next });
          }}
          onClose={() => api.invoke("window:close", { windowId })}
          stickyColor={stickyColor}
          stickyOpacity={stickyOpacity}
          bookmarks={stickyBookmarks}
          onBookmarksChange={(nextBookmarks) => {
            setStickyBookmarks(nextBookmarks);
            api.invoke("window:updateState", { windowId, stickyBookmarks: nextBookmarks });
          }}
        />
        <ContextMenu menu={menu} onClose={() => setMenu(null)} />
      </div>
    );
  }

  const libraryNodes = searchQuery.trim() ? libraryTasks.map((task) => ({ task, children: [] })) : taskTree;

  return (
    <div className="app-shell h-screen" onClick={() => setMenu(null)}>
      <div className="app-layer flex h-full flex-col">
        <TitleBar
          windowId={windowId}
          title={titleText}
          alwaysOnTop={alwaysOnTop}
          opacity={opacity}
          onToggleAlwaysOnTop={() => {
            const next = !alwaysOnTop;
            updateWindowSettings({ alwaysOnTop: next });
            api.invoke("window:updateState", { windowId, alwaysOnTop: next });
          }}
          onOpacityChange={(value) => {
            const next = Math.min(1, Math.max(0.3, value));
            updateWindowSettings({ opacity: next });
            api.invoke("window:updateState", { windowId, opacity: next });
          }}
          showAdvancedControls={false}
        />
        <div className="flex flex-1 flex-col gap-5 p-5 lg:flex-row">
          <div className="w-full shrink-0 lg:w-[340px]">
            <LibraryPanel
              nodes={libraryNodes}
              onOpenTask={(taskId) => handleNavigate(taskId, true)}
              onCreateRoot={handleCreateRoot}
              onContextMenu={handleLibraryMenu}
              onRenameTask={async (task, title) => {
                await renameTask(task.id, title);
              }}
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              onQuickAdd={async (title) => {
                try {
                  await validateUniqueTitle(title);
                  const task = await api.invoke("task:create", { title });
                  await refreshLibrary(searchQuery, libraryTab);
                  await handleNavigate(task.id, true);
                } catch (error) {
                  alert(errorToMessage(error, "创建任务失败，请稍后重试"));
                }
              }}
              onToggleComplete={async (task) => {
                await api.invoke("task:update", { id: task.id, isCompleted: !task.isCompleted });
                await refreshLibrary(searchQuery, libraryTab);
                if (currentTaskIdRef.current === task.id) {
                  await loadTask(task.id);
                }
              }}
              onMoveTask={(input) => {
                void moveTaskInTree(input);
              }}
              activeTab={libraryTab}
              onTabChange={(tab) => setLibraryTab(tab)}
            />
          </div>
        <div className="flex-1">
          <TaskDetail
            task={currentTask}
            ancestors={ancestors}
            onNavigate={handleNavigate}
            onHistoryBack={handleHistoryBack}
            onHistoryForward={handleHistoryForward}
            canHistoryBack={canHistoryBack}
            canHistoryForward={canHistoryForward}
            onOpenInNewWindow={(taskId) => api.invoke("window:open", { rootTaskId: taskId, windowType: "sticky" })}
            onUpdateBlocks={(blocks) => currentTask && api.invoke("task:update", { id: currentTask.id, blocks })}
            onCreateChildFromBlock={handleCreateChildFromBlock}
            onLoadInsertableChildren={loadInsertableChildren}
            onInsertExistingChildLink={insertExistingChildLink}
            onMoveChildReference={moveChildReference}
            onToggleLinkedTaskComplete={toggleLinkedTaskComplete}
            onRenameTaskTitle={renameTask}
            onRequestTitle={requestTitle}
            onShowMenu={setMenu}
            />
          </div>
        </div>
      </div>
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
      <PromptModal
        open={Boolean(promptState)}
        title={promptState?.title ?? ""}
        placeholder={promptState?.placeholder}
        defaultValue={promptState?.defaultValue}
        onSubmit={(value) => {
          const resolve = promptState?.resolve;
          setPromptState(null);
          resolve?.(value || null);
        }}
        onCancel={() => {
          const resolve = promptState?.resolve;
          setPromptState(null);
          resolve?.(null);
        }}
      />
      <ReminderModal reminders={reminders} onClose={() => setReminders([])} onOpenTask={(taskId) => handleNavigate(taskId, true)} />
    </div>
  );
}
