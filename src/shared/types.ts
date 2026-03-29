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
  stickyBookmarks: WindowBookmark[];
  alwaysOnTop: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface WindowBookmark {
  taskId: string;
  title: string;
  blockId?: string;        // 可选：文本块的唯一ID，用于定位到具体的文本块
  blockCursorOffset?: number; // 可选：文本块内光标偏移（相对块起始位置），用于恢复到记录行末
  blockContent?: string;   // 可选：文本块的内容预览（前100个字符），用于显示
  blockType?: string;      // 可选：文本块的类型（paragraph, heading, listItem等）
}

export interface PopupMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  children?: PopupMenuItem[];
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

export interface PriorityBlock {
  taskId: string;
  taskTitle: string;
  blockId: string;
  priority: number;
  text: string;
}
