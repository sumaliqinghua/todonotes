import { Notification } from "electron";
import { focusStickyTaskBlock } from "./windowManager";

const activeNotifications = new Set<Notification>();

export function showTaskNotification(input: { title: string; body: string; taskId?: string; blockId?: string }) {
  if (!Notification.isSupported()) {
    return;
  }
  const notification = new Notification({ title: input.title, body: input.body, silent: false });
  activeNotifications.add(notification);
  const release = () => {
    activeNotifications.delete(notification);
  };
  notification.once("click", () => {
    if (input.taskId) {
      focusStickyTaskBlock(input.taskId, input.blockId);
    }
    release();
  });
  notification.once("show", () => {
    setTimeout(release, 5000);
  });
  notification.once("failed", release);
  notification.show();
}
