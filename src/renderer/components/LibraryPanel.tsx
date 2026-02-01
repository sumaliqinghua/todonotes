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
}

export default function LibraryPanel({
  nodes,
  onOpenTask,
  onCreateRoot,
  onContextMenu,
  searchQuery,
  onSearchChange,
  onQuickAdd,
  onToggleComplete
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
      return depth === 0 ? <div className="empty">暂无任务</div> : null;
    }
    return items.map((node) => {
      const hasChildren = node.children.length > 0;
      const collapsed = collapsedIds.has(node.task.id);
      return (
        <div key={node.task.id}>
          <div
            className={`tree-row ${node.task.isCompleted ? "completed" : ""}`}
            style={{ paddingLeft: 8 + depth * 16 }}
            onClick={() => onOpenTask(node.task.id)}
            onContextMenu={(event) => onContextMenu(event, node.task)}
          >
            <button
              type="button"
              className={`tree-toggle ${hasChildren ? "" : "hidden"}`}
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
              className="tree-checkbox"
              checked={node.task.isCompleted}
              onChange={(event) => {
                event.stopPropagation();
                onToggleComplete(node.task);
              }}
              onClick={(event) => event.stopPropagation()}
            />
            <span className="tree-title">{node.task.title}</span>
          </div>
          {!collapsed ? renderNodes(node.children, depth + 1) : null}
        </div>
      );
    });
  };
  return (
    <div className="library-panel">
      <div className="library-header">
        <div className="library-title">任务</div>
        <button type="button" className="ghost" onClick={onCreateRoot}>
          新建
        </button>
      </div>
      <div className="library-quick-add">
        <span className="plus">＋</span>
        <input
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
      <input
        className="library-search"
        placeholder="搜索任务..."
        value={searchQuery}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      <div className="library-list">
        {renderNodes(nodes, 0)}
      </div>
    </div>
  );
}
