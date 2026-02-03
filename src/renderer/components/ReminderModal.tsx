import React from "react";
import type { Reminder } from "../../shared/types";

interface Props {
  reminders: Reminder[];
  onClose: () => void;
  onOpenTask: (taskId: string) => void;
}

export default function ReminderModal({ reminders, onClose, onOpenTask }: Props) {
  if (reminders.length === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="panel-card w-[340px] p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="text-sm font-semibold text-app-text">到期提醒</div>
        <div className="mt-3 flex flex-col gap-2">
          {reminders.map((reminder) => (
            <button
              key={reminder.id}
              type="button"
              className="rounded-2xl border border-app-border/70 bg-app-panelAlt/60 px-3 py-2 text-left text-sm text-app-text transition hover:border-app-accent/40 hover:bg-app-panel"
              onClick={() => {
                onOpenTask(reminder.taskId);
                onClose();
              }}
            >
              打开任务 {reminder.taskId.slice(0, 6)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="mt-4 w-full rounded-2xl border border-app-border/70 bg-app-panelAlt/70 px-3 py-2 text-sm text-app-text transition hover:border-app-accent/40 hover:bg-app-panel"
          onClick={onClose}
        >
          关闭
        </button>
      </div>
    </div>
  );
}
