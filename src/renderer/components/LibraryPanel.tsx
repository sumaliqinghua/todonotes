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
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onQuickAdd: (title: string) => void;
  onToggleComplete: (task: Task) => void;
  activeTab: "inProgress" | "completed" | "deleted" | "archived";
  onTabChange: (tab: "inProgress" | "completed" | "deleted" | "archived") => void;
}

export default function LibraryPanel({
  nodes,
  onOpenTask,
  onCreateRoot,
  onContextMenu,
  searchQuery,
  onSearchChange,
  onQuickAdd,
  onToggleComplete,
  activeTab,
  onTabChange
}: Props) {
  const [quickInput, setQuickInput] = React.useState("");
  const [collapsedIds, setCollapsedIds] = React.useState<Set<string>>(new Set());

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
      return (
        <div key={node.task.id}>
          <div
            className="task-row"
            style={{ paddingLeft: 12 + depth * 14 }}
            data-completed={node.task.isCompleted}
            onClick={() => onOpenTask(node.task.id)}
            onContextMenu={(event) => onContextMenu(event, node.task)}
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
            <span className="truncate">{node.task.title}</span>
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
        <div className="flex flex-col gap-2">{renderNodes(nodes, 0)}</div>
      </div>
    </div>
  );
}
