import { listDueReminders, markReminderDone } from "./db/remindersRepo";
import { broadcast } from "./ipc/events";

let timer: NodeJS.Timeout | null = null;

export function startReminderScheduler() {
  if (timer) {
    return;
  }
  timer = setInterval(() => {
    const now = Date.now();
    const due = listDueReminders(now);
    if (due.length > 0) {
      broadcast("reminder:trigger", { reminders: due });
      due.forEach((reminder) => markReminderDone(reminder.id));
    }
  }, 60 * 1000);
}

export function stopReminderScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function checkOverdueOnStartup() {
  const now = Date.now();
  const due = listDueReminders(now);
  if (due.length > 0) {
    broadcast("reminder:trigger", { reminders: due });
    due.forEach((reminder) => markReminderDone(reminder.id));
  }
}
