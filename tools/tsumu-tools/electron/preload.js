"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("api", {
  meta: () => ipcRenderer.invoke("meta"),
  pick: () => ipcRenderer.invoke("pick"),
  scan: (dir) => ipcRenderer.invoke("scan", dir),
  run: (opt) => ipcRenderer.invoke("run", opt),
  reveal: (dir) => ipcRenderer.invoke("reveal", dir),
  quit: () => ipcRenderer.invoke("quit"),
  minimize: () => ipcRenderer.invoke("winMin"),
  setTab: (which) => ipcRenderer.invoke("setTab", which),

  onEvent: (cb) => {
    ipcRenderer.on("ev", (_e, ev) => cb(ev));
  }
});
