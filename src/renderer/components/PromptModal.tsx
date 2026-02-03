import React, { useEffect, useRef, useState } from "react";

interface Props {
  open: boolean;
  title: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export default function PromptModal({
  open,
  title,
  placeholder,
  defaultValue,
  confirmLabel = "确定",
  cancelLabel = "取消",
  onSubmit,
  onCancel
}: Props) {
  const [value, setValue] = useState(defaultValue ?? "");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setValue(defaultValue ?? "");
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open, defaultValue]);

  if (!open) {
    return null;
  }

  return (
    <div className="prompt-overlay" onClick={onCancel}>
      <div
        className="prompt-card"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="text-sm font-semibold text-app-text">{title}</div>
        <input
          ref={inputRef}
          className="input-field w-full"
          placeholder={placeholder}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onSubmit(value.trim());
            }
            if (event.key === "Escape") {
              onCancel();
            }
          }}
        />
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="ghost-button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              onSubmit(value.trim());
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
