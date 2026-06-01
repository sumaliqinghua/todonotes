import React, { useEffect, useMemo, useRef, useState } from "react";
import { STATUS_TIME_OPTIONS_MINUTES } from "./statusTimeOptions";

interface Props {
  open: boolean;
  title: string;
  initialDurationMinutes?: number;
  onSubmit: (value: { plannedDurationMinutes: number }) => void;
  onCancel: () => void;
}

export default function BlockDurationModal({
  open,
  title,
  initialDurationMinutes = 25,
  onSubmit,
  onCancel
}: Props) {
  const [durationValue, setDurationValue] = useState(() => String(initialDurationMinutes || 25));
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setDurationValue(String(initialDurationMinutes || 25));
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [initialDurationMinutes, open]);

  const parsedDuration = useMemo(() => {
    const parsed = Number(durationValue);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
  }, [durationValue]);

  if (!open) {
    return null;
  }

  const submit = () => {
    if (!parsedDuration) {
      return;
    }
    onSubmit({ plannedDurationMinutes: parsedDuration });
  };

  return (
    <div className="prompt-overlay" onClick={onCancel}>
      <div
        className="prompt-card w-[380px]"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="text-sm font-semibold text-app-text">{title}</div>
        <label className="space-y-1 text-xs text-app-muted">
          <span>预计持续时长（分钟）</span>
          <input
            ref={inputRef}
            type="number"
            min={1}
            step={5}
            className="input-field w-full"
            value={durationValue}
            onChange={(event) => setDurationValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                onCancel();
              }
              if (event.key === "Enter") {
                submit();
              }
            }}
          />
        </label>
        <div className="flex flex-wrap gap-1">
          {STATUS_TIME_OPTIONS_MINUTES.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className={`ghost-button px-2 py-1 text-xs${durationValue === String(minutes) ? " bg-app-accent/15" : ""}`}
              onClick={() => setDurationValue(String(minutes))}
            >
              {minutes}m
            </button>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="ghost-button" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={!parsedDuration}
            onClick={submit}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
