import { contextBridge, ipcRenderer } from "electron";
import type { NativeApi } from "../shared/types";

const api: NativeApi = {
  load: () => ipcRenderer.invoke("ninho:load"),
  dispatch: (command) => ipcRenderer.invoke("ninho:dispatch", command),
  importMaterials: (context) =>
    ipcRenderer.invoke("ninho:import-materials", context),
  previewMaterial: (id) => ipcRenderer.invoke("ninho:preview-material", id),
  openMaterial: (id) => ipcRenderer.invoke("ninho:open-material", id),
  openExternal: (url) => ipcRenderer.invoke("ninho:open-external", url),
  exportBackup: () => ipcRenderer.invoke("ninho:export-backup"),
  restoreBackup: () => ipcRenderer.invoke("ninho:restore-backup"),
  getPaths: () => ipcRenderer.invoke("ninho:get-paths"),
};

contextBridge.exposeInMainWorld("ninho", Object.freeze(api));
