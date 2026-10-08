import type { ApiRequest } from "../shared/bridge";
import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("bcis", {
  request: (input: ApiRequest) => ipcRenderer.invoke("bcis:request", input),
  saveReport: (input: { path: string; token: string }) =>
    ipcRenderer.invoke("bcis:save-report", input),
});
