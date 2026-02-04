import React, { useEffect, useState } from "react";

const DEFAULT_COLOR = "#f6e6b8";
const DEFAULT_OPACITY = 1;
const stickyPalette = [
  { label: "浅黄", value: "#f6e6b8" },
  { label: "米白", value: "#f3f1e6" },
  { label: "杏粉", value: "#f5d1c2" },
  { label: "浅玫", value: "#f7c7d6" },
  { label: "浅蓝", value: "#d5e5f7" },
  { label: "雾蓝", value: "#cfe0ff" },
  { label: "浅紫", value: "#e0d5f6" },
  { label: "薄荷", value: "#d7efd8" },
  { label: "雾青", value: "#d6f1ea" },
  { label: "暖灰", value: "#e7e2d9" }
];

interface Props {
  ownerWindowId: string;
}

export default function SkinPanelWindow({ ownerWindowId }: Props) {
  const [stickyColor, setStickyColor] = useState(DEFAULT_COLOR);
  const [stickyOpacity, setStickyOpacity] = useState(DEFAULT_OPACITY);

  useEffect(() => {
    document.body.classList.add("skin-panel-body");
    document.documentElement.classList.add("skin-panel-root");
    return () => {
      document.body.classList.remove("skin-panel-body");
      document.documentElement.classList.remove("skin-panel-root");
    };
  }, []);

  useEffect(() => {
    if (!ownerWindowId) {
      return;
    }
    window.api.invoke("window:getState", { windowId: ownerWindowId }).then((state) => {
      if (!state) {
        return;
      }
      setStickyColor(state.stickyColor ?? DEFAULT_COLOR);
      setStickyOpacity(state.stickyOpacity ?? DEFAULT_OPACITY);
    });
  }, [ownerWindowId]);

  const handleColorChange = (color: string) => {
    setStickyColor(color);
    window.api.invoke("window:updateState", { windowId: ownerWindowId, stickyColor: color });
  };

  const handleOpacityChange = (value: number) => {
    const next = Math.min(1, Math.max(0.6, value));
    setStickyOpacity(next);
    window.api.invoke("window:updateState", { windowId: ownerWindowId, stickyOpacity: next });
  };

  return (
    <div className="no-drag flex h-screen w-screen items-center justify-center bg-transparent p-3">
      <div className="w-full max-w-[280px] rounded-2xl border border-black/10 bg-[#f8f6ef]/95 p-3 shadow-[0_12px_28px_rgba(0,0,0,0.22)] backdrop-blur-sm">
        <div className="grid grid-cols-5 gap-2.5">
          {stickyPalette.map((color) => {
            const isActive = stickyColor === color.value;
            return (
              <button
                key={color.value}
                type="button"
                className={`relative h-9 w-9 rounded-xl border transition ${
                  isActive ? "border-black/60 ring-2 ring-black/20" : "border-black/10 hover:border-black/30"
                } focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30`}
                style={{ backgroundColor: color.value }}
                aria-label={`便签颜色-${color.label}`}
                onClick={() => handleColorChange(color.value)}
              >
                {isActive && (
                  <span className="absolute -right-1 -bottom-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-black/80 shadow-sm">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-full bg-black/5 px-3 py-2 text-xs text-black/60">
          <span>透明度</span>
          <input
            type="range"
            min={0.6}
            max={1}
            step={0.05}
            value={stickyOpacity}
            className="w-28 accent-[#c57b1a]"
            onChange={(event) => handleOpacityChange(Number(event.target.value))}
          />
        </div>
      </div>
    </div>
  );
}
