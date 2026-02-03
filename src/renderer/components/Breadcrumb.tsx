import React from "react";
import type { Task } from "../../shared/types";

interface Props {
  ancestors: Task[];
  current: Task | null;
  onNavigate: (taskId: string, reset: boolean) => void;
  variant?: "light" | "dark";
}

export default function Breadcrumb({ ancestors, current, onNavigate, variant = "light" }: Props) {
  const className = variant === "dark" ? "breadcrumb breadcrumb-dark" : "breadcrumb breadcrumb-light";
  return (
    <div className={className}>
      {ancestors.map((task) => (
        <React.Fragment key={task.id}>
          <button
            type="button"
            onClick={() => onNavigate(task.id, true)}
          >
            {task.title}
          </button>
          <span className="text-black/40">/</span>
        </React.Fragment>
      ))}
      {current ? (
        <>
          <span className="breadcrumb-current">{current.title}</span>
          <span className="text-black/40">/</span>
        </>
      ) : null}
    </div>
  );
}
