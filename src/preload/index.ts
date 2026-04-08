import { contextBridge, ipcRenderer } from "electron";
import type { IpcEventMap, IpcInvokeMap } from "../shared/ipc";

const api = {
  invoke: <K extends keyof IpcInvokeMap>(
    channel: K,
    ...args: Parameters<IpcInvokeMap[K]> extends [] ? [] : [Parameters<IpcInvokeMap[K]>[0]]
  ) => {
    return ipcRenderer.invoke(channel, args[0]) as Promise<ReturnType<IpcInvokeMap[K]>>;
  },
  on: <K extends keyof IpcEventMap>(channel: K, listener: (payload: IpcEventMap[K]) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, data: IpcEventMap[K]) => listener(data);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  }
};

contextBridge.exposeInMainWorld("api", api);

export type Api = typeof api;
