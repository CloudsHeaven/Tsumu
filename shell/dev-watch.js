"use strict";
const fs = require("fs");
const path = require("path");
const WEB = path.resolve(__dirname, "..", "web");
const MAIN_FILES = ["main.js", "preload.js", "web-storage.js"];
module.exports = function attachDevWatch(win, app) {
  if (process.env.TSUMU_DEV !== "1") return;
  if (!fs.existsSync(WEB)) return;
  let timer = null;
  const reload = () => {
    if (win && !win.isDestroyed()) {
      win.webContents.reloadIgnoringCache();
      console.log("[dev] 已刷新窗口（web 变更）");
    }
  };
  try {
    fs.watch(WEB, { recursive: true }, (_evt, filename) => {
      if (!filename) return;
      const f = String(filename);
      if (f.includes("node_modules")) return;
      clearTimeout(timer);
      timer = setTimeout(reload, 180);
    });
    console.log("[dev] 热重载已开启：" + WEB);
  } catch (e) {
    console.log("[dev] 无法监听 web/：" + (e && e.message || e));
  }
  app.on("before-quit", () => {
    try {
      fs.unwatchFile(WEB);
    } catch (e) {
    }
  });
};
module.exports.MAIN_FILES = MAIN_FILES;
