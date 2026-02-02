import { app } from "electron";
import { initDatabase } from "./db";
import { createTask, listRootTasks } from "./db/tasksRepo";
import { createTaskWindow, getWindowsByType, loadWindowStates, markAppQuitting, persistAllWindowStates } from "./windowManager";
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
  const libraryStates = states.filter((state) => state.windowType === "library");
  const stickyStates = states.filter((state) => state.windowType === "sticky");
  const libraryState = libraryStates[0];
  if (libraryState) {
    createTaskWindow(libraryState.rootTaskId, libraryState);
  } else {
    const rootTaskId = ensureInitialTask();
    createTaskWindow(rootTaskId, undefined, { windowType: "library" });
  }
  stickyStates.forEach((state) => {
    createTaskWindow(state.rootTaskId, state, { windowType: "sticky" });
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
  markAppQuitting();
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
    const { BrowserWindow } = require("electron");
    if (BrowserWindow.getAllWindows().length === 0) {
      restoreWindows();
      return;
    }
    const libraryWindows = getWindowsByType("library");
    const target = libraryWindows[0];
    if (target) {
      if (target.isMinimized()) {
        target.restore();
      }
      if (!target.isVisible()) {
        target.show();
      }
      target.focus();
    }
  }
});
