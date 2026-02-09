import React, { useEffect, useState } from "react";

export interface ContextMenuItem {
  label: string;
  action?: () => void;
  children?: ContextMenuItem[];
  disabled?: boolean;
}

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

interface Props {
  menu: ContextMenuState | null;
  onClose: () => void;
}

export default function ContextMenu({ menu, onClose }: Props) {
  const [expandedItemKey, setExpandedItemKey] = useState<string | null>(null);

  useEffect(() => {
    setExpandedItemKey(null);
  }, [menu?.x, menu?.y, menu?.items]);

  const maxHeight = menu ? Math.max(24, window.innerHeight - menu.y - 8) : 24;

  if (!menu) {
    return null;
  }

  const renderItems = (items: ContextMenuItem[], level = 0, parentKey = "root"): React.ReactNode => {
    return items.map((item, index) => {
      const itemKey = `${parentKey}-${index}`;
      const hasChildren = Array.isArray(item.children) && item.children.length > 0;
      const isExpanded = expandedItemKey === itemKey;
      const canRunAction = !hasChildren && !item.disabled && typeof item.action === "function";

      return (
        <React.Fragment key={itemKey}>
          <button
            type="button"
            className={`context-menu-item ${item.disabled ? "context-menu-item-disabled" : ""}`}
            style={level > 0 ? { paddingLeft: `${12 + level * 14}px` } : undefined}
            onClick={() => {
              if (hasChildren) {
                setExpandedItemKey((prev) => (prev === itemKey ? null : itemKey));
                return;
              }
              if (!canRunAction) {
                return;
              }
              item.action?.();
              onClose();
            }}
          >
            <span className="truncate">{item.label}</span>
            {hasChildren ? <span className="context-menu-caret">{isExpanded ? "▾" : "▸"}</span> : null}
          </button>
          {hasChildren && isExpanded ? <div className="context-menu-sublist">{renderItems(item.children ?? [], level + 1, itemKey)}</div> : null}
        </React.Fragment>
      );
    });
  };

  return (
    <div
      className="context-menu"
      style={{ left: menu.x, top: menu.y, maxHeight }}
      onClick={(event) => event.stopPropagation()}
    >
      {renderItems(menu.items)}
    </div>
  );
}
