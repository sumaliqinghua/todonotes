import { ipcMain, shell } from "electron";
import type { IpcInvokeMap } from "../../shared/ipc";
import {
  createTask,
  hasTaskTitle,
  updateTask,
  getTaskById,
  listParentsByChildId,
  listRootTasks,
  listChildTasks,
  getAncestorChain,
  softDeleteTaskRecursively,
  restoreTaskRecursively,
  searchTasks
} from "../db/tasksRepo";
import { createEdge, deleteEdge } from "../db/edgesRepo";
import { createReminder, deleteReminder, listDueReminders, listRemindersByTask, markReminderDone } from "../db/remindersRepo";
import { addAttachment, getAttachment, listAttachments } from "../db/attachmentsRepo";
import { broadcast } from "./events";
import {
  createTaskWindow,
  getWindowById,
  getWindowState,
  updateWindowState,
  loadWindowStates,
  replaceStickyBookmarkTitle,
  toggleSkinPanel
} from "../windowManager";
import {
  deriveChildCompletionChangesFromBlocksDiff,
  normalizeTaskTitle,
  syncChildStateInBlocks
} from "../../shared/taskBlocksSync";

function assertUniqueTaskTitle(title: string, options?: { excludeTaskId?: string }) {
  const normalized = normalizeTaskTitle(title);
  if (!normalized) {
    return;
  }
  if (hasTaskTitle(normalized, { excludeTaskId: options?.excludeTaskId })) {
    throw new Error(`任务标题“${normalized}”已存在，请使用其他名称`);
  }
}

function isBlocksPayload(value: unknown): boolean {
  return Boolean(value) && typeof value === "object";
}

function syncParentBlocksForChild(taskId: string, previousTitle: string | undefined, currentTitle: string, isCompleted: boolean) {
  const parents = listParentsByChildId(taskId);
  const updatedParentIds = new Set<string>();
  parents.forEach((parent) => {
    const synced = syncChildStateInBlocks(parent.blocks, { id: taskId, title: currentTitle, isCompleted }, previousTitle);
    if (!synced.changed) {
      return;
    }
    updateTask({ id: parent.id, blocks: synced.blocks });
    updatedParentIds.add(parent.id);
  });
  return updatedParentIds;
}

function syncTaskCompletionFromParentBlocks(input: Parameters<IpcInvokeMap["task:update"]>[0]) {
  if (!isBlocksPayload(input.blocks)) {
    return;
  }
  const existing = getTaskById(input.id);
  if (!existing) {
    return;
  }
  const children = listChildTasks(input.id, { includeArchived: true, includeDeleted: false });
  const completionChanges = deriveChildCompletionChangesFromBlocksDiff(existing.blocks, input.blocks!, children);
  completionChanges.forEach((change) => {
    const child = getTaskById(change.childId);
    if (!child || child.isCompleted === change.isCompleted) {
      return;
    }
    const updatedChild = updateTask({ id: child.id, isCompleted: change.isCompleted });
    const touchedParents = syncParentBlocksForChild(updatedChild.id, child.title, updatedChild.title, updatedChild.isCompleted);
    broadcast("task:updated", { taskId: updatedChild.id });
    touchedParents?.forEach((parentId) => {
      broadcast("task:updated", { taskId: parentId });
    });
  });
}

function syncTaskReferenceUpdates(task: ReturnType<typeof updateTask>, previous: ReturnType<typeof getTaskById>) {
  const previousTitle = previous?.title;
  const parentsUpdated = syncParentBlocksForChild(task.id, previousTitle, task.title, task.isCompleted);
  if (previousTitle !== task.title) {
    replaceStickyBookmarkTitle(task.id, task.title);
  }
  return parentsUpdated;
}

export function registerIpcHandlers() {
  ipcMain.handle("task:create", (_event, input: Parameters<IpcInvokeMap["task:create"]>[0]) => {
    assertUniqueTaskTitle(input.title);
    const task = createTask(input);
    broadcast("task:updated", { taskId: task.id });
    return task;
  });

  ipcMain.handle("task:update", (_event, input: Parameters<IpcInvokeMap["task:update"]>[0]) => {
    const existing = getTaskById(input.id);
    if (!existing) {
      throw new Error("任务不存在");
    }

    if (typeof input.title === "string") {
      assertUniqueTaskTitle(input.title, { excludeTaskId: input.id });
    }

    syncTaskCompletionFromParentBlocks(input);

    const task = updateTask(input);

    const touchedParents = syncTaskReferenceUpdates(task, existing);

    broadcast("task:updated", { taskId: task.id });
    touchedParents?.forEach((parentId) => {
      broadcast("task:updated", { taskId: parentId });
    });
    return task;
  });

  ipcMain.handle("task:get", (_event, input: Parameters<IpcInvokeMap["task:get"]>[0]) => {
    return getTaskById(input.id);
  });

  ipcMain.handle("task:validateUniqueTitle", (_event, input: Parameters<IpcInvokeMap["task:validateUniqueTitle"]>[0]) => {
    const normalized = normalizeTaskTitle(input.title);
    if (!normalized) {
      return { ok: true, normalizedTitle: "" };
    }
    if (hasTaskTitle(normalized, { excludeTaskId: input.excludeTaskId })) {
      return {
        ok: false,
        normalizedTitle: normalized,
        message: `任务标题“${normalized}”已存在，请使用其他名称`
      };
    }
    return { ok: true, normalizedTitle: normalized };
  });

  ipcMain.handle("task:listRoots", (_event, input: Parameters<IpcInvokeMap["task:listRoots"]>[0]) => {
    return listRootTasks(input);
  });

  ipcMain.handle("task:listChildren", (_event, input: Parameters<IpcInvokeMap["task:listChildren"]>[0]) => {
    return listChildTasks(input.parentId, { includeArchived: input.includeArchived, includeDeleted: input.includeDeleted });
  });

  ipcMain.handle("task:getAncestors", (_event, input: Parameters<IpcInvokeMap["task:getAncestors"]>[0]) => {
    return getAncestorChain(input.taskId);
  });

  ipcMain.handle("task:delete", (_event, input: Parameters<IpcInvokeMap["task:delete"]>[0]) => {
    softDeleteTaskRecursively(input.id);
    broadcast("task:deleted", { taskId: input.id });
  });

  ipcMain.handle("task:restore", (_event, input: Parameters<IpcInvokeMap["task:restore"]>[0]) => {
    restoreTaskRecursively(input.id);
    broadcast("task:updated", { taskId: input.id });
  });

  ipcMain.handle("task:search", (_event, input: Parameters<IpcInvokeMap["task:search"]>[0]) => {
    return searchTasks(input);
  });

  ipcMain.handle("task:createFromBlock", (_event, input: Parameters<IpcInvokeMap["task:createFromBlock"]>[0]) => {
    assertUniqueTaskTitle(input.title);
    const task = createTask({ title: input.title });
    createEdge(input.parentId, task.id);
    broadcast("task:updated", { taskId: input.parentId });
    broadcast("task:updated", { taskId: task.id });
    return task;
  });

  ipcMain.handle("edge:create", (_event, input: Parameters<IpcInvokeMap["edge:create"]>[0]) => {
    createEdge(input.parentId, input.childId);
  });

  ipcMain.handle("edge:delete", (_event, input: Parameters<IpcInvokeMap["edge:delete"]>[0]) => {
    deleteEdge(input.parentId, input.childId);
  });

  ipcMain.handle("window:open", (_event, input: Parameters<IpcInvokeMap["window:open"]>[0]) => {
    const windowType = input.windowType ?? "library";
    if (windowType === "sticky") {
      const chain = getAncestorChain(input.rootTaskId);
      const sharedRootTaskId = chain[0]?.id ?? input.rootTaskId;
      const navPathTaskIds = [...chain.map((task) => task.id), input.rootTaskId];
      const { windowId } = createTaskWindow(sharedRootTaskId, undefined, { windowType: "sticky", navPathTaskIds });
      return { windowId };
    }
    const { windowId } = createTaskWindow(input.rootTaskId, undefined, { windowType });
    return { windowId };
  });

  ipcMain.handle("window:getState", (_event, input: Parameters<IpcInvokeMap["window:getState"]>[0]) => {
    return getWindowState(input.windowId);
  });

  ipcMain.handle("window:updateState", (_event, input: Parameters<IpcInvokeMap["window:updateState"]>[0]) => {
    updateWindowState(input);
    const hasSettingsUpdate =
      typeof input.stickyColor === "string" ||
      typeof input.stickyOpacity === "number" ||
      typeof input.opacity === "number" ||
      typeof input.alwaysOnTop === "boolean";
    if (hasSettingsUpdate) {
      broadcast("window:settings-updated", {
        windowId: input.windowId,
        stickyColor: input.stickyColor,
        stickyOpacity: input.stickyOpacity,
        opacity: input.opacity,
        alwaysOnTop: input.alwaysOnTop
      });
    }
  });

  ipcMain.handle("window:getAllStates", () => {
    return loadWindowStates();
  });

  ipcMain.handle("window:minimize", (_event, input: Parameters<IpcInvokeMap["window:minimize"]>[0]) => {
    const win = getWindowById(input.windowId);
    win?.minimize();
  });

  ipcMain.handle("window:close", (_event, input: Parameters<IpcInvokeMap["window:close"]>[0]) => {
    const win = getWindowById(input.windowId);
    win?.close();
  });

  ipcMain.handle("window:toggleSkinPanel", (_event, input: Parameters<IpcInvokeMap["window:toggleSkinPanel"]>[0]) => {
    return toggleSkinPanel(input.windowId, input.open);
  });

  ipcMain.handle("reminder:create", (_event, input: Parameters<IpcInvokeMap["reminder:create"]>[0]) => {
    return createReminder(input);
  });

  ipcMain.handle("reminder:delete", (_event, input: Parameters<IpcInvokeMap["reminder:delete"]>[0]) => {
    deleteReminder(input.id);
  });

  ipcMain.handle("reminder:listByTask", (_event, input: Parameters<IpcInvokeMap["reminder:listByTask"]>[0]) => {
    return listRemindersByTask(input.taskId);
  });

  ipcMain.handle("reminder:listDue", (_event, input: Parameters<IpcInvokeMap["reminder:listDue"]>[0]) => {
    return listDueReminders(input.now);
  });

  ipcMain.handle("reminder:markDone", (_event, input: Parameters<IpcInvokeMap["reminder:markDone"]>[0]) => {
    markReminderDone(input.id);
  });

  ipcMain.handle("attachment:add", (_event, input: Parameters<IpcInvokeMap["attachment:add"]>[0]) => {
    return addAttachment(input);
  });

  ipcMain.handle("attachment:list", (_event, input: Parameters<IpcInvokeMap["attachment:list"]>[0]) => {
    return listAttachments(input.taskId);
  });

  ipcMain.handle("attachment:reveal", (_event, input: Parameters<IpcInvokeMap["attachment:reveal"]>[0]) => {
    const attachment = getAttachment(input.attachmentId);
    if (attachment) {
      shell.showItemInFolder(attachment.storedPath);
    }
  });
}
