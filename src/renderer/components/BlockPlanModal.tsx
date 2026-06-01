import React, { useEffect, useMemo, useRef, useState } from "react";
import { STATUS_TIME_OPTIONS_MINUTES } from "./statusTimeOptions";

interface Props {
  open: boolean;
  initialStartAt: number;
  initialDurationMinutes?: number;
  onSubmit: (value: { plannedStartAt: number; plannedDurationMinutes: number }) => void;
  onCancel: () => void;
}

function toDatetimeLocalValue(timestamp: number): string {
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function fromDatetimeLocalValue(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = new Date(value);
  const timestamp = parsed.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export default function BlockPlanModal({
  open,
  initialStartAt,
  initialDurationMinutes = 25,
  onSubmit,
  onCancel
}: Props) {
  const [datetimeValue, setDatetimeValue] = useState(() => toDatetimeLocalValue(initialStartAt));
  const [durationValue, setDurationValue] = useState(() => String(initialDurationMinutes || 25));
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setDatetimeValue(toDatetimeLocalValue(initialStartAt));
    setDurationValue(String(initialDurationMinutes || 25));
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [initialDurationMinutes, initialStartAt, open]);

  const parsedStartAt = useMemo(() => fromDatetimeLocalValue(datetimeValue), [datetimeValue]);
  const parsedDuration = useMemo(() => {
    const parsed = Number(durationValue);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
  }, [durationValue]);

  if (!open) {
    return null;
  }

  const submit = () => {
    if (!parsedStartAt || !parsedDuration) {
      return;
    }
    onSubmit({
      plannedStartAt: parsedStartAt,
      plannedDurationMinutes: parsedDuration
    });
  };

  return (
    <div className="prompt-overlay" onClick={onCancel}>
      <div
        className="prompt-card w-[380px]"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="text-sm font-semibold text-app-text">设置待开始</div>
        <label className="space-y-1 text-xs text-app-muted">
          <span>预计开始时间</span>
          <input
            ref={inputRef}
            type="datetime-local"
            className="input-field w-full"
            value={datetimeValue}
            onChange={(event) => setDatetimeValue(event.target.value)}
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
        <label className="space-y-1 text-xs text-app-muted">
          <span>预计持续时长（分钟）</span>
          <input
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
            disabled={!parsedStartAt || !parsedDuration}
            onClick={submit}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
