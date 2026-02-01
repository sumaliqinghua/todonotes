import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Reminder, Task, WindowState } from "../shared/types";
import ContextMenu, { ContextMenuState } from "./components/ContextMenu";
import LibraryPanel from "./components/LibraryPanel";
import ReminderModal from "./components/ReminderModal";
import TaskDetail from "./components/TaskDetail";
import TitleBar from "./components/TitleBar";

interface Props {
  windowId: string;
  rootTaskId: string;
}

export default function App({ windowId, rootTaskId }: Props) {
  const [navPath, setNavPath] = useState<string[]>([]);
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [ancestors, setAncestors] = useState<Task[]>([]);
  const [children, setChildren] = useState<Task[]>([]);
  const [libraryTasks, setLibraryTasks] = useState<Task[]>([]);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"active" | "completed" | "archived" | "trash">("active");
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [opacity, setOpacity] = useState(1);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const searchTimer = useRef<number | null>(null);
  const currentTaskIdRef = useRef<string | null>(null);
  const navPathRef = useRef<string[]>([]);
  const viewModeRef = useRef(viewMode);

  const currentTaskId = navPath[navPath.length - 1];
  useEffect(() => {
    currentTaskIdRef.current = currentTaskId ?? null;
  }, [currentTaskId]);
  useEffect(() => {
    navPathRef.current = navPath;
  }, [navPath]);
  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  const refreshLibrary = async (query = searchQuery, mode = viewMode) => {
    if (query.trim()) {
      const results = await window.api.invoke("task:search", { query: query.trim() });
      setLibraryTasks(results);
      return;
    }
    const includeArchived = mode === "archived";
    const includeDeleted = mode === "trash";
    const tasks = await window.api.invoke("task:listRoots", { includeArchived, includeDeleted });
    const filtered = tasks.filter((task) => {
      if (mode === "active") {
        return !task.isArchived && !task.isDeleted && !task.isCompleted;
      }
      if (mode === "completed") {
        return task.isCompleted && !task.isDeleted;
      }
      if (mode === "archived") {
        return task.isArchived && !task.isDeleted;
      }
      return task.isDeleted;
    });
    setLibraryTasks(filtered);
  };

  const loadTask = async (taskId: string) => {
    const task = await window.api.invoke("task:get", { id: taskId });
    if (!task) {
      setCurrentTask(null);
      return;
    }
    const chain = await window.api.invoke("task:getAncestors", { taskId });
    const childTasks = await window.api.invoke("task:listChildren", { parentId: taskId });
    setCurrentTask(task);
    setAncestors(chain);
    setChildren(childTasks);
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

  const handleBack = async () => {
    if (navPath.length <= 1) {
      return;
    }
    const nextPath = navPath.slice(0, -1);
    setNavPath(nextPath);
    syncWindowState(nextPath);
    await loadTask(nextPath[nextPath.length - 1]);
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
    const title = window.prompt("新任务标题")?.trim();
    if (!title) {
      return;
    }
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
          label: "在当前窗口打开",
          action: () => handleNavigate(task.id, true)
        },
        {
          label: "在新便签中打开",
          action: () => window.api.invoke("window:open", { rootTaskId: task.id })
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
      refreshLibrary(value);
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
        setOpacity(state.opacity);
        setAlwaysOnTop(state.alwaysOnTop);
        await loadTask(state.navPathTaskIds[state.navPathTaskIds.length - 1]);
      } else {
        const initialPath = [rootTaskId];
        setNavPath(initialPath);
        syncWindowState(initialPath);
        await loadTask(rootTaskId);
      }
      await refreshLibrary();
    };

    init();

    const offUpdated = window.api.on("task:updated", ({ taskId }) => {
      if (taskId === currentTaskIdRef.current) {
        loadTask(taskId);
      }
      refreshLibrary(searchQuery, viewModeRef.current);
    });

    const offDeleted = window.api.on("task:deleted", ({ taskId }) => {
      if (taskId === currentTaskIdRef.current) {
        handleBackFromRef();
      }
      refreshLibrary(searchQuery, viewModeRef.current);
    });

    const offReminder = window.api.on("reminder:trigger", ({ reminders }) => {
      setReminders(reminders);
    });

    return () => {
      offUpdated();
      offDeleted();
      offReminder();
    };
  }, []);

  const titleText = useMemo(() => currentTask?.title ?? "未选择任务", [currentTask?.title]);

  return (
    <div className="app" onClick={() => setMenu(null)}>
      <TitleBar
        windowId={windowId}
        title={titleText}
        alwaysOnTop={alwaysOnTop}
        opacity={opacity}
        onToggleAlwaysOnTop={() => {
          const next = !alwaysOnTop;
          setAlwaysOnTop(next);
          window.api.invoke("window:updateState", { windowId, alwaysOnTop: next });
        }}
        onOpacityChange={(value) => {
          const next = Math.min(1, Math.max(0.3, value));
          setOpacity(next);
          window.api.invoke("window:updateState", { windowId, opacity: next });
        }}
      />
      <div className="layout">
        <LibraryPanel
          tasks={libraryTasks}
          onOpenTask={(taskId) => handleNavigate(taskId, true)}
          onCreateRoot={handleCreateRoot}
          onContextMenu={handleLibraryMenu}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          viewMode={viewMode}
          onViewChange={(mode) => {
            setViewMode(mode);
            refreshLibrary(searchQuery, mode);
          }}
        />
        <TaskDetail
          task={currentTask}
          ancestors={ancestors}
          children={children}
          onNavigate={handleNavigate}
          onBack={handleBack}
          onOpenInNewWindow={(taskId) => window.api.invoke("window:open", { rootTaskId: taskId })}
          onUpdateTitle={(title) => currentTask && window.api.invoke("task:update", { id: currentTask.id, title })}
          onUpdateBlocks={(blocks) => currentTask && window.api.invoke("task:update", { id: currentTask.id, blocks })}
          onCreateChildFromBlock={handleCreateChildFromBlock}
          onShowMenu={setMenu}
        />
      </div>
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
      <ReminderModal reminders={reminders} onClose={() => setReminders([])} onOpenTask={(taskId) => handleNavigate(taskId, true)} />
    </div>
  );
}
