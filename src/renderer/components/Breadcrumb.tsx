import React from "react";
import type { Task } from "../../shared/types";

interface Props {
  ancestors: Task[];
  current: Task | null;
  onNavigate: (taskId: string, reset: boolean) => void;
}

export default function Breadcrumb({ ancestors, current, onNavigate }: Props) {
  return (
    <div className="breadcrumb">
      {ancestors.map((task) => (
        <button key={task.id} type="button" onClick={() => onNavigate(task.id, true)}>
          {task.title}
        </button>
      ))}
      {current ? <span className="current">{current.title}</span> : null}
    </div>
  );
}
