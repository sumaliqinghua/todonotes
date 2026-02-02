import React, { useEffect, useState } from "react";

const DEFAULT_COLOR = "#f6e8a6";
const DEFAULT_OPACITY = 1;
const stickyPalette = [
  { label: "浅黄", value: "#f6e8a6" },
  { label: "雾白", value: "#f2f1ec" },
  { label: "浅粉", value: "#f7d6d6" },
  { label: "浅蓝", value: "#d7e6fb" },
  { label: "浅绿", value: "#d9f2df" }
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
      <div className="w-full rounded-2xl border border-black/10 bg-white/95 p-3 shadow-soft backdrop-blur">
        <div className="grid grid-cols-5 gap-2">
          {stickyPalette.map((color) => (
            <button
              key={color.value}
              type="button"
              className={`h-10 w-10 rounded-xl border ${stickyColor === color.value ? "border-black/60 ring-2 ring-black/30" : "border-black/10"}`}
              style={{ backgroundColor: color.value }}
              aria-label={`便签颜色-${color.label}`}
              onClick={() => handleColorChange(color.value)}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-full bg-black/5 px-3 py-2 text-xs text-black/60">
          <span>透明度</span>
          <input
            type="range"
            min={0.6}
            max={1}
            step={0.05}
            value={stickyOpacity}
            className="w-28 accent-[#b67a00]"
            onChange={(event) => handleOpacityChange(Number(event.target.value))}
          />
        </div>
      </div>
    </div>
  );
}
