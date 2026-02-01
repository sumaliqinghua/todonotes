export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface Task {
  id: string;
  title: string;
  blocks: JsonValue;
  isCompleted: boolean;
  isArchived: boolean;
  isDeleted: boolean;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Edge {
  parentTaskId: string;
  childTaskId: string;
  createdAt: number;
}

export interface WindowState {
  windowId: string;
  rootTaskId: string;
  navPathTaskIds: string[];
  windowType: "library" | "sticky";
  x: number | null;
  y: number | null;
  width: number;
  height: number;
  opacity: number;
  stickyColor: string;
  stickyOpacity: number;
  alwaysOnTop: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Reminder {
  id: string;
  taskId: string;
  remindAt: number;
  isDone: boolean;
  createdAt: number;
}

export interface Attachment {
  id: string;
  taskId: string;
  originalName: string;
  storedName: string;
  storedPath: string;
  createdAt: number;
}

export interface SearchOptions {
  query: string;
  includeArchived?: boolean;
  includeDeleted?: boolean;
}

export interface TaskCreateInput {
  title: string;
  blocks?: JsonValue;
}

export interface TaskUpdateInput {
  id: string;
  title?: string;
  blocks?: JsonValue;
  isCompleted?: boolean;
  isArchived?: boolean;
}

export interface ReminderCreateInput {
  taskId: string;
  remindAt: number;
}

export interface AttachmentAddInput {
  taskId: string;
  filePath: string;
  originalName: string;
}
