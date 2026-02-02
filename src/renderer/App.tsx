import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Task } from "../shared/types";
import ContextMenu, { ContextMenuState } from "./components/ContextMenu";
import LibraryPanel, { TaskTreeNode } from "./components/LibraryPanel";
import ReminderModal from "./components/ReminderModal";
import StickyView from "./components/StickyView";
import TaskDetail from "./components/TaskDetail";
import TitleBar from "./components/TitleBar";
import { useAppStore, type LibraryTab } from "./store/useAppStore";

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

const filterTaskTree = (
  nodes: TaskTreeNode[],
  predicate: (task: Task, isRoot: boolean) => boolean,
  depth = 0
): TaskTreeNode[] => {
  return nodes.reduce<TaskTreeNode[]>((acc, node) => {
    const filteredChildren = filterTaskTree(node.children, predicate, depth + 1);
    const includeSelf = predicate(node.task, depth === 0);
    if (includeSelf || filteredChildren.length > 0) {
      acc.push({ task: node.task, children: filteredChildren });
    }
    return acc;
  }, []);
};

const shouldIncludeInTree = (task: Task, tab: LibraryTab, isRoot: boolean) => {
  if (tab === "inProgress") {
    return isRoot ? !task.isCompleted && !task.isArchived && !task.isDeleted : !task.isArchived && !task.isDeleted;
  }
  if (tab === "completed") {
    return isRoot ? task.isCompleted && !task.isArchived && !task.isDeleted : !task.isArchived && !task.isDeleted;
  }
  if (tab === "deleted") {
    return task.isDeleted;
  }
  return task.isArchived && !task.isDeleted;
};

export default function App({ windowId, rootTaskId, windowType }: Props) {
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
  const { opacity, alwaysOnTop, stickyColor, stickyOpacity } = windowSettings;
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const searchTimer = useRef<number | null>(null);
  const currentTaskIdRef = useRef<string | null>(null);
  const navPathRef = useRef<string[]>([]);

  const currentTaskId = navPath[navPath.length - 1];
  useEffect(() => {
    currentTaskIdRef.current = currentTaskId ?? null;
  }, [currentTaskId]);
  useEffect(() => {
    navPathRef.current = navPath;
  }, [navPath]);

  const refreshLibrary = async (query = searchQuery, tab = libraryTab) => {
    const trimmed = query.trim();
    if (trimmed) {
      const includeArchived = tab === "archived" || tab === "deleted";
      const includeDeleted = tab === "deleted";
      const results = await window.api.invoke("task:search", { query: trimmed, includeArchived, includeDeleted });
      const filtered = results.filter((task) => matchesTabFilter(task, tab));
      setLibraryTasks(filtered);
      setTaskTree([]);
      return;
    }
    const roots = await window.api.invoke("task:listRoots", { includeArchived: true, includeDeleted: true });
    const visited = new Set<string>();
    const buildNode = async (task: Task): Promise<TaskTreeNode> => {
      if (visited.has(task.id)) {
        return { task, children: [] };
      }
      visited.add(task.id);
      const children = await window.api.invoke("task:listChildren", {
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
    const filteredTree = filterTaskTree(treeNodes, (task, isRoot) => shouldIncludeInTree(task, tab, isRoot));
    setLibraryTasks([]);
    setTaskTree(filteredTree);
  };

  const loadTask = async (taskId: string) => {
    const task = await window.api.invoke("task:get", { id: taskId });
    if (!task) {
      setCurrentTask(null);
      return;
    }
    const chain = await window.api.invoke("task:getAncestors", { taskId });
    setCurrentTask(task);
    setAncestors(chain);
  };

  const syncWindowState = (nextPath: string[]) => {
    window.api.invoke("window:updateState", {
      windowId,
      rootTaskId: nextPath[0] ?? rootTaskId,
      navPathTaskIds: nextPath
    });
  };

  const handleNavigate = async (taskId: string, reset: boolean) => {
    if (reset) {
      const chain = await window.api.invoke("task:getAncestors", { taskId });
      const nextPath = [...chain.map((task) => task.id), taskId];
      setNavPath(nextPath);
      syncWindowState(nextPath);
      await loadTask(taskId);
      return;
    }
    const nextPath = [...navPath, taskId];
    setNavPath(nextPath);
    syncWindowState(nextPath);
    await loadTask(taskId);
  };

  const handleBackFromRef = async () => {
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
    const input = window.prompt("新任务标题");
    const title = input && input.trim() ? input.trim() : `新任务 ${new Date().toLocaleTimeString()}`;
    const task = await window.api.invoke("task:create", { title });
    await refreshLibrary();
    await handleNavigate(task.id, true);
  };

  const handleLibraryMenu = (event: React.MouseEvent, task: Task) => {
    event.preventDefault();
    const restoreItem = task.isDeleted
      ? [
          {
            label: "从回收站恢复",
            action: async () => {
              await window.api.invoke("task:restore", { id: task.id });
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
          label: "打开置顶便签",
          action: () => window.api.invoke("window:open", { rootTaskId: task.id, windowType: "sticky" })
        },
        {
          label: task.isArchived ? "取消归档" : "归档",
          action: async () => {
            await window.api.invoke("task:update", { id: task.id, isArchived: !task.isArchived });
            await refreshLibrary();
          }
        },
        {
          label: task.isCompleted ? "标记为未完成" : "标记为完成",
          action: async () => {
            await window.api.invoke("task:update", { id: task.id, isCompleted: !task.isCompleted });
            await refreshLibrary();
          }
        },
        {
          label: "重命名",
          action: async () => {
            const title = window.prompt("新的标题", task.title)?.trim();
            if (!title) {
              return;
            }
            await window.api.invoke("task:update", { id: task.id, title });
            await refreshLibrary();
            if (currentTaskId === task.id) {
              await loadTask(task.id);
            }
          }
        },
        {
          label: "删除到回收站",
          action: async () => {
            await window.api.invoke("task:delete", { id: task.id });
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
      return { taskId: "", title: "" };
    }
    const task = await window.api.invoke("task:createFromBlock", { parentId: currentTask.id, title });
    await loadTask(currentTask.id);
    return { taskId: task.id, title: task.title };
  };

  useEffect(() => {
    const init = async () => {
      const state = await window.api.invoke("window:getState", { windowId });
      if (state) {
        setNavPath(state.navPathTaskIds);
        updateWindowSettings({
          opacity: state.opacity,
          alwaysOnTop: state.alwaysOnTop,
          stickyColor: state.stickyColor ?? "#f6e8a6",
          stickyOpacity: state.stickyOpacity ?? 1
        });
        await loadTask(state.navPathTaskIds[state.navPathTaskIds.length - 1]);
      } else {
        const initialPath = [rootTaskId];
        setNavPath(initialPath);
        syncWindowState(initialPath);
        await loadTask(rootTaskId);
      }
      if (windowType === "library") {
        await refreshLibrary();
      }
    };

    init();

    const offUpdated = window.api.on("task:updated", ({ taskId }) => {
      if (taskId === currentTaskIdRef.current) {
        loadTask(taskId);
      }
      if (windowType === "library") {
        const { searchQuery: nextQuery, libraryTab: nextTab } = useAppStore.getState();
        refreshLibrary(nextQuery, nextTab);
      }
    });

    const offDeleted = window.api.on("task:deleted", ({ taskId }) => {
      if (taskId === currentTaskIdRef.current) {
        handleBackFromRef();
      }
      if (windowType === "library") {
        const { searchQuery: nextQuery, libraryTab: nextTab } = useAppStore.getState();
        refreshLibrary(nextQuery, nextTab);
      }
    });

    const offReminder = window.api.on("reminder:trigger", ({ reminders }) => {
      setReminders(reminders);
    });
    const offSettings = window.api.on("window:settings-updated", (payload) => {
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

    return () => {
      offUpdated();
      offDeleted();
      offReminder();
      offSettings();
    };
  }, []);

  useEffect(() => {
    if (windowType === "library") {
      refreshLibrary(searchQuery, libraryTab);
    }
  }, [libraryTab]);

  const titleText = useMemo(() => currentTask?.title ?? "未选择任务", [currentTask?.title]);

  if (windowType === "sticky") {
    return (
      <div className="h-screen overflow-hidden" onClick={() => setMenu(null)}>
        <StickyView
          windowId={windowId}
          task={currentTask}
          ancestors={ancestors}
          onNavigate={handleNavigate}
          onOpenInNewWindow={(taskId) => window.api.invoke("window:open", { rootTaskId: taskId, windowType: "sticky" })}
          onCreateChildFromBlock={handleCreateChildFromBlock}
          onShowMenu={setMenu}
          isPinned={alwaysOnTop}
          onTogglePin={() => {
            const next = !alwaysOnTop;
            updateWindowSettings({ alwaysOnTop: next });
            window.api.invoke("window:updateState", { windowId, alwaysOnTop: next });
          }}
          onClose={() => window.api.invoke("window:close", { windowId })}
          stickyColor={stickyColor}
          stickyOpacity={stickyOpacity}
        />
        <ContextMenu menu={menu} onClose={() => setMenu(null)} />
      </div>
    );
  }

  const libraryNodes = searchQuery.trim() ? libraryTasks.map((task) => ({ task, children: [] })) : taskTree;

  return (
    <div className="flex h-screen flex-col bg-app-bg" onClick={() => setMenu(null)}>
      <TitleBar
        windowId={windowId}
        title={titleText}
        alwaysOnTop={alwaysOnTop}
        opacity={opacity}
        onToggleAlwaysOnTop={() => {
          const next = !alwaysOnTop;
          updateWindowSettings({ alwaysOnTop: next });
          window.api.invoke("window:updateState", { windowId, alwaysOnTop: next });
        }}
        onOpacityChange={(value) => {
          const next = Math.min(1, Math.max(0.3, value));
          updateWindowSettings({ opacity: next });
          window.api.invoke("window:updateState", { windowId, opacity: next });
        }}
        showAdvancedControls={false}
      />
      <div className="flex flex-1 flex-col gap-4 p-4 lg:flex-row">
        <div className="w-full shrink-0 lg:w-[320px]">
          <LibraryPanel
            nodes={libraryNodes}
            onOpenTask={(taskId) => handleNavigate(taskId, true)}
            onCreateRoot={handleCreateRoot}
            onContextMenu={handleLibraryMenu}
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            onQuickAdd={async (title) => {
              const task = await window.api.invoke("task:create", { title });
              await refreshLibrary(searchQuery, libraryTab);
              await handleNavigate(task.id, true);
            }}
            onToggleComplete={async (task) => {
              await window.api.invoke("task:update", { id: task.id, isCompleted: !task.isCompleted });
              await refreshLibrary(searchQuery, libraryTab);
              if (currentTaskIdRef.current === task.id) {
                await loadTask(task.id);
              }
            }}
            activeTab={libraryTab}
            onTabChange={(tab) => setLibraryTab(tab)}
          />
        </div>
        <div className="flex-1">
          <TaskDetail
            task={currentTask}
            onNavigate={handleNavigate}
            onOpenInNewWindow={(taskId) => window.api.invoke("window:open", { rootTaskId: taskId, windowType: "sticky" })}
            onUpdateBlocks={(blocks) => currentTask && window.api.invoke("task:update", { id: currentTask.id, blocks })}
            onCreateChildFromBlock={handleCreateChildFromBlock}
            onShowMenu={setMenu}
          />
        </div>
      </div>
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
      <ReminderModal reminders={reminders} onClose={() => setReminders([])} onOpenTask={(taskId) => handleNavigate(taskId, true)} />
    </div>
  );
}
