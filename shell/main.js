"use strict";
const { app, BrowserWindow, ipcMain, shell, protocol, net } = require("electron");
app.setName("Tsumu");
const fs = require("fs");
const { Readable } = require("stream");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");
const webStorage = require("./web-storage");
if (app.commandLine.hasSwitch("remote-debugging-port") && !app.commandLine.hasSwitch("user-data-dir")) {
  const debugProfile = path.join(os.tmpdir(), "tsumu-remote-debug-profile");
  try {
    fs.mkdirSync(debugProfile, { recursive: true });
    app.setPath("userData", debugProfile);
    console.warn("[Tsumu] ⚠ 检测到 --remote-debugging-port：userData 已重定向到\n         " + debugProfile + "\n         本次运行不会读写用户真实存档；需要真实档请显式传 --user-data-dir=<目录>。");
  } catch (err) {
    console.error("[Tsumu] ✗ 无法隔离 userData，拒绝带着远程调试启动：" + (err && err.message));
    process.exit(1);
  }
}
protocol.registerSchemesAsPrivileged([{
  scheme: "tsumu",
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
    bypassCSP: true
  }
}]);
function webRoot() {
  const candidates = app.isPackaged ? [path.join(process.resourcesPath, "web")] : [path.join(__dirname, "..", "web"), path.join(app.getAppPath(), "..", "web")];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "index.html"))) return path.resolve(c);
  }
  throw new Error("web/index.html not found");
}
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".webp": "image/webp",

  ".moc3": "application/octet-stream",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};
function resolveUnder(root, pathname) {
  const rel = decodeURIComponent(pathname || "/").replace(/^\/+/, "").replace(/\\/g, "/");
  if (!rel || rel.split("/").includes("..")) {
    return path.join(root, "index.html");
  }
  const file = path.resolve(root, ...rel.split("/").filter(Boolean));
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  return file;
}
function jsonError(status, message) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "content-type": "application/json" }
  });
}
const HTTP_LAN_TARGET = /^http:\/\/(?:localhost|[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|0\.0\.0\.0|\[::\]|\[::1\]|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.local)(?::\d+)?(?:[/?#]|$)/i;
function proxyTargetAllowed(targetUrl) {
  const s = String(targetUrl || "");
  if (/^https:\/\//i.test(s)) return true;
  return HTTP_LAN_TARGET.test(s);
}
async function proxyRequest(request, targetUrl) {
  if (!proxyTargetAllowed(targetUrl)) {
    return jsonError(400, "proxy target must be https, or http on a local/private address");
  }
  const headers = { "User-Agent": "Tsumu/0.9.0-beta.1" };
  const ct = request.headers.get("content-type");
  const auth = request.headers.get("authorization");
  const apiKey = request.headers.get("api-key");
  const model = request.headers.get("model");
  if (ct) headers["Content-Type"] = ct;
  if (auth) headers.Authorization = auth;
  if (apiKey) headers["api-key"] = apiKey;
  if (model) headers.model = model;
  const init = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = Buffer.from(await request.arrayBuffer());
  }
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 18e4);
  init.signal = ac.signal;
  try {
    return await net.fetch(targetUrl, init);
  } catch (e) {
    return jsonError(502, String(e && e.message || e));
  } finally {
    clearTimeout(t);
  }
}
function firstExisting(root, candidates) {
  for (const p of candidates) {
    const abs = resolveUnder(root, p);
    if (abs && fs.existsSync(abs) && fs.statSync(abs).isFile()) return p;
  }
  return null;
}
async function handleTsumu(root, request) {
  let u;
  try {
    u = new URL(request.url);
  } catch (e) {
    return jsonError(400, "bad url");
  }
  if (u.pathname === "/_proxy" || u.pathname.startsWith("/_proxy")) {
    return proxyRequest(request, u.searchParams.get("u") || "");
  }
  let pathname = u.pathname;
  if (pathname === "/" || pathname === "" || pathname === "/index.html") {
    const want = process.env.TSUMU_ENTRY;
    const order = want ? ["/" + want] : ["/index.html"];
    pathname = firstExisting(root, order) || "/index.html";
    if (process.env.TSUMU_DEBUG === "1") {
      console.error("[entry] want=" + JSON.stringify(want) + " order=" + JSON.stringify(order) + " picked=" + pathname + " root=" + root);
    }
  }
  const file = resolveUnder(root, pathname);
  if (!file) return new Response("forbidden", { status: 403 });
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return new Response("not found", { status: 404 });
  }
  const ext = path.extname(file).toLowerCase();
  if (path.basename(file) === "index.html") {
    let html = fs.readFileSync(file, "utf8");
    html = webStorage.inject(html, webStorage.load(storeFile));
    return new Response(html, {
      headers: { "content-type": MIME[".html"], "cache-control": "no-store" }
    });
  }
  const type = MIME[ext] || "application/octet-stream";
  const size = (() => {
    try {
      return fs.statSync(file).size;
    } catch (e) {
      return 0;
    }
  })();
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(request.headers.get("range") || "").trim());
  if (m && (m[1] || m[2])) {
    let start, end;
    if (m[1] === "") {
      const n = parseInt(m[2], 10);
      start = Math.max(0, size - n);
      end = size - 1;
    } else {
      start = parseInt(m[1], 10);
      end = m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
    }
    if (!isFinite(start) || !isFinite(end) || start > end || start >= size) {
      return new Response("range not satisfiable", {
        status: 416,
        headers: { "content-range": "bytes */" + size, "accept-ranges": "bytes" }
      });
    }
    const rheaders = new Headers({
      "content-type": type,
      "content-length": String(end - start + 1),
      "content-range": "bytes " + start + "-" + end + "/" + size,
      "accept-ranges": "bytes"
    });
    if (ext === ".json" || ext === ".css" || ext === ".js") rheaders.set("cache-control", "no-store");
    return new Response(
      Readable.toWeb(fs.createReadStream(file, { start, end })),
      { status: 206, headers: rheaders }
    );
  }
  const resp = await net.fetch(pathToFileURL(file).href);
  const headers = new Headers(resp.headers);
  headers.set("content-type", type);
  headers.set("accept-ranges", "bytes");
  if (ext === ".json" || ext === ".css" || ext === ".js") headers.set("cache-control", "no-store");
  return new Response(resp.body, { status: resp.status, headers });
}
let win = null;
let topmost = false;
let storeFile = "";
function uniquePath(dir, name) {
  const safe = String(name || "download").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 180) || "download";
  let p = path.join(dir, safe);
  if (!fs.existsSync(p)) return p;
  const dot = safe.lastIndexOf(".");
  const base = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : "";
  for (let i = 1; i < 1e3; i++) {
    p = path.join(dir, base + " (" + i + ")" + ext);
    if (!fs.existsSync(p)) return p;
  }
  return path.join(dir, base + " (" + Date.now() + ")" + ext);
}
function attachDownloads() {
  try {
    const { session } = require("electron");
    const ses = session.defaultSession;
    if (!ses || !ses.on) return;
    ses.on("will-download", (event, item) => {
      try {
        const dir = app.getPath("downloads");
        try {
          fs.mkdirSync(dir, { recursive: true });
        } catch (e) {
        }
        const saveTo = uniquePath(dir, item.getFilename());
        item.setSavePath(saveTo);
        item.once("done", (e2, state) => {
          try {
            if (!win || win.isDestroyed()) return;
            win.webContents.send("tsumu:download-done", {
              ok: state === "completed",
              state: state || "unknown",
              path: saveTo,
              name: path.basename(saveTo)
            });
          } catch (e3) {
          }
        });
      } catch (e4) {
      }
    });
  } catch (e) {
  }
}
function createWindow() {
  win = new BrowserWindow({
    width: 420,
    height: 860,
    minWidth: 340,
    minHeight: 560,
    frame: false,
    transparent: false,
    backgroundColor: "#07050a",
    resizable: true,
    fullscreenable: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadURL("tsumu://app/");
  try {
    require("./dev-watch")(win, app);
  } catch (e) {
  }
  if (process.env.TSUMU_SHOT) {
    const out = process.env.TSUMU_SHOT;
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        try {
          const img = await win.webContents.capturePage();
          fs.writeFileSync(out, img.toPNG());
          console.log("captured " + out);
        } catch (e) {
          console.error("capture failed: " + e.message);
        }
        app.quit();
      }, 9e3);
    });
  }
  win.webContents.setWindowOpenHandler(({ url: u }) => {
    if (/^https?:/i.test(u)) shell.openExternal(u);
    return { action: "deny" };
  });
  win.on("closed", () => {
    win = null;
  });
  win.on("close", () => {
    webStorage.flush();
  });
}
ipcMain.handle("shell:set-topmost", (_e, on) => {
  topmost = !!on;
  if (win) {
    win.setAlwaysOnTop(topmost, "screen-saver");
    win.setFullScreenable(!topmost);
  }
  return topmost;
});
ipcMain.handle("shell:is-topmost", () => topmost);
ipcMain.on("shell:minimize", () => {
  if (win) win.minimize();
});
ipcMain.on("shell:close", () => {
  if (win) win.close();
});
ipcMain.on("shell:fullscreen", (_e, on) => {
  if (win) win.setFullScreen(!!on);
});
ipcMain.on("shell:quit", () => app.quit());
ipcMain.on("storage:save", (_e, obj) => {
  webStorage.queueSave(storeFile, obj);
});
ipcMain.on("storage:save-sync", (e, obj) => {
  webStorage.save(storeFile, obj);
  e.returnValue = true;
});
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    try {
      storeFile = webStorage.storePath(app.getPath("userData"));
      const root = webRoot();
      protocol.handle("tsumu", (request) => handleTsumu(root, request));
      attachDownloads();
      createWindow();
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    } catch (e) {
      const { dialog } = require("electron");
      dialog.showErrorBox("Tsumu", "启动失败：" + (e && e.message || e));
      app.quit();
    }
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => {
    webStorage.flush();
  });
}
