import React from "react";
import type { Task } from "../../shared/types";

interface Props {
  tasks: Task[];
  onOpenTask: (taskId: string) => void;
  onCreateRoot: () => void;
  onContextMenu: (event: React.MouseEvent, task: Task) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  viewMode: "active" | "completed" | "archived" | "trash";
  onViewChange: (mode: "active" | "completed" | "archived" | "trash") => void;
}

export default function LibraryPanel({
  tasks,
  onOpenTask,
  onCreateRoot,
  onContextMenu,
  searchQuery,
  onSearchChange,
  viewMode,
  onViewChange
}: Props) {
  return (
    <div className="library-panel">
      <div className="library-header">
        <div className="library-title">任务库</div>
        <button type="button" onClick={onCreateRoot}>
          新建
        </button>
      </div>
      <div className="library-tabs">
        <button type="button" className={viewMode === "active" ? "active" : ""} onClick={() => onViewChange("active")}>
          活动
        </button>
        <button type="button" className={viewMode === "completed" ? "active" : ""} onClick={() => onViewChange("completed")}>
          已完成
        </button>
        <button type="button" className={viewMode === "archived" ? "active" : ""} onClick={() => onViewChange("archived")}>
          归档
        </button>
        <button type="button" className={viewMode === "trash" ? "active" : ""} onClick={() => onViewChange("trash")}>
          回收站
        </button>
      </div>
      <input
        className="library-search"
        placeholder="搜索任务..."
        value={searchQuery}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      <div className="library-list">
        {tasks.length === 0 ? (
          <div className="empty">暂无任务</div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className={`library-item ${task.isCompleted ? "completed" : ""}`}
              onClick={() => onOpenTask(task.id)}
              onContextMenu={(event) => onContextMenu(event, task)}
            >
              <span className="checkbox">{task.isCompleted ? "✓" : "○"}</span>
              <span className="title">{task.title}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
