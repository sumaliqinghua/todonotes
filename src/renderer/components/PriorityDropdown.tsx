import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";

interface Props {
  editor: Editor | null;
  variant?: "light" | "dark";
  onNavigate?: (taskId: string) => void;
  currentTaskId?: string;
}

interface PriorityNode {
  taskId: string;
  taskTitle: string;
  blockId: string;
  priority: string;
  text: string;
}

export default function PriorityDropdown({ editor, variant = "dark", onNavigate, currentTaskId }: Props) {
  const [open, setOpen] = useState(false);
  const [nodes, setNodes] = useState<PriorityNode[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    high: true,
    medium: false,
    low: false
  });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  if (!editor) {
    return null;
  }

  const loadPriorityNodes = async () => {
    try {
      const result = await window.api.invoke("task:getPriorityBlocks");
      setNodes(result);
    } catch (error) {
      console.error("Failed to load priority blocks:", error);
      setNodes([]);
    }
  };

  const toggleDropdown = () => {
    if (!open) {
      loadPriorityNodes();
      setOpen(true);
    } else {
      setOpen(false);
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

    // Give time for render
    setTimeout(updatePosition, 0);

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, nodes.length]);

  const priorityLabelMap: Record<string, string> = {
    high: "高优",
    medium: "中优",
    low: "低优"
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "#ef4444";
      case "medium": return "#f59e0b";
      case "low": return "#3b82f6";
      default: return "transparent";
    }
  };

  const toggleGroup = (priority: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [priority]: !prev[priority]
    }));
  };

  const renderGroup = (priorityLabel: string, priorityValue: string, nodesInGroup: PriorityNode[]) => {
    if (nodesInGroup.length === 0) return null;
    const isExpanded = expandedGroups[priorityValue];

    return (
      <div key={priorityLabel} className="mb-2 last:mb-0">
        <div
          className="flex items-center gap-1 text-xs font-semibold text-gray-500 mb-1 mt-2 first:mt-0 px-2 cursor-pointer hover:text-gray-700 select-none"
          onClick={(e) => {
            e.stopPropagation();
            toggleGroup(priorityValue);
          }}
        >
          <span className="w-3 inline-block transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
            ▸
          </span>
          {priorityLabel} ({nodesInGroup.length})
        </div>

        {isExpanded && (
          <div className="pl-1">
            {nodesInGroup.map((node, i) => (
              <button
                key={`${node.blockId}-${i}`}
                type="button"
                className="breadcrumb-popover-item flex flex-col items-start gap-1 w-full text-left py-1.5"
                onClick={() => {
                  setOpen(false);

                  if (node.taskId === currentTaskId) {
                    // Same task, just scroll to it
                    const blockElement = editor.view.dom.querySelector(`[data-node-id="${node.blockId}"]`);
                    if (blockElement) {
                      blockElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

                      // Highlight effect
                      blockElement.classList.add('bg-blue-50', 'dark:bg-blue-900/30', 'transition-colors', 'duration-500');
                      setTimeout(() => {
                        blockElement.classList.remove('bg-blue-50', 'dark:bg-blue-900/30');
                      }, 2000);
                    }
                  } else if (onNavigate) {
                    // Different task, navigate and then scroll
                    onNavigate(node.taskId);
                    setTimeout(() => {
                      window.dispatchEvent(new CustomEvent('scroll-to-block', { detail: node.blockId }));
                    }, 100);
                  }
                }}
              >
                <div className="flex items-center gap-2 w-full">
                  <span
                    className="w-2 h-2 rounded-full inline-block shrink-0 mt-0.5"
                    style={{ backgroundColor: getPriorityColor(node.priority) }}
                    title={priorityLabelMap[node.priority] || node.priority}
                  />
                  <span className="truncate flex-1 text-sm font-medium leading-tight">{node.text}</span>
                </div>
                <div className="text-[10px] text-gray-400 pl-4 truncate w-full flex items-center gap-1">
                  <span>📄</span> {node.taskTitle}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={variant === "dark" ? "breadcrumb breadcrumb-dark" : "breadcrumb breadcrumb-light"}>
      <button
        ref={triggerRef}
        type="button"
        className="breadcrumb-current breadcrumb-item no-drag flex items-center gap-1"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          toggleDropdown();
        }}
        title="按优先级查看"
      >
        <span>🚩</span>
        <span className="breadcrumb-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          className={`breadcrumb-popover breadcrumb-popover-floating ${variant === "dark" ? "breadcrumb-popover-dark" : "breadcrumb-popover-light"} no-drag`}
          style={popoverPos ? { top: popoverPos.top, left: popoverPos.left, minWidth: "200px" } : undefined}
          onClick={(event) => event.stopPropagation()}
        >
          {nodes.length === 0 ? (
            <div className="breadcrumb-popover-empty">暂无带优先级的块</div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto w-[280px] sticky-scrollbar-visible">
              {renderGroup("高优", "high", nodes.filter((n) => n.priority === "high"))}
              {renderGroup("中优", "medium", nodes.filter((n) => n.priority === "medium"))}
              {renderGroup("低优", "low", nodes.filter((n) => n.priority === "low"))}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
