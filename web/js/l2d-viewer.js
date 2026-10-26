import { L2dModel, ensureFramework } from "./l2d-model.js";
const MODELS = {
  maou: {
    full: "assets/models/maou/魔王.model3.json",
    "2048": "assets/models/maou/魔王.tex2048.json"
  }
};
const DEFAULT_MODEL = "maou";
function viewerJsonPath(name) {
  const entry = MODELS[name];
  if (!entry) return null;
  if (typeof entry === "string") return entry;
  let t = "";
  try {
    t = String(new URLSearchParams(location.search).get("tex") || "").toLowerCase();
  } catch (e) {
  }
  return entry[t] || entry.full || null;
}
const VIEW = {
  model: null,
  canvas: null,
  gl: null,
  scale: 1,
  ox: 0,
  oy: 0,
  frames: 0,

  dragging: false,
  lastX: 0,
  lastY: 0
};
window.__VIEW = VIEW;
function status(msg, bad) {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = msg;
  el.style.color = bad ? "#e08585" : "#8fd6a0";
}
function hud(txt) {
  const el = document.getElementById("hud");
  if (el) el.textContent = txt;
}
function boot() {
  if (typeof window.Live2DCubismCore === "undefined") {
    status("缺少 Cubism Core：请确认 vendor/cubism/Core/live2dcubismcore.min.js 可访问", true);
    return;
  }
  const canvas = document.getElementById("l2d");
  VIEW.canvas = canvas;
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: true });
  if (!gl) {
    status("本环境不支持 WebGL", true);
    return;
  }
  VIEW.gl = gl;
  ensureFramework();
  const q = new URLSearchParams(location.search);
  const name = q.get("model") || DEFAULT_MODEL;
  const jsonPath = viewerJsonPath(name);
  if (!jsonPath) {
    status("没有登记名为 " + name + " 的模型（见 js/l2d-model.js 的 MODELS）", true);
    return;
  }
  status("准备 SDK…");
  VIEW.model = new L2dModel(jsonPath, VIEW.gl);
  VIEW.model.load((msg) => status("加载：" + msg)).then(() => {
    status("已加载：" + name);
    buildControls();
    resize();
    requestAnimationFrame(loop);
  }).catch((e) => status("加载失败：" + (e && e.message || e), true));
}
function buildControls() {
  const box = document.getElementById("controls");
  if (!box || !VIEW.model) return;
  let html = '<div class="row"><b>动作</b>';
  let any = false;
  for (const [g, list] of VIEW.model._motions) {
    if (!list.length) continue;
    any = true;
    html += `<button data-motion="${g}">${g}(${list.length})</button>`;
  }
  if (!any) html += '<span class="none">model3.json 里没有动作</span>';
  html += '</div><div class="row"><b>表情</b>';
  if (VIEW.model._expressions.length) {
    VIEW.model._expressions.forEach((e, i) => {
      html += `<button data-expr="${i}">${e.name}</button>`;
    });
  } else {
    html += '<span class="none">model3.json 里没有表情</span>';
  }
  html += "</div>";
  box.innerHTML = html;
  box.addEventListener("click", (e) => {
    const t = e.target;
    if (!t.dataset) return;
    if (t.dataset.motion) {
      VIEW.model.playMotion(t.dataset.motion, null);
      hud("动作：" + t.dataset.motion);
    }
    if (t.dataset.expr != null && t.dataset.expr !== "") {
      VIEW.model.playExpression(+t.dataset.expr);
      hud("表情：" + t.textContent);
    }
  });
}
function resize() {
  const c = VIEW.canvas;
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth, h = c.clientHeight;
  c.width = Math.floor(w * dpr);
  c.height = Math.floor(h * dpr);
  VIEW.gl.viewport(0, 0, c.width, c.height);
  if (VIEW.model) VIEW.model.setRenderTargetSize(c.width, c.height);
}
let _last = 0;
function loop(t) {
  const dt = _last ? Math.min(0.05, (t - _last) / 1e3) : 0.016;
  _last = t;
  const gl = VIEW.gl, c = VIEW.canvas;
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  if (VIEW.model && VIEW.model.ready) {
    VIEW.model.update(dt, c.width, c.height);
    VIEW.model.draw(c.width, c.height, VIEW.scale, VIEW.ox, VIEW.oy, false);
    VIEW.frames++;
  }
  requestAnimationFrame(loop);
}
function wireInput() {
  const c = document.getElementById("l2d");
  if (!c) return;
  c.addEventListener("pointermove", (e) => {
    const r = c.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * 2 - 1;
    const y = -((e.clientY - r.top) / r.height * 2 - 1);
    if (VIEW.model) VIEW.model.look(x, y);
    if (VIEW.dragging) {
      VIEW.ox += (e.clientX - VIEW.lastX) / r.width;
      VIEW.oy -= (e.clientY - VIEW.lastY) / r.height;
      VIEW.lastX = e.clientX;
      VIEW.lastY = e.clientY;
    }
  });
  c.addEventListener("pointerdown", (e) => {
    VIEW.dragging = true;
    VIEW.lastX = e.clientX;
    VIEW.lastY = e.clientY;
  });
  window.addEventListener("pointerup", () => {
    VIEW.dragging = false;
  });
  c.addEventListener("wheel", (e) => {
    e.preventDefault();
    VIEW.scale = Math.max(0.3, Math.min(6, VIEW.scale * (e.deltaY < 0 ? 1.1 : 0.9)));
    hud("缩放 " + VIEW.scale.toFixed(2) + "×");
  }, { passive: false });
  window.addEventListener("resize", resize);
  const reset = document.getElementById("btn-reset");
  if (reset) reset.onclick = () => {
    VIEW.scale = 1;
    VIEW.ox = 0;
    VIEW.oy = 0;
    hud("已重置");
  };
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    wireInput();
    boot();
  });
} else {
  wireInput();
  boot();
}
