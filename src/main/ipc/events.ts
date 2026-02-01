import { BrowserWindow } from "electron";
import type { IpcEventMap } from "../../shared/ipc";

export function broadcast<K extends keyof IpcEventMap>(channel: K, payload: IpcEventMap[K]) {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(channel, payload);
  });
}
