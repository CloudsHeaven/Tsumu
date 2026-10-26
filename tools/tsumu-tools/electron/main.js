"use strict";
const fs = require("fs");
const path = require("path");
const LOG = path.join(__dirname, "..", "gui.log");
let BUILD = "?";
try {
  BUILD = fs.statSync(__filename).mtime.toISOString().slice(5, 16).replace("T", " ");
} catch (e) {
}
function log(msg) {
  const line = ( new Date()).toISOString() + "  " + msg;
  try {
    fs.appendFileSync(LOG, line + "\n");
  } catch (e) {
  }
  try {
    process.stdout.write(line + "\n");
  } catch (e) {
  }
}
try {
  fs.writeFileSync(LOG, "");
} catch (e) {
}
log("=== start BUILD=" + BUILD + " pid=" + process.pid + " electron=" + process.versions.electron + " chrome=" + process.versions.chrome + " node=" + process.versions.node + " execPath=" + process.execPath);
log("argv=" + JSON.stringify(process.argv.slice(1)));
process.on("uncaughtException", (e) => log("UNCAUGHT " + (e && e.stack || e)));
process.on("unhandledRejection", (e) => log("UNHANDLED " + (e && e.stack || e)));
const { app, BrowserWindow, WebContentsView, dialog, ipcMain, shell } = require("electron");
const { fork, spawn, execFileSync } = require("child_process");
log("electron module required");
const { readOnnxMetadata, parseUvrMeta } = require("../src/onnx-meta");
const { findModel, collectInputs, describe } = require("../src/scan");
let win = null;
let child = null;
let MODEL = null, META = null, MODEL_ERR = null;
try {
  MODEL = findModel(process.env.TSUMU_MODEL || null);
  META = parseUvrMeta(readOnnxMetadata(MODEL), null);
} catch (e) {
  MODEL_ERR = e.message;
}
log("model=" + MODEL + " err=" + MODEL_ERR);
function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 780,
    minWidth: 760,
    minHeight: 600,
    backgroundColor: "#07050a",

    frame: false,

    title: "织音 · 工具",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.once("ready-to-show", () => {
    log("ready-to-show");
    if (process.env.TSUMU_HIDE_WINDOW === "1") log("window kept hidden (TSUMU_HIDE_WINDOW=1)");
    else win.show();
  });
  win.webContents.on("did-finish-load", () => log("did-finish-load"));
  win.webContents.on("did-fail-load", (_e, code, desc) => log("did-fail-load " + code + " " + desc));
  win.webContents.on("render-process-gone", (_e, d) => log("render-process-gone " + JSON.stringify(d)));
  win.on("closed", () => log("window closed"));
  win.loadFile(path.join(__dirname, "index.html"));
  log("loadFile called");
}
app.on("child-process-gone", (_e, d) => log("child-process-gone " + JSON.stringify(d)));
app.on("render-process-gone", (_e, _wc, d) => log("app render-process-gone " + JSON.stringify(d)));
app.on("will-quit", () => log("will-quit"));
app.on("quit", (_e, code) => log("quit code=" + code));
log("calling app.whenReady()");
function probeWrites() {
  const spots = [
    ["<tool>", path.join(__dirname, "..")],
    ["<tool>\\tmp", path.join(__dirname, "..", "tmp")],
    ["<tool>\\profile", path.join(__dirname, "..", "profile")]
  ];
  try {
    spots.push(["%TEMP%", app.getPath("temp")]);
  } catch (e) {
  }
  for (const [tag, d] of spots) {
    let file = "-", mkdir = "-";
    try {
      const f = path.join(d, "~probe.txt");
      fs.writeFileSync(f, "x");
      fs.unlinkSync(f);
      file = "OK";
    } catch (e) {
      file = e.code || e.message;
    }
    try {
      const s = path.join(d, "~probe_dir");
      fs.mkdirSync(s);
      fs.rmdirSync(s);
      mkdir = "OK";
    } catch (e) {
      mkdir = e.code || e.message;
    }
    const line = "WRITEPROBE " + tag + "  file=" + file + "  mkdir=" + mkdir;
    log(line);
    try {
      process.stdout.write(line + "\n");
    } catch (e) {
    }
  }
}
app.whenReady().then(() => {
  log("whenReady");
  try {
    log("userData=" + app.getPath("userData"));
  } catch (e) {
    log("getPath failed: " + e.message);
  }
  try {
    probeWrites();
  } catch (e) {
    log("probeWrites failed: " + e.message);
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((e) => log("whenReady failed " + (e && e.stack || e)));
app.on("window-all-closed", () => {
  log("window-all-closed");
  if (child) {
    try {
      child.kill();
    } catch (e) {
    }
  }
  app.quit();
});
ipcMain.handle("meta", () => ({
  model: MODEL ? path.basename(MODEL) : null,
  modelErr: MODEL_ERR,
  meta: META && { nFft: META.nFft, dimF: META.dimF, dimT: META.dimT, hop: META.hopLength, sr: META.sampleRate }
}));
ipcMain.handle("pick", async () => {
  const r = await dialog.showOpenDialog(win, {
    title: "选择音乐文件夹",
    buttonLabel: "用这个文件夹",
    properties: ["openDirectory"]
  });
  return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
});
ipcMain.handle("scan", (_e, dir) => {
  if (!dir || typeof dir !== "string") return { error: "没有选择文件夹" };
  try {
    const files = collectInputs(dir).map(describe);
    log("scan " + dir + " -> " + files.length + " 首");
    return { dir, files };
  } catch (e) {
    log("scan failed " + e.message);
    return { error: "读不了这个文件夹：" + e.message };
  }
});
function findNode() {
  const cands = [];
  if (process.env.TSUMU_NODE) cands.push(process.env.TSUMU_NODE);
  try {
    const out = execFileSync("where", ["node.exe"], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    String(out).split(/\r?\n/).forEach((p) => {
      if (p.trim()) cands.push(p.trim());
    });
  } catch (e) {
  }
  const pf = process.env.ProgramFiles || "C:\\Program Files";
  const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  cands.push(path.join(pf, "nodejs", "node.exe"));
  cands.push(path.join(pf86, "nodejs", "node.exe"));
  if (process.env.LOCALAPPDATA) cands.push(path.join(process.env.LOCALAPPDATA, "Programs", "nodejs", "node.exe"));
  if (process.env.APPDATA) cands.push(path.join(process.env.APPDATA, "npm", "node.exe"));
  for (const c of cands) {
    try {
      if (c && fs.existsSync(c) && /node(\.exe)?$/i.test(c)) return c;
    } catch (e) {
    }
  }
  return null;
}
ipcMain.handle("run", (_e, opt) => {
  if (child) return { error: "已经有一个任务在跑" };
  if (!MODEL) return { error: "找不到模型：" + MODEL_ERR };
  if (!opt || !opt.dir) return { error: "没有选择文件夹" };
  log("run dir=" + opt.dir + " force=" + !!opt.force + " stems=" + !!opt.stems + " gpu=" + !!opt.gpu);
  const worker = path.join(__dirname, "worker.js");
  const nodeExe = findNode();
  const stdio = ["ignore", "pipe", "pipe", "ipc"];
  if (nodeExe) {
    child = spawn(nodeExe, [worker], { stdio, windowsHide: true });
    log("worker via node.exe: " + nodeExe);
  } else {
    child = fork(worker, [], { stdio });
    log("worker via electron-fork (node.exe 没找到 —— 本机若禁止 electron 写文件就会失败)");
  }
  log("started worker pid=" + child.pid);
  child.stdout.on("data", (d) => {
    const s = String(d).trim();
    if (s) log("[worker] " + s);
  });
  child.stderr.on("data", (d) => {
    const s = String(d).trim();
    if (s) log("[worker!] " + s);
  });
  child.on("error", (e) => {
    log("worker error " + (e && e.stack || e));
    if (win && !win.isDestroyed()) win.webContents.send("ev", { type: "error", message: "worker 起不来：" + e.message });
    child = null;
  });
  child.on("exit", (code, sig) => {
    log("worker exit code=" + code + " signal=" + sig);
    child = null;
  });
  child.on("message", (m) => {
    if (m && m.type === "delegate-write") {
      const buf = Buffer.from(m.data);
      let how = null, err = null;
      if (process.env.TSUMU_FORCE_CMDCOPY !== "1") {
        try {
          fs.writeFileSync(m.path, buf);
          how = "main";
        } catch (e) {
          err = e;
        }
      } else {
        err = new Error("(forced skip)");
      }
      if (!how) {
        let tmp = null;
        try {
          const names = [
            path.join(__dirname, "..", "~tmp_" + path.basename(m.path)),
            path.join(require("os").tmpdir(), "tsumu-" + path.basename(m.path))
          ];
          let lastErr = null;
          for (const cand of names) {
            try {
              fs.writeFileSync(cand, buf);
              tmp = cand;
              lastErr = null;
              break;
            } catch (e) {
              lastErr = e;
            }
          }
          if (!tmp) throw lastErr || new Error("找不到可写的临时位置");
          if (/[&|<>^]/.test(m.path) || /[&|<>^]/.test(tmp)) throw new Error("路径含 cmd 特殊字符，跳过 cmd 兜底");
          execFileSync("cmd.exe", ["/c", "copy", "/y", tmp, m.path], { windowsHide: true, stdio: "ignore" });
          const st = fs.statSync(m.path);
          if (st.size !== buf.length) throw new Error("copy 后大小不符: " + st.size + " != " + buf.length);
          how = "cmd-copy";
          err = null;
        } catch (e2) {
          err = e2;
        } finally {
          if (tmp) {
            try {
              fs.unlinkSync(tmp);
            } catch (e3) {
            }
          }
        }
      }
      if (how) {
        log("delegate-write OK via " + how + "  " + m.path + "  (" + buf.length + " B)");
        child.send({ cmd: "write-done", id: m.id, ok: true });
      } else {
        log("delegate-write FAILED(2,3) " + m.path + "  " + (err && err.code) + "  " + (err && err.message));
        child.send({ cmd: "write-done", id: m.id, ok: false, error: err && err.message || "写文件失败" });
      }
      return;
    }
    if (m && m.type === "ev") {
      if (m.ev && (m.ev.type === "file-done" || m.ev.type === "file-error" || m.ev.type === "error" || m.ev.type === "done" || m.ev.type === "plan" || m.ev.type === "note")) {
        log("[ev] " + JSON.stringify(m.ev));
      }
      if (win && !win.isDestroyed()) win.webContents.send("ev", m.ev);
    }
  });
  child.send({ cmd: "run", opt });
  return { started: true };
});
ipcMain.handle("reveal", (_e, dir) => {
  if (dir) shell.openPath(dir);
  return { ok: true };
});
const TAB_H = 88;
let tapperView = null;
let tapperOwner = null;
let tabNow = "sep";
function tapperCandidates() {
  const list = [];
  if (process.env.TSUMU_TAPPER) list.push(process.env.TSUMU_TAPPER);
  list.push(path.join(__dirname, "tapper.html"));
  list.push(path.join(process.env.USERPROFILE || "", "Desktop", "<repo>", "tools", "lyric-tapper.html"));
  list.push(path.join(__dirname, "..", "..", "<repo>", "tools", "lyric-tapper.html"));
  return list.filter((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch (e) {
      return false;
    }
  });
}
function ensureTapperView() {
  if (!win || win.isDestroyed()) return null;
  if (tapperView && tapperOwner === win && !tapperView.webContents.isDestroyed()) return tapperView;
  if (tapperView) {
    try {
      tapperView.webContents.close();
    } catch (e) {
    }
    tapperView = null;
  }
  const target = tapperCandidates()[0] || "";
  if (!target) {
    dialog.showErrorBox("找不到打点页", "electron\\tapper.html 不存在，也没有设置 TSUMU_TAPPER。");
    return null;
  }
  tapperView = new WebContentsView({ webPreferences: { contextIsolation: true, nodeIntegration: false } });
  tapperView.setBackgroundColor("#14141a");
  tapperView.setVisible(false);
  win.contentView.addChildView(tapperView);
  tapperView.webContents.loadFile(target);
  tapperOwner = win;
  win.on("resize", layoutTapper);
  log("tapper view loadFile " + target);
  return tapperView;
}
function layoutTapper() {
  if (!tapperView || !win || win.isDestroyed() || tapperView.webContents.isDestroyed()) return;
  const size = win.getContentSize();
  const w = size[0], h = size[1];
  tapperView.setBounds({ x: 0, y: TAB_H, width: Math.max(0, w), height: Math.max(0, h - TAB_H) });
}
ipcMain.handle("setTab", (_e, which) => {
  const want = which === "tap" ? "tap" : "sep";
  tabNow = want;
  if (want === "tap") {
    const v = ensureTapperView();
    if (!v) {
      log("setTab tap failed");
      return { ok: false, error: "no-tapper" };
    }
    layoutTapper();
    v.setVisible(true);
    v.webContents.focus();
  } else if (tapperView && !tapperView.webContents.isDestroyed()) {
    tapperView.setVisible(false);
    if (win && !win.isDestroyed()) win.webContents.focus();
  }
  log("tab=" + tabNow);
  return { ok: true, tab: tabNow };
});
ipcMain.handle("winMin", () => {
  if (win && !win.isDestroyed()) win.minimize();
  return { ok: true };
});
ipcMain.handle("quit", () => {
  log("quit requested");
  if (child) {
    try {
      child.kill();
    } catch (e) {
    }
  }
  app.quit();
  return { ok: true };
});
