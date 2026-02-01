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
        <React.Fragment key={task.id}>
          <button type="button" onClick={() => onNavigate(task.id, true)}>
            {task.title}
          </button>
          <span className="slash">/</span>
        </React.Fragment>
      ))}
      {current ? (
        <>
          <span className="current">{current.title}</span>
          <span className="slash">/</span>
        </>
      ) : null}
    </div>
  );
}
