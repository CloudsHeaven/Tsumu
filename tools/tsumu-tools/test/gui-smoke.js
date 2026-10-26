"use strict";
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const EXE = process.argv[2] || "";
const APP = process.argv[3] || path.join(__dirname, "..", "electron");
const FIXTURE = process.argv[4] || "";
if (!EXE || !FIXTURE) {
  console.error("用法: node test/gui-smoke.js <electron.exe> <工具目录\\electron> <素材目录>");
  process.exit(2);
}
const PORT = Number(process.env.SMOKE_PORT || 9551);
const ISO = process.env.TSUMU_SMOKE_ISO || path.join(__dirname, "..", ".smoke-gui");
let child = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const ok = (c, name) => {
  if (!c) failed++;
  console.log("  " + (c ? "OK  " : "FAIL") + " " + name);
};
const REPORT = process.env.TSUMU_SMOKE_REPORT || path.join(__dirname, "..", "gui-smoke-report.json");
let stageName = "init";
function stage(n) {
  stageName = n;
  try {
    fs.writeFileSync(REPORT, JSON.stringify({ stage: n, at: ( new Date()).toISOString(), failed }, null, 1));
  } catch (e) {
  }
}
function note(s) {
  try {
    fs.appendFileSync(REPORT, "\n" + ( new Date()).toISOString() + " " + s);
  } catch (e) {
  }
}
process.on("exit", (c) => note("EXIT code=" + c + "  stage=" + stageName + "  failed=" + failed));
process.on("uncaughtException", (e) => note("UNCAUGHT " + (e && e.stack || e)));
process.on("unhandledRejection", (e) => note("UNHANDLED " + (e && e.stack || e)));
function targets() {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port: PORT, path: "/json/list", timeout: 4e3 }, (res) => {
      let s = "";
      res.on("data", (d) => s += d);
      res.on("end", () => {
        try {
          resolve(JSON.parse(s));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}
(async () => {
  if (!fs.existsSync(EXE)) {
    console.error("找不到 electron: " + EXE);
    process.exit(2);
  }
  if (!fs.existsSync(FIXTURE)) {
    console.error("找不到测试素材目录: " + FIXTURE);
    process.exit(2);
  }
  fs.rmSync(ISO, { recursive: true, force: true });
  for (const f of fs.readdirSync(FIXTURE)) {
    if (/\.(vocals\.env|vocals\.wav|non_vocals\.wav)$/i.test(f)) fs.rmSync(path.join(FIXTURE, f));
  }
  child = spawn(EXE, [APP, "--no-sandbox", "--remote-debugging-port=" + PORT, "--user-data-dir=" + ISO], { stdio: "ignore" });
  let exited = null;
  child.on("exit", (code) => {
    exited = code;
  });
  process.on("exit", () => {
    try {
      if (child) child.kill();
    } catch (e) {
    }
  });
  let target = null;
  for (let i = 0; i < 30; i++) {
    await sleep(600);
    if (exited !== null) {
      console.error(`electron 已退出（code=${exited}）`);
      process.exit(4);
    }
    try {
      const list = await targets();
      const pages = list.filter((x) => x.type === "page");
      if (pages.length) {
        target = pages[0];
        break;
      }
    } catch (e) {
    }
  }
  if (!target) {
    console.error("no page");
    try {
      child.kill();
    } catch (e) {
    }
    process.exit(3);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let seq = 0;
  const pending =  new Map();
  let wsClosed = false;
  ws.onclose = () => {
    wsClosed = true;
    note("WebSocket 关闭（窗口被关了 / Electron 退出了）");
  };
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d);
      pending.delete(d.id);
    }
  };
  function evaluate(expression) {
    const id = ++seq;
    return new Promise((resolve) => {
      if (wsClosed) return resolve(void 0);
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve(void 0);
      }, 8e3);
      pending.set(id, (d) => {
        clearTimeout(timer);
        resolve(d.result && d.result.result ? d.result.result.value : void 0);
      });
      try {
        ws.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
      } catch (e) {
        clearTimeout(timer);
        resolve(void 0);
      }
    });
  }
  const SHOTS = process.env.TSUMU_SHOTS || path.join(__dirname, "..", "shots");
  function cdp(method, params) {
    const id = ++seq;
    return new Promise((resolve) => {
      if (wsClosed) return resolve(null);
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve(null);
      }, 1e4);
      pending.set(id, (d) => {
        clearTimeout(timer);
        resolve(d.result || null);
      });
      try {
        ws.send(JSON.stringify({ id, method, params: params || {} }));
      } catch (e) {
        clearTimeout(timer);
        resolve(null);
      }
    });
  }
  async function shot(name) {
    const r = await cdp("Page.captureScreenshot", { format: "png" });
    if (r && r.data) {
      fs.mkdirSync(SHOTS, { recursive: true });
      const p = path.join(SHOTS, name);
      fs.writeFileSync(p, Buffer.from(r.data, "base64"));
      console.log("  截图 " + p);
      return p;
    }
    console.log("  截图失败 " + name);
    return null;
  }
  console.log("\n=== ① 窗口起来了、页面渲染了 ===");
  const title = await evaluate("document.title");
  console.log("  title = " + JSON.stringify(title));
  ok(title && title.indexOf("人声分离") >= 0, "窗口标题 = " + title);
  ok(await evaluate('!!document.getElementById("pick")'), "有「选择文件夹」按钮");
  ok(await evaluate('typeof window.api === "object" && typeof window.api.run === "function"'), "preload 白名单 API 已挂上");
  const meta = await evaluate("window.api.meta().then(m => JSON.stringify(m))");
  console.log("  meta = " + meta);
  ok(/UVR-MDX-NET-Voc_FT\.onnx/.test(meta || ""), "主进程读到了模型");
  const fx = FIXTURE.replace(/\\/g, "/");
  console.log("\n=== ② 在界面里粘贴路径 + 回车 ⇒ 列表出现（走真界面流程）===");
  await evaluate(`(() => {
    const el = document.getElementById('path');
    el.value = ${JSON.stringify(fx)};
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return 'ok';
  })()`);
  await sleep(900);
  const ui1 = JSON.parse(await evaluate(`JSON.stringify({
    rows: document.querySelectorAll('#list li').length,
    tag: (document.querySelector('#list li .tag') || {}).textContent || null,
    name: (document.querySelector('#list li .fname') || {}).textContent || null,
    sum: document.getElementById('sum').textContent,
    runLabel: document.getElementById('run').textContent
  })`));
  console.log("  " + JSON.stringify(ui1));
  ok(ui1.rows === 1, "列表里出现 1 首：" + ui1.rows + "  " + ui1.name);
  ok(ui1.tag === "待处理", "标成「待处理」：" + ui1.tag);
  ok(/共\s*1\s*首/.test(ui1.sum) && /待处理\s*1/.test(ui1.sum), "汇总行正确：" + ui1.sum);
  await shot("gui-1-ready.png");
  console.log("\n=== ③ 勾「输出伴奏」+ 点「开始分离」 ⇒ 事件流 ===");
  await evaluate(`(() => {
    document.getElementById('stems').checked = true;
    window.__ev = []; window.__done = false; window.__err = null;
    window.api.onEvent((e) => {
      window.__ev.push(e);
      if (e.type === 'done') window.__done = true;
      if (e.type === 'error') { window.__err = e.message; window.__done = true; }
    });
    document.getElementById('run').click();
    return 'ok';
  })()`);
  await sleep(1500);
  const phase = await evaluate(`document.getElementById('phase').textContent`);
  const runDisabled = await evaluate(`document.getElementById("run").disabled === true`);
  console.log("  阶段文字 = " + JSON.stringify(phase) + "  按钮已禁用 = " + runDisabled);
  ok(/分离|解码|加载/.test(phase || ""), "界面进入「进行中」状态：" + phase);
  ok(runDisabled, "进行中禁用了按钮（防重复点）");
  const t0 = Date.now();
  let done = false;
  let tick = 0;
  while (Date.now() - t0 < 18e4) {
    await sleep(1500);
    tick++;
    if (wsClosed || exited !== null) {
      console.error("  ⚠ 窗口被关闭 / Electron 退出，提前结束（不是产品 bug，但这次验证不算数）");
      break;
    }
    stage("polling #" + tick + "  (" + ((Date.now() - t0) / 1e3).toFixed(0) + "s)");
    if (await evaluate("window.__done === true")) {
      done = true;
      break;
    }
  }
  note("poll 结束 done=" + done + " tick=" + tick + " wsClosed=" + wsClosed + " exited=" + exited);
  ok(done, `任务在 ${((Date.now() - t0) / 1e3).toFixed(0)}s 内结束`);
  const summary = JSON.parse(await evaluate(`JSON.stringify((function(){
    var t = {}; for (var i=0;i<window.__ev.length;i++) t[window.__ev[i].type] = (t[window.__ev[i].type]||0)+1;
    var d = window.__ev.filter(function(e){return e.type==='done';})[0] || null;
    var fd = window.__ev.filter(function(e){return e.type==='file-done';})[0] || null;
    return { counts: t, done: d, fileDone: fd, err: window.__err };
  })())`));
  console.log("  事件统计 = " + JSON.stringify(summary.counts));
  console.log("  done = " + JSON.stringify(summary.done));
  ok(summary.counts.chunk > 0, "收到了 chunk 进度事件（" + summary.counts.chunk + " 次）");
  ok(summary.done && summary.done.ok === 1 && summary.done.failed === 0, "完成 1 首、0 失败");
  ok(summary.fileDone && summary.fileDone.envBytes > 0 && summary.fileDone.wavBytes > 0, "报告了产物大小");
  console.log("\n=== ④ 产物真的落盘了吗 ===");
  const base = path.join(FIXTURE, "probe-song");
  for (const f of [base + ".vocals.env", base + ".vocals.wav", base + ".non_vocals.wav"]) {
    const ex = fs.existsSync(f);
    ok(ex, path.basename(f) + (ex ? "  " + (fs.statSync(f).size / 1024).toFixed(0) + " KB" : " 不存在"));
  }
  console.log("\n=== ⑤ 产物自洽：包络能被解析、长度对得上 ===");
  {
    const b = fs.readFileSync(base + ".vocals.env");
    const magic = b.toString("ascii", 0, 8);
    const rate = b.readUInt32LE(12), count = b.readUInt32LE(16), ref = b.readFloatLE(24);
    console.log(`  magic=${magic} rateHz=${rate} count=${count} refRms=${ref.toFixed(4)} 时长=${(count / rate).toFixed(1)}s`);
    ok(magic === "TSUMUENV" && rate === 60, "包络 magic / rateHz 正确");
    ok(Math.abs(count / rate - 30) < 1.5, `包络时长 ≈ 素材时长（${(count / rate).toFixed(1)}s vs 30s）`);
  }
  console.log("\n=== ⑥ 界面状态 ===");
  const ui = JSON.parse(await evaluate(`JSON.stringify({
    listRows: document.querySelectorAll('#list li').length,
    doneShown: !document.getElementById('doneCard').hidden,
    pct: document.getElementById('pct').textContent,
    runLabel: document.getElementById('run').textContent,
    firstTag: (document.querySelector('#list li .tag')||{}).textContent || null
  })`));
  console.log("  " + JSON.stringify(ui));
  ok(ui.doneShown, "完成卡片显示出来了");
  ok(ui.pct === "100%", "进度条到 100%：" + ui.pct);
  ok(ui.firstTag === "已完成", "列表里那首已标成「已完成」：" + ui.firstTag);
  ok(/没有待处理的歌/.test(ui.runLabel), "按钮变成「没有待处理的歌」：" + ui.runLabel);
  await shot("gui-2-done.png");
  try {
    ws.close();
  } catch (e) {
  }
  try {
    child.kill();
  } catch (e) {
  }
  await sleep(600);
  fs.rmSync(ISO, { recursive: true, force: true });
  console.log("\n" + (failed === 0 ? "全部通过 ✅" : failed + " 项失败 ❌"));
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(9);
});
