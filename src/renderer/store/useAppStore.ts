import { create } from "zustand";
import type { Reminder, Task } from "../../shared/types";
import type { TaskTreeNode } from "../components/LibraryPanel";

export type LibraryTab = "inProgress" | "completed" | "deleted" | "archived";

export interface WindowSettings {
  opacity: number;
  alwaysOnTop: boolean;
  stickyColor: string;
  stickyOpacity: number;
}

interface AppState {
  navPath: string[];
  currentTask: Task | null;
  ancestors: Task[];
  libraryTasks: Task[];
  taskTree: TaskTreeNode[];
  searchQuery: string;
  reminders: Reminder[];
  windowSettings: WindowSettings;
  libraryTab: LibraryTab;
  setNavPath: (path: string[]) => void;
  setCurrentTask: (task: Task | null) => void;
  setAncestors: (ancestors: Task[]) => void;
  setLibraryTasks: (tasks: Task[]) => void;
  setTaskTree: (nodes: TaskTreeNode[]) => void;
  setSearchQuery: (query: string) => void;
  setReminders: (reminders: Reminder[]) => void;
  setLibraryTab: (tab: LibraryTab) => void;
  updateWindowSettings: (next: Partial<WindowSettings>) => void;
  reset: () => void;
}

const initialState = {
  navPath: [],
  currentTask: null,
  ancestors: [],
  libraryTasks: [],
  taskTree: [],
  searchQuery: "",
  reminders: [],
  windowSettings: {
    opacity: 1,
    alwaysOnTop: false,
    stickyColor: "#f6e8a6",
    stickyOpacity: 1
  },
  libraryTab: "inProgress" as LibraryTab
};

export const useAppStore = create<AppState>((set) => ({
  ...initialState,
  setNavPath: (path) => set({ navPath: path }),
  setCurrentTask: (task) => set({ currentTask: task }),
  setAncestors: (ancestors) => set({ ancestors }),
  setLibraryTasks: (tasks) => set({ libraryTasks: tasks }),
  setTaskTree: (nodes) => set({ taskTree: nodes }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setReminders: (reminders) => set({ reminders }),
  setLibraryTab: (tab) => set({ libraryTab: tab }),
  updateWindowSettings: (next) =>
    set((state) => ({
      windowSettings: {
        ...state.windowSettings,
        ...next
      }
    })),
  reset: () => set({ ...initialState })
}));

export const resetAppStore = () => {
  useAppStore.getState().reset();
};
