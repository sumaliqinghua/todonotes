import React from "react";

interface Props {
  windowId: string;
  title: string;
  alwaysOnTop: boolean;
  opacity: number;
  onToggleAlwaysOnTop: () => void;
  onOpacityChange: (value: number) => void;
  showAdvancedControls?: boolean;
}

export default function TitleBar({
  windowId,
  title,
  alwaysOnTop,
  opacity,
  onToggleAlwaysOnTop,
  onOpacityChange,
  showAdvancedControls = true
}: Props) {
  return (
    <div className="drag-region flex h-12 items-center border-b border-app-border/70 bg-app-panel/85 px-4 backdrop-blur">
      <div className="flex w-full items-center justify-between gap-3">
        <div className="title-display truncate text-app-text">{title}</div>
        <div className="no-drag flex items-center gap-2 text-xs text-app-muted">
          {showAdvancedControls ? (
            <>
              <label className="flex items-center gap-2 rounded-full border border-app-border/70 bg-app-panelAlt/70 px-3 py-1 text-[11px] text-app-text">
                透明度
                <input
                  type="range"
                  min={0.3}
                  max={1}
                  step={0.05}
                  value={opacity}
                  className="w-20 accent-app-accent"
                  onChange={(event) => onOpacityChange(Number(event.target.value))}
                />
              </label>
              <button
                type="button"
                className={`rounded-full border px-3 py-1 text-[11px] transition ${alwaysOnTop ? "border-app-accent bg-app-accent text-app-bg shadow-glow" : "border-app-border/70 bg-app-panelAlt/70 text-app-text hover:border-app-accent/40"}`}
                onClick={onToggleAlwaysOnTop}
              >
                置顶
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="h-8 w-8 rounded-full border border-app-border/70 bg-app-panelAlt/70 text-base text-app-text transition hover:border-app-accent/40 hover:bg-app-panel"
            onClick={() => window.api.invoke("window:minimize", { windowId })}
          >
            —
          </button>
          <button
            type="button"
            className="h-8 w-8 rounded-full border border-app-border/70 bg-app-panelAlt/70 text-base text-app-text transition hover:border-app-accent/40 hover:bg-app-panel"
            onClick={() => window.api.invoke("window:close", { windowId })}
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
