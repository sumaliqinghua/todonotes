import React, { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  open: boolean;
  initialTimestamp: number;
  onSubmit: (value: { timestamp: number }) => void;
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

export default function BlockTimeModal({
  open,
  initialTimestamp,
  onSubmit,
  onCancel
}: Props) {
  const [datetimeValue, setDatetimeValue] = useState(() => toDatetimeLocalValue(initialTimestamp));
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setDatetimeValue(toDatetimeLocalValue(initialTimestamp));
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [initialTimestamp, open]);

  const parsedTimestamp = useMemo(() => fromDatetimeLocalValue(datetimeValue), [datetimeValue]);

  if (!open) {
    return null;
  }

  return (
    <div className="prompt-overlay" onClick={onCancel}>
      <div
        className="prompt-card w-[360px]"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="text-sm font-semibold text-app-text">设置截止时间</div>
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
            if (event.key === "Enter" && parsedTimestamp) {
              onSubmit({ timestamp: parsedTimestamp });
            }
          }}
        />
        <div className="text-xs text-app-muted">截止时间表示这段内容最晚应在什么时候前完成。</div>
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="ghost-button" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={!parsedTimestamp}
            onClick={() => {
              if (!parsedTimestamp) {
                return;
              }
              onSubmit({ timestamp: parsedTimestamp });
            }}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
