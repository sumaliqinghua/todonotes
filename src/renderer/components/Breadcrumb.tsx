import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Task } from "../../shared/types";

interface Props {
  ancestors: Task[];
  current: Task | null;
  onNavigate: (taskId: string, reset: boolean) => void;
  variant?: "light" | "dark";
}

export default function Breadcrumb({ ancestors, current, onNavigate, variant = "light" }: Props) {
  const className = variant === "dark" ? "breadcrumb breadcrumb-dark" : "breadcrumb breadcrumb-light";
  const [showSiblings, setShowSiblings] = useState(false);
  const [siblings, setSiblings] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const currentRef = useRef<HTMLButtonElement | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  const loadSiblings = async () => {
    if (!current || !window.api) {
      return;
    }
    setLoading(true);
    const parent = ancestors[ancestors.length - 1] ?? null;
    const data = parent
      ? await window.api.invoke("task:listChildren", { parentId: parent.id, includeArchived: true, includeDeleted: false })
      : await window.api.invoke("task:listRoots", { includeArchived: true, includeDeleted: false });
    const next = (data as Task[]).filter((task) => task.id !== current.id);
    setSiblings(next);
    setLoading(false);
  };

  const handleCurrentClick = async (event: React.MouseEvent) => {
    event.stopPropagation();
    const nextOpen = !showSiblings;
    setShowSiblings(nextOpen);
    if (nextOpen) {
      await loadSiblings();
    }
  };

  useEffect(() => {
    const handleClickAway = (event: MouseEvent) => {
      if (!popoverRef.current) {
        return;
      }
      if (popoverRef.current.contains(event.target as Node)) {
        return;
      }
      setShowSiblings(false);
    };
    document.addEventListener("click", handleClickAway);
    return () => document.removeEventListener("click", handleClickAway);
  }, []);

  useEffect(() => {
    if (!showSiblings) {
      return;
    }
    const updatePosition = () => {
      if (!currentRef.current || !popoverRef.current) {
        return;
      }
      const rect = currentRef.current.getBoundingClientRect();
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
  }, [showSiblings, loading, siblings.length]);
  return (
    <div className={className}>
      {ancestors.map((task, index) => (
        <React.Fragment key={task.id}>
          <button
            type="button"
            className={`breadcrumb-item no-drag${index === 0 ? " breadcrumb-root" : ""}`}
            onClick={() => onNavigate(task.id, true)}
          >
            {task.title}
          </button>
          <span className="text-black/40">/</span>
        </React.Fragment>
      ))}
      {current ? (
        <>
          <span className="relative">
            <button
              type="button"
              className="breadcrumb-current breadcrumb-item no-drag"
              ref={currentRef}
              onClick={handleCurrentClick}
              aria-expanded={showSiblings}
            >
              {current.title}
              <span className="breadcrumb-caret" aria-hidden>
                ▾
              </span>
            </button>
          </span>
          {showSiblings
            ? createPortal(
                <div
                  ref={popoverRef}
                  className={`breadcrumb-popover breadcrumb-popover-floating ${variant === "dark" ? "breadcrumb-popover-dark" : "breadcrumb-popover-light"} no-drag`}
                  style={popoverPos ? { top: popoverPos.top, left: popoverPos.left } : undefined}
                  onClick={(event) => event.stopPropagation()}
                >
                  {loading ? (
                    <div className="breadcrumb-popover-empty">加载中...</div>
                  ) : siblings.length === 0 ? (
                    <div className="breadcrumb-popover-empty">暂无同级任务</div>
                  ) : (
                    siblings.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        className="breadcrumb-popover-item"
                        onClick={() => {
                          setShowSiblings(false);
                          onNavigate(task.id, true);
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
          <span className="text-black/40">/</span>
        </>
      ) : null}
    </div>
  );
}
