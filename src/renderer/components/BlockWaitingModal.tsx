import React, { useEffect, useMemo, useRef, useState } from "react";
import { STATUS_TIME_OPTIONS_MINUTES } from "./statusTimeOptions";

interface Props {
  open: boolean;
  initialReason?: string;
  initialReviewAt?: number | null;
  onSubmit: (value: { waitReason: string; waitReviewAt: number | null }) => void;
  onCancel: () => void;
}

function toDatetimeLocalValue(timestamp: number | null | undefined): string {
  if (!timestamp) {
    return "";
  }
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

export default function BlockWaitingModal({
  open,
  initialReason = "",
  initialReviewAt = null,
  onSubmit,
  onCancel
}: Props) {
  const [reason, setReason] = useState(initialReason);
  const [reviewAtValue, setReviewAtValue] = useState(() => toDatetimeLocalValue(initialReviewAt));
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setReason(initialReason);
    setReviewAtValue(toDatetimeLocalValue(initialReviewAt));
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [initialReason, initialReviewAt, open]);

  const parsedReviewAt = useMemo(() => fromDatetimeLocalValue(reviewAtValue), [reviewAtValue]);
  const canSubmit = reason.trim().length > 0;

  if (!open) {
    return null;
  }

  const submit = () => {
    const waitReason = reason.trim();
    if (!waitReason) {
      return;
    }
    onSubmit({
      waitReason,
      waitReviewAt: parsedReviewAt
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
        <div className="text-sm font-semibold text-app-text">设置等待中</div>
        <label className="space-y-1 text-xs text-app-muted">
          <span>等待什么</span>
          <input
            ref={inputRef}
            className="input-field w-full"
            placeholder="例如：客户确认"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
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
          <span>回看时间（可选）</span>
          <input
            type="datetime-local"
            className="input-field w-full"
            value={reviewAtValue}
            onChange={(event) => setReviewAtValue(event.target.value)}
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
              className="ghost-button px-2 py-1 text-xs"
              onClick={() => setReviewAtValue(toDatetimeLocalValue(Date.now() + minutes * 60 * 1000))}
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
            disabled={!canSubmit}
            onClick={submit}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
