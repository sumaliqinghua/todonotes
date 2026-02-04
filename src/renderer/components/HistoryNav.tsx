import React from "react";

interface Props {
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  variant?: "light" | "dark";
}

export default function HistoryNav({ canBack, canForward, onBack, onForward, variant = "light" }: Props) {
  const base =
    variant === "dark"
      ? "border border-transparent bg-transparent text-app-muted hover:border-app-accent/40 hover:bg-app-panelAlt/60 hover:text-app-text"
      : "border border-transparent bg-transparent text-black/60 hover:border-black/30 hover:bg-black/5 hover:text-black/80";
  const disabled = "opacity-40 cursor-not-allowed";

  return (
    <div className="no-drag flex items-center gap-1">
      <button
        type="button"
        className={`h-6 w-6 rounded-full text-[11px] transition ${base} ${canBack ? "" : disabled}`}
        aria-label="后退"
        title="后退 (Alt + ←)"
        onClick={canBack ? onBack : undefined}
        disabled={!canBack}
      >
        ←
      </button>
      <button
        type="button"
        className={`h-6 w-6 rounded-full text-[11px] transition ${base} ${canForward ? "" : disabled}`}
        aria-label="前进"
        title="前进 (Alt + →)"
        onClick={canForward ? onForward : undefined}
        disabled={!canForward}
      >
        →
      </button>
    </div>
  );
}
