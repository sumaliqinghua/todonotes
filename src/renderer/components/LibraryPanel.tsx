import React from "react";
import type { Task } from "../../shared/types";

export interface TaskTreeNode {
  task: Task;
  children: TaskTreeNode[];
}

interface Props {
  nodes: TaskTreeNode[];
  onOpenTask: (taskId: string) => void;
  onCreateRoot: () => void;
  onContextMenu: (event: React.MouseEvent, task: Task) => void;
  onRenameTask: (task: Task, title: string) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onQuickAdd: (title: string) => void;
  onToggleComplete: (task: Task) => void;
  onMoveTask: (input: { taskId: string; targetParentId?: string }) => void;
  activeTab: "inProgress" | "completed" | "deleted" | "archived";
  onTabChange: (tab: "inProgress" | "completed" | "deleted" | "archived") => void;
}

export default function LibraryPanel({
  nodes,
  onOpenTask,
  onCreateRoot,
  onContextMenu,
  onRenameTask,
  searchQuery,
  onSearchChange,
  onQuickAdd,
  onToggleComplete,
  onMoveTask,
  activeTab,
  onTabChange
}: Props) {
  const [quickInput, setQuickInput] = React.useState("");
  const [collapsedIds, setCollapsedIds] = React.useState<Set<string>>(new Set());
  const [editingTaskId, setEditingTaskId] = React.useState<string | null>(null);
  const [editingTitle, setEditingTitle] = React.useState("");
  const [dragTaskId, setDragTaskId] = React.useState<string | null>(null);
  const [dropHint, setDropHint] = React.useState<{ taskId: string; mode: "asChild" | "asRoot" } | null>(null);

  const toggleCollapse = (taskId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const renderNodes = (items: TaskTreeNode[], depth: number) => {
    if (items.length === 0) {
      return depth === 0 ? <div className="text-xs text-app-muted">暂无任务</div> : null;
    }
    return items.map((node) => {
      const hasChildren = node.children.length > 0;
      const collapsed = collapsedIds.has(node.task.id);
      const isEditing = editingTaskId === node.task.id;
      return (
        <div key={node.task.id}>
          <div
            className="task-row"
            style={{ paddingLeft: 12 + depth * 14 }}
            data-completed={node.task.isCompleted}
            onClick={() => {
              if (!isEditing) {
                onOpenTask(node.task.id);
              }
            }}
            onContextMenu={(event) => onContextMenu(event, node.task)}
            draggable
            onDragStart={(event) => {
              setDragTaskId(node.task.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", node.task.id);
            }}
            onDragEnd={() => {
              setDragTaskId(null);
              setDropHint(null);
            }}
            onDragOver={(event) => {
              const movingId = dragTaskId ?? event.dataTransfer.getData("text/plain");
              if (!movingId || movingId === node.task.id) {
                return;
              }
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDropHint({ taskId: node.task.id, mode: "asChild" });
            }}
            onDragLeave={() => {
              setDropHint((prev) => (prev?.taskId === node.task.id ? null : prev));
            }}
            onDrop={(event) => {
              const movingId = dragTaskId ?? event.dataTransfer.getData("text/plain");
              if (!movingId || movingId === node.task.id) {
                return;
              }
              event.preventDefault();
              setDropHint(null);
              onMoveTask({ taskId: movingId, targetParentId: node.task.id });
            }}
            data-drop-active={dropHint?.taskId === node.task.id && dropHint.mode === "asChild" ? "true" : "false"}
          >
            <button
              type="button"
              className={`text-xs text-app-muted ${hasChildren ? "" : "invisible"}`}
              onClick={(event) => {
                event.stopPropagation();
                if (hasChildren) {
                  toggleCollapse(node.task.id);
                }
              }}
            >
              {collapsed ? "▸" : "▾"}
            </button>
            <input
              type="checkbox"
              className="h-4 w-4 accent-app-accent"
              checked={node.task.isCompleted}
              onChange={(event) => {
                event.stopPropagation();
                onToggleComplete(node.task);
              }}
              onClick={(event) => event.stopPropagation()}
            />
            {isEditing ? (
              <input
                className="input-field h-7 w-full max-w-[220px]"
                value={editingTitle}
                autoFocus
                onChange={(event) => setEditingTitle(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    const next = editingTitle.trim();
                    if (next && next !== node.task.title) {
                      onRenameTask(node.task, next);
                    }
                    setEditingTaskId(null);
                  }
                  if (event.key === "Escape") {
                    setEditingTaskId(null);
                  }
                }}
                onBlur={() => {
                  const next = editingTitle.trim();
                  if (next && next !== node.task.title) {
                    onRenameTask(node.task, next);
                  }
                  setEditingTaskId(null);
                }}
              />
            ) : (
              <span
                className="truncate"
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  setEditingTaskId(node.task.id);
                  setEditingTitle(node.task.title);
                }}
              >
                {node.task.title}
              </span>
            )}
          </div>
          {!collapsed ? renderNodes(node.children, depth + 1) : null}
        </div>
      );
    });
  };

  const tabs = [
    { id: "inProgress" as const, label: "进行中" },
    { id: "completed" as const, label: "已完成" },
    { id: "deleted" as const, label: "回收站" },
    { id: "archived" as const, label: "归档" }
  ];
  return (
    <div className="panel-card panel-enter flex h-full flex-col gap-4 p-4">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <span className="accent-chip">Library</span>
          <div className="text-sm font-semibold text-app-text">任务</div>
        </div>
        <button type="button" className="ghost-button" onClick={onCreateRoot}>
          新建
        </button>
      </div>
      <div className="flex items-center gap-2 rounded-2xl border border-app-border/70 bg-app-panelAlt/60 px-3 py-2 text-sm text-app-text">
        <span className="text-app-accent">＋</span>
        <input
          className="flex-1 bg-transparent text-sm text-app-text outline-none placeholder:text-app-muted"
          placeholder="添加任务至“收集箱”"
          value={quickInput}
          onChange={(event) => setQuickInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && quickInput.trim()) {
              onQuickAdd(quickInput.trim());
              setQuickInput("");
            }
          }}
        />
      </div>
      <input className="input-field" placeholder="搜索任务..." value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} />
      <div className="grid grid-cols-4 gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-pill ${activeTab === tab.id ? "tab-pill-active" : "tab-pill-idle"}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto pr-1">
        <div
          className="flex flex-col gap-2"
          onDragOver={(event) => {
            const movingId = dragTaskId ?? event.dataTransfer.getData("text/plain");
            if (!movingId) {
              return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDropHint({ taskId: "__root__", mode: "asRoot" });
          }}
          onDragLeave={() => {
            setDropHint((prev) => (prev?.taskId === "__root__" ? null : prev));
          }}
          onDrop={(event) => {
            const movingId = dragTaskId ?? event.dataTransfer.getData("text/plain");
            if (!movingId) {
              return;
            }
            event.preventDefault();
            setDropHint(null);
            onMoveTask({ taskId: movingId });
          }}
          data-drop-root={dropHint?.taskId === "__root__" && dropHint.mode === "asRoot" ? "true" : "false"}
        >
          {renderNodes(nodes, 0)}
        </div>
      </div>
    </div>
  );
}
