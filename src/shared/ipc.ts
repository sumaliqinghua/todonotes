import type {
  Attachment,
  AttachmentAddInput,
  PriorityBlock,
  Reminder,
  ReminderCreateInput,
  SearchOptions,
  Task,
  TaskCreateInput,
  TaskUpdateInput,
  PopupMenuItem,
  WindowBookmark,
  WindowState
} from "./types";

export interface IpcInvokeMap {
  "task:create": (input: TaskCreateInput) => Task;
  "task:update": (input: TaskUpdateInput) => Task;
  "task:validateUniqueTitle": (input: { title: string; excludeTaskId?: string; parentId?: string }) => { ok: boolean; normalizedTitle: string; message?: string };
  "task:get": (input: { id: string }) => Task | null;
  "task:listRoots": (input: { includeArchived?: boolean; includeDeleted?: boolean }) => Task[];
  "task:listChildren": (input: { parentId: string; includeArchived?: boolean; includeDeleted?: boolean }) => Task[];
  "task:listChildrenFlat": (input: { parentId: string; includeArchived?: boolean; includeDeleted?: boolean }) => Task[];
  "task:getAncestors": (input: { taskId: string }) => Task[];
  "task:listParents": (input: { childId: string }) => Task[];
  "task:delete": (input: { id: string }) => void;
  "task:restore": (input: { id: string }) => void;
  "task:search": (input: SearchOptions) => Task[];
  "task:createFromBlock": (input: { parentId: string; title: string }) => Task;
  "task:insertExistingChildLink": (input: { parentId: string; childId: string }) => Task;
  "task:moveChildReference": (input: { sourceParentId: string; targetParentId: string; childId: string }) => Task;
  "task:archiveCompletedChildren": (input: { parentId: string }) => { archivedIds: string[] };
  "task:getPriorityBlocks": () => PriorityBlock[];

  "edge:create": (input: { parentId: string; childId: string }) => void;
  "edge:delete": (input: { parentId: string; childId: string }) => void;
  "edge:reparent": (input: { childId: string; fromParentId?: string; toParentId?: string }) => void;

  "window:open": (input: { rootTaskId: string; windowType?: "library" | "sticky" }) => { windowId: string };
  "window:getState": (input: { windowId: string }) => WindowState | null;
  "window:updateState": (input: Partial<WindowState> & { windowId: string }) => void;
  "window:getAllStates": () => WindowState[];
  "window:minimize": (input: { windowId: string }) => void;
  "window:close": (input: { windowId: string }) => void;
  "window:toggleSkinPanel": (input: { windowId: string; open?: boolean }) => { open: boolean };
  "window:showContextMenu": (input: { windowId: string; x: number; y: number; items: PopupMenuItem[] }) => { open: boolean };
  "window:hideContextMenu": (input: { windowId: string }) => { open: boolean };
  "window:contextMenuSelect": (input: { windowId: string; itemId: string }) => void;

  "reminder:create": (input: ReminderCreateInput) => Reminder;
  "reminder:delete": (input: { id: string }) => void;
  "reminder:listByTask": (input: { taskId: string }) => Reminder[];
  "reminder:listDue": (input: { now: number }) => Reminder[];
  "reminder:markDone": (input: { id: string }) => void;

  "attachment:add": (input: AttachmentAddInput) => Attachment;
  "attachment:list": (input: { taskId: string }) => Attachment[];
  "attachment:reveal": (input: { attachmentId: string }) => void;
}

export interface IpcEventMap {
  "task:updated": { taskId: string };
  "task:deleted": { taskId: string };
  "reminder:trigger": { reminders: Reminder[] };
  "window:focus-task": { taskId: string };
  "window:sticky-shared-updated": {
    rootTaskId: string;
    stickyBookmarks?: WindowBookmark[];
    stickyColor?: string;
    stickyOpacity?: number;
  };
  "window:settings-updated": {
    windowId: string;
    stickyColor?: string;
    stickyOpacity?: number;
    opacity?: number;
    alwaysOnTop?: boolean;
  };
  "window:context-menu-selected": {
    windowId: string;
    itemId: string;
  };
  "window:context-menu-closed": {
    windowId: string;
  };
}
