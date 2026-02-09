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
  listChildTasksByCreatedAt,
  getAncestorChain,
  softDeleteTaskRecursively,
  restoreTaskRecursively,
  searchTasks
} from "../db/tasksRepo";
import { createEdge, deleteEdge, deleteEdgesByChildId } from "../db/edgesRepo";
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
  toggleSkinPanel,
  showContextMenuPanel,
  hideContextMenuPanel,
  selectContextMenuItem
} from "../windowManager";
import {
  appendTaskLinkToBlocksEnd,
  deriveChildCompletionChangesFromBlocksDiff,
  removeTaskLinksByTaskId,
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

function assertValidParenting(childId: string, targetParentId: string) {
  if (!childId || !targetParentId) {
    return;
  }
  if (childId === targetParentId) {
    throw new Error("不能将任务设置为自己的子任务");
  }
  const chain = getAncestorChain(targetParentId);
  if (chain.some((task) => task.id === childId)) {
    throw new Error("不能移动到当前任务的子孙节点下");
  }
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

  ipcMain.handle("task:listChildrenFlat", (_event, input: Parameters<IpcInvokeMap["task:listChildrenFlat"]>[0]) => {
    return listChildTasksByCreatedAt(input.parentId, { includeArchived: input.includeArchived, includeDeleted: input.includeDeleted });
  });

  ipcMain.handle("task:listParents", (_event, input: Parameters<IpcInvokeMap["task:listParents"]>[0]) => {
    return listParentsByChildId(input.childId);
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

  ipcMain.handle("task:insertExistingChildLink", (_event, input: Parameters<IpcInvokeMap["task:insertExistingChildLink"]>[0]) => {
    const parent = getTaskById(input.parentId);
    if (!parent) {
      throw new Error("父任务不存在");
    }
    const child = getTaskById(input.childId);
    if (!child || child.isDeleted) {
      throw new Error("子任务不存在");
    }
    assertValidParenting(child.id, parent.id);

    createEdge(input.parentId, input.childId);

    const appended = appendTaskLinkToBlocksEnd(parent.blocks, {
      taskId: child.id,
      title: child.title,
      isCompleted: child.isCompleted
    });
    if (appended.changed) {
      updateTask({ id: parent.id, blocks: appended.blocks });
    }

    broadcast("task:updated", { taskId: parent.id });
    broadcast("task:updated", { taskId: child.id });
    return child;
  });

  ipcMain.handle("task:moveChildReference", (_event, input: Parameters<IpcInvokeMap["task:moveChildReference"]>[0]) => {
    const sourceParent = getTaskById(input.sourceParentId);
    const targetParent = getTaskById(input.targetParentId);
    const child = getTaskById(input.childId);
    if (!sourceParent || !targetParent || !child) {
      throw new Error("任务不存在，无法移动");
    }
    if (sourceParent.id === targetParent.id) {
      return child;
    }
    assertValidParenting(child.id, targetParent.id);

    deleteEdge(sourceParent.id, child.id);
    createEdge(targetParent.id, child.id);

    const sourceRemoved = removeTaskLinksByTaskId(sourceParent.blocks, child.id);
    if (sourceRemoved.changed) {
      updateTask({ id: sourceParent.id, blocks: sourceRemoved.blocks });
    }

    const targetInserted = appendTaskLinkToBlocksEnd(targetParent.blocks, {
      taskId: child.id,
      title: child.title,
      isCompleted: child.isCompleted
    });
    if (targetInserted.changed) {
      updateTask({ id: targetParent.id, blocks: targetInserted.blocks });
    }

    broadcast("task:updated", { taskId: sourceParent.id });
    broadcast("task:updated", { taskId: targetParent.id });
    broadcast("task:updated", { taskId: child.id });
    return child;
  });

  ipcMain.handle("task:archiveCompletedChildren", (_event, input: Parameters<IpcInvokeMap["task:archiveCompletedChildren"]>[0]) => {
    const parent = getTaskById(input.parentId);
    if (!parent) {
      throw new Error("父任务不存在");
    }
    const children = listChildTasks(input.parentId, { includeArchived: false, includeDeleted: false });
    const completedChildren = children.filter((child) => child.isCompleted);

    completedChildren.forEach((child) => {
      updateTask({ id: child.id, isArchived: true });
    });

    let nextBlocks = parent.blocks;
    let changed = false;
    completedChildren.forEach((child) => {
      const removed = removeTaskLinksByTaskId(nextBlocks, child.id);
      if (removed.changed) {
        nextBlocks = removed.blocks;
        changed = true;
      }
    });
    if (changed) {
      updateTask({ id: parent.id, blocks: nextBlocks });
    }

    broadcast("task:updated", { taskId: parent.id });
    completedChildren.forEach((child) => {
      broadcast("task:updated", { taskId: child.id });
    });

    return { archivedIds: completedChildren.map((child) => child.id) };
  });

  ipcMain.handle("edge:create", (_event, input: Parameters<IpcInvokeMap["edge:create"]>[0]) => {
    createEdge(input.parentId, input.childId);
  });

  ipcMain.handle("edge:delete", (_event, input: Parameters<IpcInvokeMap["edge:delete"]>[0]) => {
    deleteEdge(input.parentId, input.childId);
  });

  ipcMain.handle("edge:reparent", (_event, input: Parameters<IpcInvokeMap["edge:reparent"]>[0]) => {
    const child = getTaskById(input.childId);
    if (!child) {
      throw new Error("任务不存在");
    }

    if (input.fromParentId) {
      deleteEdge(input.fromParentId, input.childId);
    } else {
      deleteEdgesByChildId(input.childId);
    }

    if (input.toParentId) {
      assertValidParenting(input.childId, input.toParentId);
      createEdge(input.toParentId, input.childId);
      broadcast("task:updated", { taskId: input.toParentId });
    }

    if (input.fromParentId) {
      broadcast("task:updated", { taskId: input.fromParentId });
    }
    broadcast("task:updated", { taskId: input.childId });
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

  ipcMain.handle("window:showContextMenu", (_event, input: Parameters<IpcInvokeMap["window:showContextMenu"]>[0]) => {
    return showContextMenuPanel(input.windowId, input.x, input.y, input.items);
  });

  ipcMain.handle("window:hideContextMenu", (_event, input: Parameters<IpcInvokeMap["window:hideContextMenu"]>[0]) => {
    return hideContextMenuPanel(input.windowId);
  });

  ipcMain.handle("window:contextMenuSelect", (_event, input: Parameters<IpcInvokeMap["window:contextMenuSelect"]>[0]) => {
    return selectContextMenuItem(input.windowId, input.itemId);
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
