import { app } from "electron";
import { initDatabase } from "./db";
import { createTask, listRootTasks } from "./db/tasksRepo";
import { createTaskWindow, loadWindowStates, persistAllWindowStates } from "./windowManager";
import { registerIpcHandlers } from "./ipc/handlers";
import { checkOverdueOnStartup, startReminderScheduler, stopReminderScheduler } from "./reminderScheduler";
import { runCleanupOnce, startCleanupJob, stopCleanupJob } from "./cleanup";

function ensureInitialTask() {
  const roots = listRootTasks({ includeArchived: true, includeDeleted: true });
  if (roots.length === 0) {
    const task = createTask({ title: "我的任务" });
    return task.id;
  }
  return roots[0].id;
}

function restoreWindows() {
  const states = loadWindowStates();
  if (states.length === 0) {
    const rootTaskId = ensureInitialTask();
    createTaskWindow(rootTaskId);
    return;
  }
  states.forEach((state) => {
    createTaskWindow(state.rootTaskId, state);
  });
}

app.whenReady().then(() => {
  initDatabase();
  registerIpcHandlers();
  restoreWindows();
  checkOverdueOnStartup();
  startReminderScheduler();
  runCleanupOnce();
  startCleanupJob();
});

app.on("before-quit", () => {
  persistAllWindowStates();
  stopReminderScheduler();
  stopCleanupJob();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (app.isReady() && process.platform === "darwin") {
    restoreWindows();
  }
});
