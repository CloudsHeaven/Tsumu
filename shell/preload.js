"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("tsumuShell", {
  platform: "electron",
  setTopmost: (on) => ipcRenderer.invoke("shell:set-topmost", !!on),
  isTopmost: () => ipcRenderer.invoke("shell:is-topmost"),
  minimize: () => ipcRenderer.send("shell:minimize"),
  close: () => ipcRenderer.send("shell:close"),
  setFullscreen: (on) => ipcRenderer.send("shell:fullscreen", !!on),
  quit: () => ipcRenderer.send("shell:quit"),
  saveWebStorage: (obj) => ipcRenderer.send("storage:save", obj),
  saveWebStorageSync: (obj) => ipcRenderer.sendSync("storage:save-sync", obj),

  onDownloadDone: (fn) => {
    if (typeof fn !== "function") return;
    ipcRenderer.on("tsumu:download-done", (e, info) => {
      try {
        fn(info);
      } catch (err) {
      }
    });
  }
});
