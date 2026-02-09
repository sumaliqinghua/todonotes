import React, { useEffect, useState } from "react";
import type { PopupMenuItem } from "../shared/types";

interface Props {
  ownerWindowId: string;
  menuItemsRaw: string;
}

function parseMenuItems(raw: string): PopupMenuItem[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed as PopupMenuItem[];
  } catch {
    return [];
  }
}

export default function ContextMenuPanelWindow({ ownerWindowId, menuItemsRaw }: Props) {
  const [expandedItemKey, setExpandedItemKey] = useState<string | null>(null);
  const [items, setItems] = useState<PopupMenuItem[]>(() => parseMenuItems(menuItemsRaw));

  useEffect(() => {
    setExpandedItemKey(null);
    setItems(parseMenuItems(menuItemsRaw));
  }, [menuItemsRaw]);

  useEffect(() => {
    document.body.classList.add("context-menu-body");
    document.documentElement.classList.add("context-menu-root");
    return () => {
      document.body.classList.remove("context-menu-body");
      document.documentElement.classList.remove("context-menu-root");
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      if (!ownerWindowId) {
        return;
      }
      void window.api.invoke("window:hideContextMenu", { windowId: ownerWindowId });
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [ownerWindowId]);

  const renderItems = (nodes: PopupMenuItem[], level = 0, parentKey = "root"): React.ReactNode => {
    return nodes.map((node, index) => {
      const itemKey = `${parentKey}-${index}`;
      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      const isExpanded = expandedItemKey === itemKey;
      const isDisabled = node.disabled === true;

      return (
        <React.Fragment key={node.id || itemKey}>
          <button
            type="button"
            className={`context-menu-item ${isDisabled ? "context-menu-item-disabled" : ""}`}
            style={level > 0 ? { paddingLeft: `${12 + level * 14}px` } : undefined}
            onClick={() => {
              if (hasChildren) {
                setExpandedItemKey((prev) => (prev === itemKey ? null : itemKey));
                return;
              }
              if (isDisabled || !node.id || !ownerWindowId) {
                return;
              }
              void window.api.invoke("window:contextMenuSelect", { windowId: ownerWindowId, itemId: node.id });
            }}
          >
            <span className="truncate">{node.label}</span>
            {hasChildren ? <span className="context-menu-caret">{isExpanded ? "▾" : "▸"}</span> : null}
          </button>
          {hasChildren && isExpanded ? <div className="context-menu-sublist">{renderItems(node.children ?? [], level + 1, itemKey)}</div> : null}
        </React.Fragment>
      );
    });
  };

  return (
    <div className="no-drag context-menu-panel-wrap">
      <div className="context-menu context-menu-panel">{renderItems(items)}</div>
    </div>
  );
}
