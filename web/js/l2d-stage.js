import { L2dModel, ensureFramework, EMOTION_PRESETS, EXPR_KEEP_EXTRA } from "./l2d-model.js";
const TEX_TIERS = ["full", "2048"];
const MODELS = {
  maou: {
    full: "assets/models/maou/魔王.model3.json",
    "2048": "assets/models/maou/魔王.tex2048.json"
  }
};
const DEFAULT_MODEL = "maou";
function isAndroid() {
  try {
    return /Android/i.test(navigator.userAgent || "");
  } catch (e) {
    return false;
  }
}
function readTexTier() {
  let q = "";
  try {
    q = String(new URLSearchParams(location.search).get("tex") || "").toLowerCase();
  } catch (e) {
  }
  if (TEX_TIERS.indexOf(q) >= 0) return q;
  let v = "";
  try {
    v = String((Config.section("avatar") || {}).texTier || "").toLowerCase();
  } catch (e) {
  }
  if (TEX_TIERS.indexOf(v) >= 0) return v;
  return isAndroid() ? "2048" : "full";
}
function modelJsonFor(name, tier) {
  const entry = MODELS[name];
  if (!entry) return null;
  if (typeof entry === "string") return entry;
  return entry[tier] || entry.full || null;
}
const OY_DEFAULT = 0.6;
const ZOOM_MIN = 0.35, ZOOM_MAX = 8, ZOOM_STEP = 1.12, PAN_MAX = 3;
const STAGE = {
  model: null,
  canvas: null,
  gl: null,

  zoom: 1.5,
  panX: 0,
  panY: 0,
  panelShiftY: OY_DEFAULT,

  frames: 0,
  dragging: false,
  lastX: 0,
  lastY: 0,
  dbg: { down: 0, move: 0, noPt: 0, notDrag: 0, panSteps: 0 }
};
window.TsumuL2d = STAGE;
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
const viewOY = () => clampN(STAGE.panY + STAGE.panelShiftY, -PAN_MAX, PAN_MAX);
function zoomAt(z2, clientX, clientY) {
  const c = STAGE.canvas;
  const nz = clampN(Number(z2) || 1, ZOOM_MIN, ZOOM_MAX);
  if (!c) {
    STAGE.zoom = nz;
    return;
  }
  const r = c.getBoundingClientRect();
  if (!r.width || !r.height) {
    STAGE.zoom = nz;
    return;
  }
  const z1 = Math.max(1e-6, STAGE.zoom);
  const ax = clampN((clientX - r.left) / r.width, 0, 1);
  const ay = clampN((clientY - r.top) / r.height, 0, 1);
  const k = nz / z1;
  STAGE.panX = clampN(STAGE.panX * k + 2 * (ax - 0.5) * (k - 1), -PAN_MAX, PAN_MAX);
  STAGE.panY = clampN(STAGE.panY * k + (k - 1) * (STAGE.panelShiftY + 1 - 2 * ay), -PAN_MAX, PAN_MAX);
  STAGE.zoom = nz;
}
function screenToWorld(clientX, clientY) {
  const c = STAGE.canvas;
  if (!c || !STAGE.model || !STAGE.model.ready) return null;
  const r = c.getBoundingClientRect();
  const vr = STAGE.model.viewRect(c.width, c.height, STAGE.zoom, STAGE.panX, viewOY(), true);
  const ax = (clientX - r.left) / Math.max(1, r.width);
  const ay = (clientY - r.top) / Math.max(1, r.height);
  return { x: vr.x0 + ax * vr.w, y: vr.y1 - ay * vr.h };
}
function resetView() {
  STAGE.zoom = 1.5;
  STAGE.panX = 0;
  STAGE.panY = 0;
}
const ENV_HZ = 60;
function liveMouthSource() {
  try {
    const s = window.TsumuMouthLive;
    return s && s.active && s.active() ? s : null;
  } catch (e) {
    return null;
  }
}
function createMouthProvider(audioEl) {
  let env = null;
  let envFor = null;
  let state = "idle";
  let level = 0, phase = 0;
  let ctx = null;
  let src = "off";
  function decode(url) {
    if (state === "loading" || envFor === url) return;
    envFor = url;
    env = null;
    state = "loading";
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      state = "fail";
      return;
    }
    try {
      if (!ctx) ctx = new AC();
    } catch (e) {
      state = "fail";
      return;
    }
    fetch(url).then((r) => r.arrayBuffer()).then((buf) => new Promise((resolve, reject) => {
      const p = ctx.decodeAudioData(buf, resolve, reject);
      if (p && p.then) p.then(resolve, reject);
    })).then((audioBuf) => {
      const data = audioBuf.getChannelData(0);
      const per = Math.max(1, Math.round(audioBuf.sampleRate / ENV_HZ));
      const n = Math.max(1, Math.floor(data.length / per));
      const out = new Float32Array(n);
      let peak = 0;
      for (let i = 0; i < n; i++) {
        let sum = 0;
        const base = i * per;
        for (let k = 0; k < per; k++) {
          const v = data[base + k] || 0;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / per);
        out[i] = rms;
        if (rms > peak) peak = rms;
      }
      const g = peak > 1e-4 ? 1 / peak : 0;
      for (let i = 0; i < n; i++) out[i] = Math.min(1, Math.pow(out[i] * g, 0.7));
      env = out;
      state = "ok";
    }).catch(() => {
      state = "fail";
    });
  }
  return {

    onSource(url) {
      if (url) decode(url);
    },

    update(dt) {
      const step = dt || 0.016;
      const playing = !!(audioEl && !audioEl.paused && !audioEl.ended && audioEl.readyState >= 2);
      let target = 0;
      if (playing) {
        src = "tts";
        if (env && env.length) {
          const idx = Math.min(env.length - 1, Math.max(0, Math.floor(audioEl.currentTime * ENV_HZ)));
          target = env[idx] || 0;
        } else {
          phase += step * 12;
          target = 0.32 + 0.34 * Math.abs(Math.sin(phase)) + 0.14 * Math.abs(Math.sin(phase * 2.7 + 1.3));
        }
      } else {
        const ls = liveMouthSource();
        if (ls) {
          src = "live";
          target = Math.max(0, Math.min(1, ls.level() || 0));
        } else src = "off";
      }
      const k = target > level ? Math.min(1, step * 22) : Math.min(1, step * 9);
      level += (target - level) * k;
      if (level < 2e-3) level = 0;
      return true;
    },
    getParameter() {
      return level;
    },

    mode() {
      if (src === "live") return "live";
      return state === "ok" ? "envelope" : state === "loading" ? "loading" : "synth";
    },
    envLength() {
      return env ? env.length : 0;
    }
  };
}
function T(key, fallback, map) {
  try {
    if (window.I18n && I18n.tf && key) return I18n.tf(key, fallback === void 0 ? key : fallback, map);
  } catch (e) {
  }
  let s = fallback === void 0 ? key : fallback;
  if (map) Object.keys(map).forEach((k) => {
    s = s.split("{" + k + "}").join(map[k]);
  });
  return s;
}
function hint(msg, bad) {
  const el = document.getElementById("l2d-hint");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("bad", !!bad);
  el.classList.toggle("hide", !msg);
}
function loading(on) {
  const el = document.getElementById("l2d-loading");
  if (el) el.classList.toggle("hide", !on);
}
const HAIR_KEY = "l2d.slot.hair";
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
function buildHairPanel() {
  const hairBox = document.getElementById("hair-panel");
  const hairSection = document.getElementById("hair-section");
  const m = STAGE.model;
  if (!hairBox || !m) return;
  const tip = (n) => {
    const v = m.expressionVerified(n);
    if (!v) return "";
    if (!v.pixelDiff) return ' title="' + esc(T("l2d.verifiedNone", "实测：单独播【一个像素都不变】")) + '"';
    return ' title="' + esc(T("l2d.verifiedDiff", "实测画面变化 {p}%", { p: (v.pixelDiff * 100).toFixed(2) })) + (v.pixelDiff < 0.01 ? esc(T("l2d.verifiedTiny", "（很小，是脸上的一小块）")) : "") + '"';
  };
  let hairHtml = "";
  m.slots().forEach((s) => {
    if (s.labelKey !== HAIR_KEY) return;
    let row = '<div class="ex-row">';
    s.members.forEach((n) => {
      row += '<button type="button" data-ex="' + esc(n) + '"' + tip(n) + ">" + esc(n) + "</button>";
    });
    row += '<button type="button" class="off" data-hair-native="1" title="' + esc(T("l2d.hairNativeTip", "回到原生发型（只影响发型，不动她现在的表情）")) + '">' + esc(T("l2d.hairNative", "原生发型")) + "</button>";
    row += "</div>";
    hairHtml += row;
  });
  if (hairSection) hairSection.classList.toggle("hidden", !hairHtml);
  if (hairBox) hairBox.innerHTML = hairHtml +
  '<div class="ex-row"><b></b><span class="ex-note">' + esc(T("l2d.panelHint", "滚轮缩放 · 拖动平移 · 双击还原")) + '</span></div><div class="ex-row"><b></b><span class="ex-note">' + esc(T("l2d.savedHint", "这里的手动设定会自动保存，重启后仍在")) + "</span></div>";
  if (hairBox) wireExprClicks(hairBox);
  syncExprPanel();
}
function wireExprClicks(el) {
  if (!el || el.dataset.wired) return;
  el.dataset.wired = "1";
  el.addEventListener("click", (e) => {
    const m = STAGE.model;
    if (!m) return;
    const t = e.target;
    if (!t || !t.dataset) return;
    if (t.dataset.emo !== void 0) {
      m.setEmotion(t.dataset.emo);
      syncExprPanel();
    } else if (t.dataset.reset !== void 0) {
      m.restoreBaseline();
      manualExpr.clear();
      saveExprState();
      syncExprPanel();
    } else if (t.dataset.hairNative !== void 0) {
      const slot = (m.slots ? m.slots() : []).filter((s) => s.labelKey === HAIR_KEY)[0];
      const members = slot ? slot.members : [];
      const mine = (m.pressedExpressions ? m.pressedExpressions() : []).filter((n) => members.indexOf(n) >= 0);
      mine.forEach((n) => {
        m.toggleExpression(n);
        manualExpr.delete(n);
      });
      saveExprState();
      syncExprPanel();
    } else if (t.dataset.ex !== void 0) {
      if (t.dataset.ex) {
        const on = m.toggleExpression(t.dataset.ex);
        if (on) manualExpr.add(t.dataset.ex);
        else manualExpr.delete(t.dataset.ex);
      } else {
        m.clearExpressions();
        manualExpr.clear();
      }
      saveExprState();
      syncExprPanel();
    } else if (t.dataset.mo !== void 0) {
      if (t.dataset.mo) m.playMotion(t.dataset.mo, 0);
      else m.restoreBaseline();
      syncExprPanel();
    }
  });
}
function syncExprPanel() {
  const m = STAGE.model;
  if (!m) return;
  const act = m.pressedExpressions ? m.pressedExpressions() : m.activeExpressions ? m.activeExpressions() : [];
  const has = (n) => act.indexOf(n) >= 0;
  const emo = m.activeEmotion ? m.activeEmotion() : null;
  ["hair-panel"].forEach((id) => {
    const box = document.getElementById(id);
    if (!box) return;
    box.querySelectorAll("button[data-ex]").forEach((b) => {
      const n = b.dataset.ex;
      if (!n) {
        b.classList.remove("on");
        b.disabled = false;
        return;
      }
      b.classList.toggle("on", has(n));
      const meta = m.expressionMeta ? m.expressionMeta(n) : null;
      if (meta && meta.base) b.disabled = !has(meta.base);
    });
    box.querySelectorAll("button[data-emo]").forEach((b) => {
      b.classList.toggle("on", !!emo && b.dataset.emo === emo);
    });
  });
}
const manualExpr =  new Set();
function saveExprState() {
  const m = STAGE.model;
  try {
    const live = m && m.pressedExpressions ? m.pressedExpressions() : null;
    if (live) Array.from(manualExpr).forEach(function(n) {
      if (live.indexOf(n) < 0) manualExpr.delete(n);
    });
    Config.set("avatar.expressions", Array.from(manualExpr));
  } catch (e) {
  }
}
function restoreExprState() {
  const m = STAGE.model;
  if (!m || !m.setExpression) return;
  let saved = [];
  try {
    saved = (Config.section("avatar") || {}).expressions || [];
  } catch (e) {
    saved = [];
  }
  if (!Array.isArray(saved) || !saved.length) return;
  const plain = [], mods = [];
  saved.forEach((n) => {
    const meta = m.expressionMeta ? m.expressionMeta(n) : null;
    (meta && meta.base ? mods : plain).push(n);
  });
  plain.concat(mods).forEach((n) => {
    if (m.setExpression(n, true, true)) manualExpr.add(n);
  });
  saveExprState();
}
let _borrowedExpr = null;
STAGE.borrowExpr = function(name) {
  const m = STAGE.model;
  if (!m || !m.hasIndex || !m.hasIndex() || !m.setExpression) return false;
  if (_borrowedExpr === name) return true;
  STAGE.releaseBorrowedExpr();
  const meta = m.expressionMeta ? m.expressionMeta(name) : null;
  if (!meta || !meta.slot) return false;
  const pressed = (m.pressedExpressions ? m.pressedExpressions() : []) || [];
  if (pressed.indexOf(name) >= 0) {
    _borrowedExpr = null;
    return true;
  }
  for (const n of pressed) {
    if (n === name) continue;
    const mm = m.expressionMeta ? m.expressionMeta(n) : null;
    if (mm && mm.slot === meta.slot) return false;
  }
  if (!m.setExpression(name, true)) return false;
  _borrowedExpr = name;
  try {
    if (EXPR_KEEP_EXTRA && EXPR_KEEP_EXTRA.add) EXPR_KEEP_EXTRA.add(name);
  } catch (e) {
  }
  try {
    if (STAGE.syncExprPanel) STAGE.syncExprPanel();
  } catch (e) {
  }
  return true;
};
STAGE.releaseBorrowedExpr = function() {
  const m = STAGE.model, name = _borrowedExpr;
  _borrowedExpr = null;
  if (!name || !m || !m.setExpression) return false;
  try {
    if (EXPR_KEEP_EXTRA && EXPR_KEEP_EXTRA.delete) EXPR_KEEP_EXTRA.delete(name);
  } catch (e) {
  }
  try {
    m.setExpression(name, false);
  } catch (e) {
    return false;
  }
  try {
    if (STAGE.syncExprPanel) STAGE.syncExprPanel();
  } catch (e) {
  }
  return true;
};
STAGE.borrowedExpr = () => _borrowedExpr;
let _last = 0;
let _loopStarted = false;
function startLoop() {
  if (_loopStarted) return;
  _loopStarted = true;
  requestAnimationFrame(loop);
}
function ensureProvider() {
  if (STAGE.provider) return STAGE.provider;
  const provider = createMouthProvider(window.TsumuAudio || null);
  STAGE.provider = provider;
  STAGE.mouthMode = () => provider.mode();
  if (window.TsumuAudio) {
    const a = window.TsumuAudio;
    const notify = () => provider.onSource(a.currentSrc || a.src);
    try {
      if (typeof a.onSource === "function") a.onSource(notify);
    } catch (e) {
    }
    notify();
  }
  return provider;
}
function loop(t) {
  const dt = _last ? Math.min(0.05, (t - _last) / 1e3) : 0.016;
  _last = t;
  const c = STAGE.canvas, gl = STAGE.gl;
  if (!c || !gl) return;
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  if (STAGE.model && STAGE.model.ready) {
    STAGE.model.update(dt, c.width, c.height);
    STAGE.model.draw(c.width, c.height, STAGE.zoom, STAGE.panX, viewOY(), true);
    STAGE.frames++;
    if (STAGE.frames === 1) {
      STAGE.firstFrameMs = Math.round(performance.now());
    }
  }
  requestAnimationFrame(loop);
}
function resize() {
  const c = STAGE.canvas;
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.max(1, Math.floor(c.clientWidth * dpr));
  c.height = Math.max(1, Math.floor(c.clientHeight * dpr));
  STAGE.gl.viewport(0, 0, c.width, c.height);
  if (STAGE.model) STAGE.model.setRenderTargetSize(c.width, c.height);
}
function wireInput() {
  const c = STAGE.canvas;
  if (!c) return;
  const stage = document.getElementById("stage") || c;
  const NO_FOLLOW = ["#chat", "#fn", "#settings", "#memory"];
  function pointerOverUi(e) {
    for (const sel of NO_FOLLOW) {
      const el = document.querySelector(sel);
      if (!el || el.classList.contains("hidden")) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return true;
    }
    return false;
  }
  window.addEventListener("pointermove", (e) => {
    if (!STAGE.model || !STAGE.model.ready) return;
    if (STAGE.holdLook) {
      STAGE.model.look(0, 0);
      return;
    }
    if (pointerOverUi(e)) {
      STAGE.model.look(0, 0);
      return;
    }
    const r = c.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x = (e.clientX - r.left) / r.width * 2 - 1;
    const y = -((e.clientY - r.top) / r.height * 2 - 1);
    STAGE.model.look(x, y);
  });
  const pts =  new Map();
  let pinchDist = 0;
  const dist2 = () => {
    const a = [...pts.values()];
    if (a.length < 2) return 0;
    const dx = a[0].x - a[1].x, dy = a[0].y - a[1].y;
    return Math.hypot(dx, dy);
  };
  const mid2 = () => {
    const a = [...pts.values()];
    return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
  };
  c.addEventListener("pointerdown", (e) => {
    try {
      c.setPointerCapture(e.pointerId);
    } catch (err) {
    }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      pinchDist = dist2();
    }
    STAGE.dragging = true;
    STAGE.lastX = e.clientX;
    STAGE.lastY = e.clientY;
    STAGE.dbg.down++;
  });
  c.addEventListener("pointermove", (e) => {
    STAGE.dbg.move++;
    if (!pts.has(e.pointerId)) {
      STAGE.dbg.noPt++;
      return;
    }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = c.getBoundingClientRect();
    if (!r.width || !r.height) return;
    if (pts.size >= 2) {
      const d = dist2();
      if (pinchDist > 4 && d > 4) {
        const m = mid2();
        zoomAt(STAGE.zoom * (d / pinchDist), m.x, m.y);
      }
      pinchDist = d;
      return;
    }
    if (!STAGE.dragging) {
      STAGE.dbg.notDrag++;
      return;
    }
    const dx = e.clientX - STAGE.lastX, dy = e.clientY - STAGE.lastY;
    STAGE.panX = clampN(STAGE.panX - dx / r.width, -PAN_MAX, PAN_MAX);
    STAGE.panY = clampN(STAGE.panY + dy / r.height, -PAN_MAX, PAN_MAX);
    STAGE.lastX = e.clientX;
    STAGE.lastY = e.clientY;
    STAGE.dbg.panSteps++;
  });
  const endPtr = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinchDist = 0;
    if (!pts.size) STAGE.dragging = false;
  };
  c.addEventListener("pointerup", endPtr);
  c.addEventListener("pointercancel", endPtr);
  window.addEventListener("pointerup", () => {
    pts.clear();
    pinchDist = 0;
    STAGE.dragging = false;
  });
  stage.addEventListener("wheel", (e) => {
    const d = Number(e.deltaY) || 0;
    if (!d) return;
    e.preventDefault();
    zoomAt(STAGE.zoom * (d < 0 ? ZOOM_STEP : 1 / ZOOM_STEP), e.clientX, e.clientY);
  }, { passive: false });
  c.addEventListener("dblclick", (e) => {
    e.preventDefault();
    resetView();
  });
  window.addEventListener("resize", resize);
}
function isIdbRef(s) {
  return typeof s === "string" && s.indexOf("idb:") === 0;
}
async function resolveModel(ref) {
  const S = window.L2dStore;
  if (isIdbRef(ref) && S && S.available && S.available()) {
    const id = String(ref).slice(4);
    let m = null;
    try {
      m = await S.getModel(id);
    } catch (e) {
      m = null;
    }
    if (m && m.modelJson) {
      const src = S.sourceFor(id);
      const main = S.modelJsonUrl(m);
      let useUrl = main;
      try {
        const t0 = await src.get(main, false);
        if (!t0) {
          const cands = m.candidates && m.candidates.length ? m.candidates : [];
          for (let i = 0; i < cands.length; i++) {
            const u = S.modelJsonUrl({ id, modelJson: cands[i] });
            if (!u || u === main) continue;
            const t = await src.get(u, false);
            if (t) {
              useUrl = u;
              break;
            }
          }
        }
      } catch (e) {
      }
      let fileList = null;
      try {
        fileList = (await S.filesOf(id)).map((f) => f.rel);
      } catch (e) {
        fileList = null;
      }
      return { name: ref, tier: "full", jsonPath: useUrl, ref, store: src, rec: m, fileList };
    }
    return { name: ref, tier: "full", jsonPath: null, ref, store: null, rec: null };
  }
  const tier = readTexTier();
  return { name: ref, tier, jsonPath: modelJsonFor(ref, tier), ref, store: null, rec: null };
}
async function modelReachable(r) {
  if (!r || !r.jsonPath) return false;
  if (r.store) {
    try {
      const t = await r.store.get(r.jsonPath, false);
      return !!t;
    } catch (e) {
      return false;
    }
  }
  const head = (u) => fetch(u, { method: "HEAD" }).then((res) => !!res && res.ok).catch(() => false);
  if (await head(r.jsonPath)) return true;
  const alt = modelJsonFor(r.name, "full");
  if (alt && alt !== r.jsonPath) return await head(alt);
  return false;
}
function attachSource(model, r) {
  if (!model) return model;
  if (r && r.store && typeof model.setSource === "function") {
    try {
      model.setSource(r.store);
    } catch (e) {
    }
    if (r.fileList && typeof model.setFileList === "function") {
      try {
        model.setFileList(r.fileList);
      } catch (e) {
      }
    }
  }
  if (r && r.rec && r.rec.mapping && typeof model.setExprAlias === "function") {
    try {
      model.setExprAlias(r.rec.mapping);
    } catch (e) {
    }
  }
  return model;
}
function currentModelRef() {
  let ref = DEFAULT_MODEL;
  try {
    const q = new URLSearchParams(location.search).get("model");
    const fromCfg = (Config.section("avatar") || {}).model;
    ref = q || fromCfg || DEFAULT_MODEL;
  } catch (e) {
  }
  return ref;
}
async function bootStage() {
  const canvas = document.getElementById("l2d");
  if (!canvas) return;
  STAGE.canvas = canvas;
  wireInput();
  loading(true);
  const fail = (msg) => {
    loading(false);
    hint(msg, true);
  };
  if (typeof window.Live2DCubismCore === "undefined") {
    fail(T("l2d.noCore", "缺少 Cubism Core，立绘不可用（聊天不受影响）"));
    return;
  }
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: true });
  if (!gl) {
    fail(T("l2d.noWebgl", "本环境不支持 WebGL，立绘不可用（聊天不受影响）"));
    return;
  }
  STAGE.gl = gl;
  ensureFramework();
  const _resolved = await resolveModel(currentModelRef());
  const name = _resolved.name;
  const jsonPath = _resolved.jsonPath || null;
  if (!await modelReachable(_resolved)) {
    loading(false);
    hint("");
    try {
      if (window.L2dNomodel && window.L2dNomodel.show) window.L2dNomodel.show();
    } catch (e) {
    }
    return;
  }
  try {
    if (window.L2dNomodel && window.L2dNomodel.hide) window.L2dNomodel.hide();
  } catch (e) {
  }
  STAGE.modelName = name;
  STAGE.texTier = readTexTier();
  resize();
  STAGE.model = attachSource(new L2dModel(jsonPath, gl), _resolved);
  STAGE.modelRef = _resolved.ref;
  const provider = ensureProvider();
  STAGE.mouthMode = () => provider.mode();
  if (window.TsumuAudio) {
    const a = window.TsumuAudio;
    const notify = () => provider.onSource(a.currentSrc || a.src);
    a.addEventListener("loadstart", notify);
    a.addEventListener("play", notify);
  }
  STAGE.model.load().then(() => {
    STAGE.lipSync = STAGE.model.setMouthProvider(provider);
    const P = EMOTION_PRESETS || null;
    if (P && P.happy && P.happy.params) STAGE.model.setDefaultFace(P.happy.params, "happy");
    loading(false);
    hint("");
    try {
      if (window.L2dNomodel && window.L2dNomodel.hide) window.L2dNomodel.hide();
    } catch (e) {
    }
    resize();
    if (STAGE.model.hasIndex()) {
      restoreExprState();
      buildHairPanel();
    }
    startLoop();
  }).catch((e) => {
    fail(T("l2d.loadFail", "立绘加载失败：{e}（聊天不受影响）", { e: e && e.message || e }));
  });
}
let _tierSwapping = false;
STAGE.setTexTier = function(tier) {
  tier = String(tier || "").toLowerCase();
  if (TEX_TIERS.indexOf(tier) < 0) return Promise.resolve(false);
  const c = STAGE.canvas;
  const gl = STAGE.gl;
  if (_tierSwapping || !c || !gl) return Promise.resolve(false);
  const refNow = STAGE.modelRef || DEFAULT_MODEL;
  if (isIdbRef(refNow)) return Promise.resolve(false);
  const name = refNow;
  const jsonPath = modelJsonFor(name, tier);
  if (!jsonPath) return Promise.resolve(false);
  const prev = STAGE.model;
  if (prev && prev._path === jsonPath) {
    STAGE.texTier = tier;
    return Promise.resolve(true);
  }
  _tierSwapping = true;
  loading(true);
  hint("");
  const next = new L2dModel(jsonPath, gl);
  STAGE.model = next;
  return next.load().then(() => {
    STAGE.lipSync = next.setMouthProvider(ensureProvider());
    const P = EMOTION_PRESETS || null;
    if (P && P.happy && P.happy.params) next.setDefaultFace(P.happy.params, "happy");
    resize();
    if (next.hasIndex()) {
      restoreExprState();
      buildHairPanel();
    }
    STAGE.texTier = tier;
    STAGE.modelRef = name;
    if (prev && prev.dispose) {
      try {
        prev.dispose();
      } catch (e) {
      }
    }
    loading(false);
    _tierSwapping = false;
    return true;
  }).catch((e) => {
    STAGE.model = prev;
    if (prev) {
      try {
        resize();
      } catch (e2) {
      }
    }
    loading(false);
    _tierSwapping = false;
    hint(T("l2d.tierFail", "立绘模式切换失败：{e}", { e: e && e.message || e }), true);
    return false;
  });
};
STAGE.texTierOf = () => STAGE.texTier || readTexTier();
let _modelSwapping = false;
STAGE.onSwitchModel = null;
STAGE.modelRefOf = () => STAGE.modelRef || DEFAULT_MODEL;
STAGE.listBuiltinModels = () => Object.keys(MODELS).map((k) => ({
  ref: k,
  name: k,
  builtin: true,
  tiers: Object.keys(MODELS[k] || {})
}));
const _headOk = (u) => fetch(u, { method: "HEAD" }).then((res) => !!res && res.ok).catch(() => false);
STAGE.probeBuiltin = (ref) => {
  const tiers = MODELS[ref] || {};
  const urls = Object.keys(tiers).map((k) => tiers[k]).filter(Boolean);
  if (!urls.length) return Promise.resolve(false);
  return Promise.all(urls.map(_headOk)).then((rs) => rs.some(Boolean));
};
STAGE.requiredExprNames = () => {
  const out = [];
  try {
    Object.keys(EMOTION_PRESETS || {}).forEach((k) => {
      const e = EMOTION_PRESETS[k];
      if (e && e.expr && out.indexOf(e.expr) < 0) out.push(e.expr);
    });
  } catch (e) {
  }
  return out;
};
STAGE.missingExprNames = () => {
  const m = STAGE.model;
  if (!m || typeof m.expressionNames !== "function") return [];
  let have = [];
  try {
    have = m.expressionNames() || [];
  } catch (e) {
    have = [];
  }
  const req = STAGE.requiredExprNames();
  return req.filter((n) => {
    if (have.indexOf(n) >= 0) return false;
    let alias = null;
    try {
      alias = m.resolveExprName ? m.resolveExprName(n) : n;
    } catch (e) {
      alias = n;
    }
    return !(alias !== n && have.indexOf(alias) >= 0);
  });
};
STAGE.availableExprNames = () => {
  const m = STAGE.model;
  if (!m || typeof m.expressionNames !== "function") return [];
  try {
    return m.expressionNames() || [];
  } catch (e) {
    return [];
  }
};
STAGE.getAliasOf = (ourName) => {
  const m = STAGE.model;
  if (!m || !m._exprAlias || typeof m.resolveExprName !== "function") return null;
  const raw = String(ourName == null ? "" : ourName);
  const out = m.resolveExprName(raw);
  return out === raw ? null : out;
};
STAGE.setExprAlias = async (ref, ourName, theirName) => {
  const S = window.L2dStore;
  if (!isIdbRef(ref) || !S) return false;
  const id = String(ref).slice(4);
  const m = await S.getModel(id);
  if (!m) return false;
  const map = Object.assign({}, m.mapping || {});
  const k = String(ourName == null ? "" : ourName);
  const v = String(theirName == null ? "" : theirName).trim();
  if (!k) return false;
  if (!v) delete map[k];
  else map[k] = v;
  await S.setMapping(id, Object.keys(map).length ? map : null);
  if (STAGE.modelRef === ref && STAGE.model && typeof STAGE.model.setExprAlias === "function") {
    try {
      STAGE.model.setExprAlias(Object.keys(map).length ? map : null);
    } catch (e) {
    }
  }
  return true;
};
STAGE.switchModel = async function(ref) {
  ref = String(ref == null ? "" : ref).trim();
  if (!ref) return false;
  const c = STAGE.canvas, gl = STAGE.gl;
  if (_modelSwapping || !c || !gl) return false;
  if (ref === (STAGE.modelRef || DEFAULT_MODEL) && STAGE.model && STAGE.model.ready) return true;
  const r = await resolveModel(ref);
  if (!await modelReachable(r)) return false;
  const prev = STAGE.model;
  const prevRef = STAGE.modelRef;
  _modelSwapping = true;
  loading(true);
  hint("");
  const next = attachSource(new L2dModel(r.jsonPath, gl), r);
  STAGE.model = next;
  return next.load().then(() => {
    STAGE.lipSync = next.setMouthProvider(ensureProvider());
    const P = EMOTION_PRESETS || null;
    if (P && P.happy && P.happy.params) next.setDefaultFace(P.happy.params, "happy");
    STAGE.modelRef = r.ref;
    STAGE.modelName = r.ref;
    resize();
    startLoop();
    if (next.hasIndex()) {
      restoreExprState();
      buildHairPanel();
    }
    if (prev && prev.dispose) {
      try {
        prev.dispose();
      } catch (e) {
      }
    }
    try {
      if (window.L2dNomodel && window.L2dNomodel.hide) window.L2dNomodel.hide();
    } catch (e) {
    }
    if (typeof STAGE.onSwitchModel === "function") {
      try {
        STAGE.onSwitchModel(r.ref);
      } catch (e) {
      }
    }
    loading(false);
    _modelSwapping = false;
    return true;
  }).catch((e) => {
    STAGE.model = prev;
    STAGE.modelRef = prevRef;
    STAGE.modelName = prevRef;
    STAGE.lastSwitchError = { message: e && e.message || String(e), stack: String(e && e.stack || "").split("\n").slice(0, 8).join(" | "), at: ( new Date()).toISOString() };
    if (prev) {
      try {
        resize();
      } catch (e2) {
      }
    }
    loading(false);
    _modelSwapping = false;
    hint(T("l2d.modelSwitchFail", "模型切换失败：{e}（仍用着原来那个）", { e: e && e.message || e }), true);
    return false;
  });
};
STAGE.info = () => STAGE.model ? STAGE.model.info() : null;
STAGE.syncExprPanel = syncExprPanel;
STAGE.refreshTexts = () => {
  if (STAGE.model && STAGE.model.hasIndex && STAGE.model.hasIndex()) buildHairPanel();
};
STAGE.mouthValue = () => STAGE.provider ? STAGE.provider.getParameter() : 0;
STAGE.resetView = resetView;
STAGE.bootInfo = () => ({
  首帧毫秒: STAGE.firstFrameMs || null,
  各步骤: STAGE.model && STAGE.model._timings || null,
  贴图细分: STAGE.model && STAGE.model._texMs || null
});
STAGE.zoomAt = zoomAt;
STAGE.screenToWorld = screenToWorld;
STAGE.viewInfo = () => {
  const c = STAGE.canvas;
  if (!c || !STAGE.model || !STAGE.model.ready) return null;
  const vr = STAGE.model.viewRect(c.width, c.height, STAGE.zoom, STAGE.panX, viewOY(), true);
  return { zoom: STAGE.zoom, panX: STAGE.panX, panY: STAGE.panY, panelShiftY: STAGE.panelShiftY, rect: vr };
};
function runBootStage() {
  try {
    Promise.resolve(bootStage()).catch(function() {
    });
  } catch (e) {
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", runBootStage);
} else {
  runBootStage();
}
