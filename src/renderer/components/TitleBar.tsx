import React from "react";

interface Props {
  windowId: string;
  title: string;
  alwaysOnTop: boolean;
  opacity: number;
  onToggleAlwaysOnTop: () => void;
  onOpacityChange: (value: number) => void;
}

export default function TitleBar({
  windowId,
  title,
  alwaysOnTop,
  opacity,
  onToggleAlwaysOnTop,
  onOpacityChange
}: Props) {
  return (
    <div className="titlebar">
      <div className="titlebar-drag" />
      <div className="titlebar-content">
        <div className="titlebar-title">{title}</div>
        <div className="titlebar-actions">
          <label className="opacity-control">
            透明度
            <input
              type="range"
              min={0.3}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(event) => onOpacityChange(Number(event.target.value))}
            />
          </label>
          <button type="button" className={alwaysOnTop ? "active" : ""} onClick={onToggleAlwaysOnTop}>
            置顶
          </button>
          <button type="button" onClick={() => window.api.invoke("window:minimize", { windowId })}>
            最小化
          </button>
          <button type="button" onClick={() => window.api.invoke("window:close", { windowId })}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
