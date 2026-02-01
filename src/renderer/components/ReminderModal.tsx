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
    <div className="reminder-modal" onClick={onClose}>
      <div className="reminder-content" onClick={(event) => event.stopPropagation()}>
        <div className="reminder-title">到期提醒</div>
        <div className="reminder-list">
          {reminders.map((reminder) => (
            <button
              key={reminder.id}
              type="button"
              onClick={() => {
                onOpenTask(reminder.taskId);
                onClose();
              }}
            >
              打开任务 {reminder.taskId.slice(0, 6)}
            </button>
          ))}
        </div>
        <button type="button" className="reminder-close" onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  );
}
