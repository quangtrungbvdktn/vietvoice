import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("vietvoiceAgent", {
  pair: (input: { apiUrl: string; code: string; deviceId: string; name: string }) => ipcRenderer.invoke("agent:pair", input),
});
