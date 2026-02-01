import React from "react";
import type { Task } from "../../shared/types";

interface Props {
  ancestors: Task[];
  current: Task | null;
  onNavigate: (taskId: string, reset: boolean) => void;
}

export default function Breadcrumb({ ancestors, current, onNavigate }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs text-black/60">
      {ancestors.map((task) => (
        <React.Fragment key={task.id}>
          <button
            type="button"
            className="rounded-md bg-black/10 px-2 py-1 text-[11px] text-black/70 hover:bg-black/15"
            onClick={() => onNavigate(task.id, true)}
          >
            {task.title}
          </button>
          <span className="text-black/40">/</span>
        </React.Fragment>
      ))}
      {current ? (
        <>
          <span className="text-[11px] font-semibold text-black/80">{current.title}</span>
          <span className="text-black/40">/</span>
        </>
      ) : null}
    </div>
  );
}
