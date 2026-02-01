import type { Attachment, AttachmentAddInput, Reminder, ReminderCreateInput, SearchOptions, Task, TaskCreateInput, TaskUpdateInput, WindowState } from "./types";

export interface IpcInvokeMap {
  "task:create": (input: TaskCreateInput) => Task;
  "task:update": (input: TaskUpdateInput) => Task;
  "task:get": (input: { id: string }) => Task | null;
  "task:listRoots": (input: { includeArchived?: boolean; includeDeleted?: boolean }) => Task[];
  "task:listChildren": (input: { parentId: string }) => Task[];
  "task:getAncestors": (input: { taskId: string }) => Task[];
  "task:delete": (input: { id: string }) => void;
  "task:restore": (input: { id: string }) => void;
  "task:search": (input: SearchOptions) => Task[];
  "task:createFromBlock": (input: { parentId: string; title: string }) => Task;

  "edge:create": (input: { parentId: string; childId: string }) => void;
  "edge:delete": (input: { parentId: string; childId: string }) => void;

  "window:open": (input: { rootTaskId: string; windowType?: "library" | "sticky" }) => { windowId: string };
  "window:getState": (input: { windowId: string }) => WindowState | null;
  "window:updateState": (input: Partial<WindowState> & { windowId: string }) => void;
  "window:getAllStates": () => WindowState[];
  "window:minimize": (input: { windowId: string }) => void;
  "window:close": (input: { windowId: string }) => void;

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
}
