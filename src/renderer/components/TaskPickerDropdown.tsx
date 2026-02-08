import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Task } from "../../shared/types";

interface Props {
  variant?: "light" | "dark";
  label?: string;
  emptyText?: string;
  loadTasks: () => Promise<Task[]>;
  onSelectTask: (task: Task) => Promise<void> | void;
}

export default function TaskPickerDropdown({
  variant = "dark",
  label = "插入已有子任务",
  emptyText = "暂无可选子任务",
  loadTasks,
  onSelectTask
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  const openDropdown = async () => {
    setOpen(true);
    setLoading(true);
    try {
      const next = await loadTasks();
      setTasks(next);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleClickAway = (event: MouseEvent) => {
      if (!open) {
        return;
      }
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("click", handleClickAway);
    return () => document.removeEventListener("click", handleClickAway);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const updatePosition = () => {
      if (!triggerRef.current || !popoverRef.current) {
        return;
      }
      const rect = triggerRef.current.getBoundingClientRect();
      const pop = popoverRef.current.getBoundingClientRect();
      const padding = 8;
      let left = rect.left;
      let top = rect.bottom + 6;
      if (left + pop.width > window.innerWidth - padding) {
        left = window.innerWidth - pop.width - padding;
      }
      if (left < padding) {
        left = padding;
      }
      if (top + pop.height > window.innerHeight - padding) {
        top = rect.top - pop.height - 6;
      }
      if (top < padding) {
        top = padding;
      }
      setPopoverPos({ top, left });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, loading, tasks.length]);

  return (
    <div className={variant === "dark" ? "breadcrumb breadcrumb-dark" : "breadcrumb breadcrumb-light"}>
      <button
        ref={triggerRef}
        type="button"
        className="breadcrumb-current breadcrumb-item no-drag"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          if (open) {
            setOpen(false);
            return;
          }
          void openDropdown();
        }}
      >
        {label}
        <span className="breadcrumb-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open
        ? createPortal(
            <div
              ref={popoverRef}
              className={`breadcrumb-popover breadcrumb-popover-floating ${variant === "dark" ? "breadcrumb-popover-dark" : "breadcrumb-popover-light"} no-drag`}
              style={popoverPos ? { top: popoverPos.top, left: popoverPos.left } : undefined}
              onClick={(event) => event.stopPropagation()}
            >
              {loading ? (
                <div className="breadcrumb-popover-empty">加载中...</div>
              ) : tasks.length === 0 ? (
                <div className="breadcrumb-popover-empty">{emptyText}</div>
              ) : (
                tasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className="breadcrumb-popover-item"
                    onClick={async () => {
                      setOpen(false);
                      await onSelectTask(task);
                    }}
                  >
                    {task.title}
                  </button>
                ))
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
