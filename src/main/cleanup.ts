import { purgeDeletedTasks } from "./db/tasksRepo";

let timer: NodeJS.Timeout | null = null;

export function runCleanupOnce() {
  purgeDeletedTasks(30 * 24 * 60 * 60 * 1000);
}

export function startCleanupJob() {
  if (timer) {
    return;
  }
  timer = setInterval(runCleanupOnce, 6 * 60 * 60 * 1000);
}

export function stopCleanupJob() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
