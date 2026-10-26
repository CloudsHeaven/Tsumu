import {
  CubismFramework,
  Option,
  LogLevel,
  CubismDefaultParameterId,
  CubismUserModel,
  CubismModelSettingJson,
  CubismMatrix44,
  CubismEyeBlink,
  CubismBreath,
  CubismLook,
  LookParameterData,
  CubismUpdateScheduler,
  CubismEyeBlinkUpdater,
  CubismBreathUpdater,
  CubismPhysicsUpdater,
  CubismPoseUpdater,
  CubismLookUpdater,
  CubismLipSyncUpdater
} from "../vendor/cubism/dist/cubism-framework.js";
const PID = CubismDefaultParameterId;
export function encodePath(p) {
  const s = String(p);
  if (s.indexOf("idb:") === 0) return s;
  return s.split("/").map(encodeURIComponent).join("/");
}
let _started = false;
export function ensureFramework() {
  if (_started) return;
  const opt = new Option();
  opt.logFunction = (m) => console.log("[cubism] " + m);
  opt.logLevel = LogLevel.LogLevel_Warning;
  CubismFramework.startUp(opt);
  CubismFramework.initialize();
  _started = true;
}
export function setOrthographic(matrix, left, right, bottom, top, near, far) {
  const lr = 1 / (right - left);
  const bt = 1 / (top - bottom);
  const nf = 1 / (far - near);
  matrix.setMatrix(new Float32Array([
    2 * lr,
    0,
    0,
    0,
    0,
    2 * bt,
    0,
    0,
    0,
    0,
    -2 * nf,
    0,
    -(right + left) * lr,
    -(top + bottom) * bt,
    -(far + near) * nf,
    1
  ]));
}
function parseJsonLoose(txt) {
  var s = String(txt == null ? "" : txt);
  if (s.charCodeAt(0) === 65279) s = s.slice(1);
  try {
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
}
const SHADER_DIR = "vendor/cubism/Framework/Shaders/WebGL/";
const SMILE_PARAMS = () => ({ ParamMouthForm: 1, ParamEyeLSmile: 1, ParamEyeRSmile: 1, Param163: 3 });
export const EMOTION_PRESETS = {

  neutral: { expr: null, params: {} },

  happy: { expr: null, params: SMILE_PARAMS() },

  laugh: { expr: "捂嘴", params: SMILE_PARAMS() },

  tease: { expr: "嘘", params: SMILE_PARAMS() },

  sad: { expr: "流泪", params: { ParamMouthForm: -1 } },
  surprised: { expr: null, params: { ParamMouthOpenY: 0.6, Param163: 6 } },
  shy: { expr: "脸红", params: SMILE_PARAMS() },

  angry: { expr: "抱手臂", params: { ParamMouthForm: -1 } },

  tired: { expr: "熬夜", params: SMILE_PARAMS() },

  thinking: { expr: "看书", params: SMILE_PARAMS() }

};
export const LLM_EMOTION_MAP = {
  neutral: "happy",
  happy: "happy",
  laughing: "laugh",

  tease: "tease",

  surprised: "surprised",

  shy: "shy",

  cuddle: "shy",

  sad: "sad",

  crying: "sad",

  angry: "angry",

  tired: "tired"

};
const LLM_MOTION = { crying: /流泪|汗/ };
const LLM_KEEP_SLOTS = ["slot1"];
export const EXPR_KEEP_EXTRA =  new Set();
export class L2dModel extends CubismUserModel {

  constructor(modelJsonPath, gl) {
    super();
    this._path = modelJsonPath;
    this._home = modelJsonPath.slice(0, modelJsonPath.lastIndexOf("/") + 1);
    this._gl = gl;
    this._setting = null;
    this._scheduler = new CubismUpdateScheduler();
    this._ready = false;
    this._motionUpdated = false;
    this._motions =  new Map();
    this._expressions = [];
    this._paramNames = [];
    this._texBound = 0;
    this._texFailed = [];
    this._texSize = null;
    this._textures = [];
    this._modelSpace = { w: 2, h: 2 };
    this._bounds = { x0: 0, y0: 0, x1: 2, y1: 2 };
    this._effects = { eyeBlink: null, breath: null, look: null, lipSync: null };
    this._lipSync = null;
    this._index = null;
    this._slots = [];
    this._exprParams =  new Map();
    this._exprWeight =  new Map();
    this._exprTarget =  new Map();
    this._faceParams = null;
    this._activeEmotion = null;
    this._llmEmotion = null;
    this._llmMotion = null;
    this._llmExpr = null;
    this._timings = {};
    this._t0 = 0;
    this._error = null;
  }
  get ready() {
    return this._ready;
  }

  _url(rel) {
    return encodePath(this._home + rel);
  }

  _blobOf(rel, buf) {
    var ext = String(rel || "").toLowerCase().split(".").pop();
    var mime = "application/octet-stream";
    if (ext === "png") mime = "image/png";
    else if (ext === "jpg" || ext === "jpeg") mime = "image/jpeg";
    else if (ext === "webp") mime = "image/webp";
    else if (ext === "gif") mime = "image/gif";
    return new Blob([buf], { type: mime });
  }

  setSource(src) {
    this._source = src && typeof src.get === "function" ? src : null;
    return !!this._source;
  }

  setExprAlias(map) {
    this._exprAlias = map && typeof map === "object" ? map : null;
    return !!this._exprAlias;
  }

  resolveExprName(name) {
    const raw = String(name == null ? "" : name);
    const m = this._exprAlias;
    if (!m) return raw;
    const hit = m[raw];
    const out = hit == null || hit === "" ? raw : String(hit);
    if (out !== raw) {
      if (!this._exprAliasHits) this._exprAliasHits = [];
      if (this._exprAliasHits.length < 64) this._exprAliasHits.push(raw + " → " + out);
    }
    return out;
  }

  _getModelBytes(url, asArrayBuffer) {
    const toBuf = (v) => {
      if (v == null) return v;
      if (!asArrayBuffer) return v;
      if (v instanceof ArrayBuffer) return v;
      if (v && typeof v.arrayBuffer === "function") return v.arrayBuffer();
      return v;
    };
    if (this._source) {
      return Promise.resolve(this._source.get(url, asArrayBuffer)).then((v) => {
        if (v == null) throw new Error("加载失败（取数源里没有这个文件）: " + url);
        return toBuf(v);
      });
    }
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error("加载失败 " + r.status + " : " + url);
      return asArrayBuffer ? r.arrayBuffer() : r.text();
    });
  }

  load(onStep) {
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    this._t0 = t0;
    this._timings = {};
    this._mark = (k) => {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      this._timings[k] = Math.round(now - t0);
    };
    const step = (msg) => {
      if (onStep) onStep(msg);
    };
    const get = (url) => this._getModelBytes(url, true);
    return get(encodePath(this._path)).then((buf) => {
      this._setting = new CubismModelSettingJson(buf, buf.byteLength);
      this._mark("model3.json");
      step("model3.json");
      const moc = this._setting.getModelFileName();
      if (!moc) throw new Error("model3.json 里没有 Model 字段");
      return get(this._url(moc));
    }).then((buf) => {
      this.loadModel(buf, false);
      this._mark("moc3");
      step("moc3");
      const m = this._model;
      this._modelSpace = { w: 2 * m.getCanvasWidth() / m.getCanvasHeight(), h: 2 };
      const layout =  new Map();
      if (this._setting.getLayoutMap(layout) && layout.size > 0) {
        this._modelMatrix.setupFromLayout(layout);
      }
      this.createRenderer(1, 1);
      m.update();
      this._bounds = this._measureBounds() || {
        x0: 0,
        y0: 0,
        x1: this._modelSpace.w,
        y1: this._modelSpace.h
      };
      this._collectParamNames();
      this._detectEffectIds();
      this._mark("探测");
      return this._loadIndex();
    }).then(() => this._loadExpression(step)).then(() => this._loadMotion(step)).then(() => this._loadPhysics(step)).then(() => this._loadPose(step)).then(() => this._setupAuto(step)).then(() => this._loadTextures(step)).then(() => {
      const r = this.getRenderer();
      r.startUp(this._gl);
      r.loadShaders(SHADER_DIR);
      r.setIsPremultipliedAlpha(true);
      r.setIsCulling(false);
      let hpm = true;
      try {
        const av = Config.section("avatar");
        if (av && av.highPrecisionMask === false) hpm = false;
      } catch (e) {
      }
      r.useHighPrecisionMask(hpm);
      this.captureBaseline();
      this._ready = true;
      this._mark("渲染器启动");
      step("完成" + (this._mouthExtra && this._mouthExtra.length ? " · 口型补强" : ""));
    });
  }

  dispose() {
    const gl = this._gl;
    try {
      if (this._textures && this._textures.length && gl && gl.deleteTexture) {
        for (const t of this._textures) {
          try {
            gl.deleteTexture(t);
          } catch (e) {
          }
        }
      }
    } catch (e) {
    }
    this._textures = [];
    try {
      if (this.release) this.release();
    } catch (e) {
    }
    this._ready = false;
  }

  setFileList(list) {
    this._fileList = Array.isArray(list) && list.length ? list.slice() : null;
    return !!this._fileList;
  }
  async _buildIndexFromFiles() {
    const rels = this._fileList;
    if (!rels || !rels.length) return null;
    const base = (p) => String(p).split("/").pop();
    const exprs = [];
    for (const rel of rels.filter((r) => /\.exp3\.json$/i.test(r))) {
      const file = base(rel);
      const id = file.replace(/\.exp3\.json$/i, "");
      let j = {};
      try {
        j = parseJsonLoose(await this._getModelBytes(this._url(file), false)) || {};
      } catch (e) {
        j = {};
      }
      exprs.push({
        id,
        name: id,
        file,
        params: (j.Parameters || []).map((p) => ({ id: p.Id, name: "", value: p.Value, blend: p.Blend || "Add" })),
        fadeIn: j.FadeInTime != null ? j.FadeInTime : null
      });
    }
    const motions = [];
    for (const rel of rels.filter((r) => /\.motion3\.json$/i.test(r))) {
      const file = base(rel);
      const id = file.replace(/\.motion3\.json$/i, "");
      let j = {};
      try {
        j = parseJsonLoose(await this._getModelBytes(this._url(file), false)) || {};
      } catch (e) {
        j = {};
      }
      const seen = {};
      (j.Curves || []).forEach((c) => {
        if (c.Target === "Parameter" && !seen[c.Id]) seen[c.Id] = 1;
      });
      motions.push({
        id,
        name: id,
        file,
        duration: j.Meta && j.Meta.Duration || 0,
        loop: !!(j.Meta && j.Meta.Loop),
        params: Object.keys(seen).map((pid) => ({ id: pid, name: "" }))
      });
    }
    if (!exprs.length && !motions.length) return null;
    const SLOT_DEFS = [
      { id: "slot1", label: "发型", labelKey: "l2d.slot.hair", words: ["短发", "罗马卷", "丸子头"] },
      { id: "slot2", label: "手中道具 / 姿势", labelKey: "l2d.slot.prop", words: ["麦克风", "提裙子", "水晶球", "看书", "手柄", "抱手臂"] },
      { id: "slot3", label: "体型", labelKey: "l2d.slot.body", words: ["大小变"] }
    ];
    const slots = [];
    SLOT_DEFS.forEach((d) => {
      const members = exprs.filter((e) => d.words.some((w) => e.name.indexOf(w) >= 0));
      if (members.length < 2) return;
      members.forEach((e) => {
        e.slot = d.id;
      });
      slots.push({ id: d.id, label: d.label, labelKey: d.labelKey, members: members.map((e) => e.name), sharedParams: [] });
    });
    return { version: 0, fromFiles: true, expressions: exprs, motions, slots };
  }
  _loadIndex() {
    return this._getModelBytes(this._url("tsumu.index.json"), false).then((txt) => parseJsonLoose(txt)).catch(() => null).then(async (j) => {
      this._index = j && j.version ? j : null;
      if (!this._index) {
        try {
          this._index = await this._buildIndexFromFiles();
        } catch (e) {
          this._index = null;
        }
      }
      this._slots = this._index && this._index.slots ? this._index.slots : [];
      return this._index;
    }).catch(() => {
      this._index = null;
      this._slots = [];
      return null;
    });
  }

  _loadTextures(step) {
    const n = this._setting.getTextureCount();
    if (!n) {
      step("贴图：0 张");
      return Promise.resolve();
    }
    const r = this.getRenderer();
    const gl = this._gl;
    const acc = { dl: 0, up: 0, mip: 0 };
    const now = () => typeof performance !== "undefined" ? performance.now() : Date.now();
    const loadOne = (file) => new Promise((resolve) => {
      const t0 = now();
      this._getModelBytes(this._url(file), true).then((buf) => buf ? this._blobOf(file, buf) : null).then((blob) => {
        if (!blob) {
          this._texFailed.push(this._url(file));
          return null;
        }
        return createImageBitmap(blob, { premultiplyAlpha: "premultiply", colorSpaceConversion: "none" });
      }).then((bmp) => {
        if (!bmp) {
          resolve(null);
          return;
        }
        acc.dl += now() - t0;
        const tUp0 = now();
        const tex = gl.createTexture();
        this._textures.push(tex);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        const tMip0 = now();
        acc.up += tMip0 - tUp0;
        gl.generateMipmap(gl.TEXTURE_2D);
        acc.mip += now() - tMip0;
        const size = bmp.width + "×" + bmp.height;
        try {
          bmp.close();
        } catch (e) {
        }
        resolve({ tex, size });
      }).catch(() => {
        this._texFailed.push(this._url(file));
        resolve(null);
      });
    });
    const jobs = [];
    for (let i = 0; i < n; i++) {
      const file = this._setting.getTextureFileName(i);
      if (!file) continue;
      jobs.push(loadOne(file).then((res) => {
        if (!res) return;
        r.bindTexture(i, res.tex);
        this._texBound++;
        if (!this._texSize) this._texSize = res.size;
      }));
    }
    return Promise.all(jobs).then(() => {
      this._texMs = { 解码: Math.round(acc.dl), 上传texImage2D: Math.round(acc.up), 生成mipmap: Math.round(acc.mip) };
      if (this._mark) this._mark("贴图");
      step("贴图 " + this._texBound + "/" + jobs.length + " 张" + (this._texFailed.length ? "（" + this._texFailed.length + " 张读不到）" : ""));
    });
  }

  _addExpression(name, file, slot, base, params) {
    this._exprParams.set(name, {
      file,
      slot: slot || null,
      base: base || null,
      params: (params || []).map((p) => ({
        id: p.id || p.Id,
        value: p.value != null ? p.value : p.Value,
        blend: p.blend || p.Blend || "Add"
      }))
    });
    this._expressions.push({ name, file, slot: slot || null, base: base || null });
    if (!this._exprWeight.has(name)) {
      this._exprWeight.set(name, 0);
      this._exprTarget.set(name, 0);
    }
  }
  _loadExpression(step) {
    const fromIndex = this._index && this._index.expressions ? this._index.expressions : null;
    const list = [];
    if (fromIndex && fromIndex.length) {
      fromIndex.forEach((e) => {
        if (e && e.file) {
          list.push({
            name: e.name || e.id,
            file: e.file,
            slot: e.slot || null,
            base: e.base || null,
            params: e.params || null
          });
        }
      });
    } else {
      const n = this._setting.getExpressionCount();
      for (let i = 0; i < n; i++) {
        const file = this._setting.getExpressionFileName(i);
        if (file) {
          list.push({ name: this._setting.getExpressionName(i) || file, file, slot: null, base: null, params: null });
        }
      }
    }
    if (!list.length) {
      step("表情：清单与 model3.json 都没有声明");
      return Promise.resolve();
    }
    const jobs = list.map((item) => {
      if (item.params && item.params.length) {
        this._addExpression(item.name, item.file, item.slot, item.base, item.params);
        return Promise.resolve();
      }
      return this._getModelBytes(this._url(item.file), false).then((txt) => parseJsonLoose(txt)).then((j) => {
        if (j && j.Parameters) this._addExpression(item.name, item.file, item.slot, item.base, j.Parameters);
      }).catch(() => {
      });
    });
    return Promise.all(jobs).then(() => {
      if (this._mark) this._mark("表情+动作");
      step("表情 " + this._expressions.length + " 个 · 叠加层" + (fromIndex ? "（清单）" : "（model3.json）"));
    });
  }

  setExpression(name, on, instant) {
    if (!this._exprParams.has(name)) return false;
    if (on) {
      const meta = this._exprParams.get(name);
      if (meta.slot) {
        for (const [n, m] of this._exprParams) {
          if (n !== name && m.slot === meta.slot) this._exprTarget.set(n, 0);
        }
      }
      this._activeExpr = name;
    }
    this._exprTarget.set(name, on ? 1 : 0);
    this._pruneOrphanModifiers();
    if (instant) for (const [n, t] of this._exprTarget) this._exprWeight.set(n, t);
    return true;
  }

  toggleExpression(name) {
    const on = (this._exprTarget.get(name) || 0) > 0.5;
    this.setExpression(name, !on);
    return !on;
  }

  _pruneOrphanModifiers() {
    for (const [n, m] of this._exprParams) {
      if (!m.base) continue;
      if ((this._exprTarget.get(m.base) || 0) < 0.5) this._exprTarget.set(n, 0);
    }
  }

  _applyExpressionLayer(model, dt) {
    const step = dt || 0.016;
    const k = Math.min(1, step / 0.22);
    let live = 0;
    for (const [n, t] of this._exprTarget) {
      const w = this._exprWeight.get(n) || 0;
      if (Math.abs(w - t) > 1e-3) this._exprWeight.set(n, w + (t - w) * k);
      else if (w !== t) this._exprWeight.set(n, t);
      if ((this._exprWeight.get(n) || 0) > 1e-3) live++;
    }
    if (!live) return;
    const ids = CubismFramework.getIdManager();
    const acc =  new Map();
    for (const [n, w] of this._exprWeight) {
      if (w <= 1e-3) continue;
      const meta = this._exprParams.get(n);
      if (!meta) continue;
      for (let i = 0; i < meta.params.length; i++) {
        const p = meta.params[i];
        if (!p || !p.id) continue;
        let a = acc.get(p.id);
        if (!a) {
          a = { add: 0, mul: 1, ovr: null };
          acc.set(p.id, a);
        }
        if (p.blend === "Multiply") a.mul *= 1 - w + p.value * w;
        else if (p.blend === "Overwrite") a.ovr = (a.ovr == null ? 0 : a.ovr) * (1 - w) + p.value * w;
        else a.add += p.value * w;
      }
    }
    for (const [pid, a] of acc) {
      const handle = ids.getId(pid);
      const base = model.getParameterValueById(handle);
      if (base == null) continue;
      const v = ((a.ovr != null ? a.ovr : base) + a.add) * a.mul;
      model.setParameterValueById(handle, v, 1);
    }
  }

  activeExpressions() {
    const out = [];
    for (const [n, w] of this._exprWeight) if (w > 0.01) out.push(n);
    return out;
  }

  pressedExpressions() {
    const out = [];
    for (const [n, t] of this._exprTarget) if (t > 0.5) out.push(n);
    return out;
  }
  expressionWeight(name) {
    return this._exprWeight.get(name) || 0;
  }
  expressionMeta(name) {
    return this._exprParams.get(name) || null;
  }
  expressionParamsOf(name) {
    const m = this._exprParams.get(name);
    return m ? m.params : null;
  }

  _loadMotion(step) {
    const fromIndex = this._index && this._index.motions ? this._index.motions : null;
    const jobs = [];
    if (fromIndex && fromIndex.length) {
      fromIndex.forEach((m, gi) => {
        if (!m || !m.file) return;
        const list = [];
        const item = { i: 0, file: m.file, motion: null };
        list.push(item);
        this._motions.set(m.name || m.id, list);
        jobs.push(this._getModelBytes(this._url(m.file), true).catch(() => null).then((b) => {
          if (!b) return;
          const mo = this.loadMotion(b, b.byteLength, m.file, null, null, this._setting, m.id, 0);
          if (!mo) return;
          mo.setEffectIds(this._det.eyeBlinkHandles, this._det.lipSyncHandles);
          mo.setLoop(!!m.loop);
          item.motion = mo;
        }).catch(() => {
        }));
      });
      return Promise.all(jobs).then(() => {
        step("动作 " + this._motions.size + " 条（清单）");
      });
    }
    const groupCount = this._setting.getMotionGroupCount();
    if (!groupCount) {
      step("动作：清单与 model3.json 都没有声明");
      return Promise.resolve();
    }
    for (let gi = 0; gi < groupCount; gi++) {
      const g = this._setting.getMotionGroupName(gi);
      if (!g) continue;
      const cnt = this._setting.getMotionCount(g);
      const list = [];
      this._motions.set(g, list);
      for (let i = 0; i < cnt; i++) {
        const file = this._setting.getMotionFileName(g, i);
        if (!file) continue;
        const item = { i, file, motion: null };
        list.push(item);
        jobs.push(this._getModelBytes(this._url(file), true).catch(() => null).then((b) => {
          if (!b) return;
          const m = this.loadMotion(b, b.byteLength, file, null, null, this._setting, g, i);
          if (!m) return;
          m.setEffectIds(this._det.eyeBlinkHandles, this._det.lipSyncHandles);
          if (/idle|loop|待机/i.test(g)) m.setLoop(true);
          item.motion = m;
        }).catch(() => {
        }));
      }
    }
    return Promise.all(jobs).then(() => {
      step("动作组 " + this._motions.size + " / 共 " + jobs.length + " 条");
    });
  }
  _loadPhysics(step) {
    const f = this._setting.getPhysicsFileName();
    if (!f) {
      step("物理：无");
      return Promise.resolve();
    }
    return this._getModelBytes(this._url(f), true).catch(() => null).then((b) => {
      if (!b) {
        step("物理：文件读不到");
        return;
      }
      this.loadPhysics(b, b.byteLength);
      if (this._physics) {
        this._scheduler.addUpdatableList(new CubismPhysicsUpdater(this._physics));
        step("物理 ✓");
      } else {
        step("物理：解析为空");
      }
    }).catch((e) => step("物理失败: " + e.message));
  }
  _loadPose(step) {
    const f = this._setting.getPoseFileName();
    if (!f) {
      step("姿势：无");
      return Promise.resolve();
    }
    return this._getModelBytes(this._url(f), true).catch(() => null).then((b) => {
      if (!b) {
        step("姿势：文件读不到");
        return;
      }
      this.loadPose(b, b.byteLength);
      if (this._pose) {
        this._scheduler.addUpdatableList(new CubismPoseUpdater(this._pose));
        step("姿势 ✓");
      } else {
        step("姿势：解析为空");
      }
    }).catch((e) => step("姿势失败: " + e.message));
  }

  _collectParamNames() {
    const names = [];
    for (let i = 0; i < this._model.getParameterCount(); i++) {
      names.push(this._model.getParameterId(i).getString());
    }
    this._paramNames = names;
    return names;
  }

  _detectEffectIds() {
    const ids = CubismFramework.getIdManager();
    const names = this._paramNames || this._collectParamNames();
    const has = (n) => names.indexOf(n) >= 0;
    let eye = [];
    for (let i = 0; i < this._setting.getEyeBlinkParameterCount(); i++) {
      const h = this._setting.getEyeBlinkParameterId(i);
      if (h) eye.push(h.getString());
    }
    if (!eye.length) eye = [PID.ParamEyeLOpen, PID.ParamEyeROpen].filter(has);
    let lip = [];
    for (let i = 0; i < this._setting.getLipSyncParameterCount(); i++) {
      const h = this._setting.getLipSyncParameterId(i);
      if (h) lip.push(h.getString());
    }
    if (!lip.length) lip = [PID.ParamMouthOpenY].filter(has);
    const extras = [];
    const eIdx = names.indexOf(PID.Param163 || "Param163");
    if (eIdx >= 0) {
      const mx = this._model.getParameterMaximumValue(eIdx);
      extras.push({
        id: PID.Param163 || "Param163",
        handle: ids.getId(PID.Param163 || "Param163"),
        scale: mx > 1.5 ? mx : 0
      });
    }
    this._mouthExtra = extras.filter((x) => x.scale > 0);
    this._det = {
      eyeBlink: eye,
      lipSync: lip,
      eyeBlinkHandles: eye.map((n) => ids.getId(n)),
      lipSyncHandles: lip.map((n) => ids.getId(n))
    };
    return this._det;
  }
  _setupAuto(step) {
    const ids = CubismFramework.getIdManager();
    const names = this._paramNames.length ? this._paramNames : this._collectParamNames();
    const det = this._det || this._detectEffectIds();
    const has = (n) => names.indexOf(n) >= 0;
    const found = [];
    const eyeIds = det.eyeBlink;
    if (eyeIds.length) {
      this._eyeBlink = CubismEyeBlink.create();
      this._eyeBlink.setParameterIds(det.eyeBlinkHandles);
      this._eyeBlink.setBlinkingInterval(3);
      this._eyeBlink.setBlinkingSetting(0.1, 0.1, 0.1);
      this._effects.eyeBlink = eyeIds;
      this._scheduler.addUpdatableList(
        new CubismEyeBlinkUpdater(() => this._motionUpdated, this._eyeBlink)
      );
      found.push("眨眼");
    }
    const breathSpec = [
      [PID.ParamAngleX, 0, 15, 6.5345, 0.5],
      [PID.ParamAngleY, 0, 8, 3.5345, 0.5],
      [PID.ParamAngleZ, 0, 10, 5.5345, 0.5],
      [PID.ParamBodyAngleX, 0, 4, 15.5345, 0.5],
      [PID.ParamBreath, 0.5, 0.5, 3.2345, 1]
    ].filter((s) => has(s[0]));
    if (breathSpec.length) {
      this._breath = CubismBreath.create();
      this._breath.setParameters(breathSpec.map((s) => ({
        parameterId: ids.getId(s[0]),
        offset: s[1],
        peak: s[2],
        cycle: s[3],
        weight: s[4]
      })));
      this._effects.breath = breathSpec.map((s) => s[0]);
      this._scheduler.addUpdatableList(new CubismBreathUpdater(this._breath));
      found.push("呼吸");
    }
    const LOOK_POSE = 0.25;
    const LOOK_EYE = 1;
    const lookSpec = [
      [PID.ParamAngleX, 30 * LOOK_POSE, 0, 0],

      [PID.ParamAngleY, 0, 30 * LOOK_POSE, 0],

      [PID.ParamAngleZ, 0, 0, 30 * LOOK_POSE],

      [PID.ParamBodyAngleX, 10 * LOOK_POSE, 0, 0],

      [PID.ParamEyeBallX, LOOK_EYE, 0, 0],
      [PID.ParamEyeBallY, 0, LOOK_EYE, 0]
    ].filter((s) => has(s[0]));
    if (lookSpec.length) {
      this._look = CubismLook.create();
      this._look.setParameters(lookSpec.map((s) => (

        new LookParameterData(ids.getId(s[0]), s[1], s[2], s[3] || 0)
      )));
      this._effects.look = lookSpec.map((s) => s[0]);
      this._scheduler.addUpdatableList(new CubismLookUpdater(this._look, this._dragManager));
      found.push("视线");
    }
    const lipIds = det.lipSync;
    if (lipIds.length) {
      this._lipSync = new CubismLipSyncUpdater(det.lipSyncHandles, null);
      this._effects.lipSync = lipIds;
      this._scheduler.addUpdatableList(this._lipSync);
      found.push("口型");
    }
    step("自动效果：" + (found.length ? found.join(" + ") : "该模型没有可用参数"));
  }

  setMouthProvider(provider) {
    if (!this._lipSync) return false;
    this._lipSync.setAudioProvider(provider);
    return true;
  }

  _applyMouthExtras(model) {
    if (!this._lipSync || !this._mouthExtra || !this._mouthExtra.length) return;
    let level = 0;
    try {
      const prov = this._lipSync.getAudioProvider();
      if (prov && prov.getParameter) level = prov.getParameter() || 0;
    } catch (e) {
      return;
    }
    if (level <= 0) return;
    for (let i = 0; i < this._mouthExtra.length; i++) {
      const it = this._mouthExtra[i];
      model.addParameterValueById(it.handle, level * it.scale);
    }
  }

  setPose(pose) {
    this._pose = Object.assign({ rot: 0, dx: 0, dy: 0, scale: 1, pivotY: 0.62 }, pose || {});
    return this._pose;
  }
  getPose() {
    return this._pose || null;
  }
  clearPose() {
    this._pose = null;
    return true;
  }

  effectivePose() {
    const p = this._pose;
    if (!p) return null;
    const out = {
      rot: p.rot || 0,
      dx: p.dx || 0,
      dy: p.dy || 0,
      scale: p.scale == null ? 1 : p.scale,
      pivotY: p.pivotY == null ? 0.62 : p.pivotY
    };
    const mo = p.motion;
    if (mo) {
      const t = this._poseTime || 0;
      const TAU = Math.PI * 2;
      if (mo.bobAmp) out.dy += mo.bobAmp * Math.sin(t * TAU * (mo.bobHz || 1.2));
      if (mo.swayAmp) out.dx += mo.swayAmp * Math.sin(t * TAU * (mo.swayHz || 0.45));
      if (mo.rotAmp) out.rot += mo.rotAmp * Math.sin(t * TAU * (mo.rotHz || 0.6));
    }
    return out;
  }

  captureBaseline() {
    const m = this._model;
    if (!m) return 0;
    const n = m.getParameterCount();
    const v = new Float32Array(n);
    for (let i = 0; i < n; i++) v[i] = m.getParameterValueByIndex(i);
    this._cleanBaseline = v;
    return n;
  }
  restoreBaseline() {
    if (!this._cleanBaseline || !this._model) return false;
    this.clearMotions();
    this.clearExpressions();
    this._pose = null;
    this._overrides = null;
    this._faceParams = null;
    this._activeEmotion = null;
    this._llmEmotion = null;
    this._llmMotion = null;
    this._llmExpr = null;
    const m = this._model;
    const n = Math.min(this._cleanBaseline.length, m.getParameterCount());
    for (let i = 0; i < n; i++) m.setParameterValueByIndex(i, this._cleanBaseline[i], 1);
    m.saveParameters();
    return true;
  }

  setEmotion(name) {
    const e = EMOTION_PRESETS[name];
    if (!e) return false;
    const prevLlmExpr = this._llmExpr || null;
    this.clearExpressions({ keepSlots: LLM_KEEP_SLOTS, keepExtra: EXPR_KEEP_EXTRA, exclude: prevLlmExpr ? [prevLlmExpr] : [] });
    this._llmExpr = null;
    this.clearPose();
    this._faceParams = e.params || {};
    let appliedExpr = null, aliasHit = false;
    if (e.expr) {
      const want = this.resolveExprName(e.expr);
      aliasHit = want !== e.expr;
      if (this.expressionNames().indexOf(want) >= 0) {
        this.setExpression(want, true);
        this._llmExpr = want;
        appliedExpr = want;
      }
    }
    this._activeEmotion = name;
    return { applied: true, preset: name, expr: appliedExpr, degraded: !!(e.expr && appliedExpr === null), aliasUsed: aliasHit };
  }
  activeEmotion() {
    return this._activeEmotion || null;
  }
  emotionNames() {
    return Object.keys(EMOTION_PRESETS);
  }

  applyLlmEmotion(name) {
    const key = String(name == null ? "" : name).trim().toLowerCase();
    const preset = LLM_EMOTION_MAP[key];
    if (!preset || !EMOTION_PRESETS[preset]) return null;
    if (this._llmEmotion === key) {
      return {
        emotion: key,
        preset,
        motion: this._llmMotion || null,
        unchanged: true,
        expr: this._llmExpr || null,
        degraded: false,
        aliasUsed: false
      };
    }
    this.stopLlmMotion();
    this._llmEmotion = key;
    const applied = this.setEmotion(preset);
    const re = LLM_MOTION[key];
    if (re) this._startLlmMotion(re);
    return {
      emotion: key,
      preset,
      motion: this._llmMotion || null,
      unchanged: false,

      expr: applied && applied.expr || null,
      degraded: !!(applied && applied.degraded),
      aliasUsed: !!(applied && applied.aliasUsed)
    };
  }

  clearLlmEmotion() {
    if (!this._llmEmotion) return false;
    this.stopLlmMotion();
    this._llmEmotion = null;
    const llmExpr = this._llmExpr || null;
    this._llmExpr = null;
    this.clearExpressions({ keepSlots: LLM_KEEP_SLOTS, keepExtra: EXPR_KEEP_EXTRA, exclude: llmExpr ? [llmExpr] : [] });
    return true;
  }

  llmEmotion() {
    return this._llmEmotion || null;
  }

  _startLlmMotion(re) {
    const g = this.motionNames().find((n) => re.test(n));
    if (!g || this._llmMotion === g) return null;
    if (!this.playMotion(g, 0)) return null;
    this._llmMotion = g;
    return g;
  }

  stopLlmMotion() {
    if (!this._llmMotion) return false;
    this._llmMotion = null;
    this.clearMotions();
    try {
      if (this._cleanBaseline && this._model) {
        const m = this._model;
        const n = Math.min(this._cleanBaseline.length, m.getParameterCount());
        for (let i = 0; i < n; i++) m.setParameterValueByIndex(i, this._cleanBaseline[i], 1);
        m.saveParameters();
      }
    } catch (e) {
    }
    return true;
  }

  stopAdHocMotion() {
    this.clearMotions();
    try {
      if (this._cleanBaseline && this._model) {
        const m = this._model;
        const n = Math.min(this._cleanBaseline.length, m.getParameterCount());
        for (let i = 0; i < n; i++) m.setParameterValueByIndex(i, this._cleanBaseline[i], 1);
        m.saveParameters();
      }
    } catch (e) {
    }
    return true;
  }

  _measureBounds() {
    const m = this._model;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < m.getDrawableCount(); i++) {
      if (!m.getDrawableDynamicFlagIsVisible(i)) continue;
      const v = m.getDrawableVertexPositions(i);
      if (!v) continue;
      for (let k = 0; k < v.length; k += 2) {
        if (v[k] < x0) x0 = v[k];
        if (v[k] > x1) x1 = v[k];
        if (v[k + 1] < y0) y0 = v[k + 1];
        if (v[k + 1] > y1) y1 = v[k + 1];
      }
    }
    if (!isFinite(x0) || !isFinite(y0) || x1 <= x0 || y1 <= y0) return null;
    const mm = this._modelMatrix;
    const ax = [mm.transformX(x0), mm.transformX(x1)];
    const ay = [mm.transformY(y0), mm.transformY(y1)];
    return {
      x0: Math.min(ax[0], ax[1]),
      x1: Math.max(ax[0], ax[1]),
      y0: Math.min(ay[0], ay[1]),
      y1: Math.max(ay[0], ay[1])
    };
  }

  look(x, y) {
    if (this._dragManager) this.setDragging(x, y);
  }

  playMotion(group, index) {
    const list = this._motions.get(group);
    if (!list || !list.length) return false;
    const pick = index == null ? Math.floor(Math.random() * list.length) : index;
    const item = list[Math.max(0, Math.min(pick, list.length - 1))];
    if (!item || !item.motion) return false;
    const h = this._motionManager.startMotionPriority(item.motion, false, 3);
    return h != null;
  }

  playExpression(index) {
    const e = this._expressions[index];
    if (!e) return false;
    return this.setExpression(e.name, true);
  }

  propSlotId() {
    if (!this._slots || !this._slots.length) return "slot2";
    const byKey = this._slots.filter((s) => s.labelKey === "l2d.slot.prop")[0];
    if (byKey) return byKey.id;
    const byName = this._slots.filter((s) => /道具|prop/i.test(s.label || ""))[0];
    return byName && byName.id || "slot2";
  }

  slotActive(slotId) {
    const id = slotId || this.propSlotId();
    for (let i = 0; i < this._expressions.length; i++) {
      const e = this._expressions[i];
      if (e.slot === id && this.expressionWeight(e.name) > 0) return e.name;
    }
    return null;
  }

  useProp(name) {
    if (!name) return false;
    if (this.expressionNames().indexOf(name) < 0) return false;
    const id = this.propSlotId();
    if (this._propSaved === void 0) this._propSaved = this.slotActive(id);
    this._propActive = name;
    return this.setExpression(name, true);
  }

  propIsOurs() {
    if (!this._propActive) return false;
    return this.slotActive(this.propSlotId()) === this._propActive;
  }

  restoreProp() {
    if (this._propSaved === void 0 && !this._propActive) return false;
    const id = this.propSlotId();
    const back = this._propSaved;
    this._propSaved = void 0;
    this._propActive = null;
    this._expressions.forEach((e) => {
      if (e.slot === id) this.setExpression(e.name, false);
    });
    if (back) return this.setExpression(back, true);
    return true;
  }

  hasIndex() {
    return !!this._index;
  }
  slots() {
    return this._slots.map((s) => ({
      id: s.id,
      label: s.label,
      labelKey: s.labelKey || null,
      members: (s.members || []).slice()
    }));
  }
  expressionNames() {
    return this._expressions.map((e) => e.name);
  }

  looseExpressions() {
    const inSlot = {};
    this._slots.forEach((s) => (s.members || []).forEach((m) => {
      inSlot[m] = 1;
    }));
    return this._expressions.filter((e) => !inSlot[e.name] && !e.base).map((e) => e.name);
  }

  modifiers() {
    return this._expressions.filter((e) => e.base).map((e) => ({ name: e.name, base: e.base }));
  }

  expressionVerified(name) {
    const list = this._index && this._index.expressions;
    if (!list) return null;
    const e = list.find((x) => (x.name || x.id) === name);
    return e && e.verified || null;
  }
  motionNames() {
    return [...this._motions.keys()];
  }
  activeExpression() {
    return this._activeExpr || null;
  }
  playExpressionByName(name) {
    const i = this._expressions.findIndex((e) => e.name === name);
    return i >= 0 ? this.playExpression(i) : false;
  }

  clearExpressions(opts) {
    const keepSlots = opts && opts.keepSlots || null;
    const keepExtra = opts && opts.keepExtra || null;
    const exclude = opts && Array.isArray(opts.exclude) ? opts.exclude : null;
    let keep = null;
    if (keepSlots) {
      keep =  new Set();
      for (const [n, t] of this._exprTarget) {
        const meta = this._exprParams.get(n);
        if (t > 0.5 && meta && meta.slot && keepSlots.indexOf(meta.slot) >= 0) keep.add(n);
      }
      if (keepExtra) {
        for (const [n, t] of this._exprTarget) {
          if (t > 0.5 && keepExtra.has && keepExtra.has(n)) keep.add(n);
        }
      }
      for (const [n, t] of this._exprTarget) {
        const meta = this._exprParams.get(n);
        if (t > 0.5 && meta && meta.base && keep.has(meta.base)) keep.add(n);
      }
      if (exclude) exclude.forEach((n) => {
        if (n) keep.delete(n);
      });
    }
    for (const n of this._exprTarget.keys()) {
      if (keep && keep.has(n)) continue;
      this._exprTarget.set(n, 0);
    }
    this._faceParams = null;
    if (!keep || !keep.size) this._activeExpr = null;
    else if (!keep.has(this._activeExpr)) this._activeExpr = keep.values().next().value;
    return true;
  }

  clearMotions() {
    try {
      this._motionManager.stopAllMotions();
    } catch (e) {
    }
    this._motionUpdated = false;
    return true;
  }

  setFreeze(on) {
    this._freeze = !!on;
    return this._freeze;
  }

  setParamOverrides(map) {
    this._overrides = map && Object.keys(map).length ? map : null;
    return !!this._overrides;
  }

  _applyFaceParams(model) {
    const m = this._faceParams !== void 0 && this._faceParams !== null ? this._faceParams : this._defaultFace;
    if (!m) return;
    const have = this._paramNames || [];
    const isKnown = (k) => have.indexOf(k) >= 0;
    const ids = CubismFramework.getIdManager();
    const skipped = [];
    const filter = have.length > 0;
    for (const k in m) {
      if (filter && !isKnown(k)) {
        skipped.push(k);
        continue;
      }
      model.addParameterValueById(ids.getId(k), m[k]);
    }
    if (skipped.length) {
      this._skippedFaceParams = skipped;
      if (!this._missingPresetParams) this._missingPresetParams = [];
      skipped.forEach((k) => {
        if (this._missingPresetParams.indexOf(k) < 0) this._missingPresetParams.push(k);
      });
    }
    return skipped;
  }

  setDefaultFace(params, emotionName) {
    this._defaultFace = params || null;
    if (emotionName) this._activeEmotion = emotionName;
    return !!this._defaultFace;
  }
  getDefaultFace() {
    return this._defaultFace || null;
  }
  _applyOverrides(model) {
    if (!this._overrides) return;
    const ids = CubismFramework.getIdManager();
    for (const k in this._overrides) {
      model.setParameterValueById(ids.getId(k), this._overrides[k], 1);
    }
  }

  update(dt, w, h) {
    if (!this._ready) return;
    try {
      if (!this._freeze) this._poseTime = (this._poseTime || 0) + dt;
      const model = this._model;
      model.loadParameters();
      if (this._freeze) {
        let upd = false;
        if (!this._motionManager.isFinished()) {
          upd = this._motionManager.updateMotion(model, dt);
        }
        this._motionUpdated = upd;
        model.saveParameters();
        this._applyExpressionLayer(model, dt);
        this._applyFaceParams(model);
        this._applyMouthExtras(model);
        this._applyOverrides(model);
        model.update();
        this.setRenderTargetSize(w, h);
        return;
      }
      let updated = false;
      if (this._motionManager.isFinished()) {
        const g = this._idleGroup();
        if (g) this.playMotion(g, null);
      } else {
        updated = this._motionManager.updateMotion(model, dt);
      }
      this._motionUpdated = updated;
      model.saveParameters();
      this._scheduler.onLateUpdate(model, dt);
      this._applyExpressionLayer(model, dt);
      this._applyFaceParams(model);
      this._applyMouthExtras(model);
      this._applyOverrides(model);
      model.update();
      this.setRenderTargetSize(w, h);
    } catch (e) {
      this._fail("update", e);
    }
  }
  _idleGroup() {
    for (const g of this._motions.keys()) {
      if (/idle|待机/i.test(g)) return g;
    }
    if (this._index && this._index.motions && this._index.motions.length) return null;
    for (const [g, list] of this._motions) {
      if (list.some((x) => x.motion)) return g;
    }
    return null;
  }

  viewRect(viewW, viewH, zoom, ox, oy, fill) {
    const b = this._bounds;
    const bw = Math.max(1e-4, b.x1 - b.x0), bh = Math.max(1e-4, b.y1 - b.y0);
    const av = viewW / Math.max(1, viewH);
    let vw, vh;
    const wide = bw / bh > av;
    if (fill ? !wide : wide) {
      vw = bw;
      vh = bw / av;
    } else {
      vh = bh;
      vw = bh * av;
    }
    const z = zoom || 1;
    vw /= z;
    vh /= z;
    const cx = (b.x0 + b.x1) * 0.5 + (ox || 0) * vw * 0.5;
    const cy = (b.y0 + b.y1) * 0.5 + (oy || 0) * vh * 0.5;
    return { x0: cx - vw * 0.5, x1: cx + vw * 0.5, y0: cy - vh * 0.5, y1: cy + vh * 0.5, w: vw, h: vh };
  }

  draw(viewW, viewH, zoom, ox, oy, fill) {
    if (!this._ready) return;
    try {
      const vr = this.viewRect(viewW, viewH, zoom, ox, oy, fill);
      const proj = new CubismMatrix44();
      setOrthographic(proj, vr.x0, vr.x1, vr.y0, vr.y1, -1, 1);
      const pose = this.effectivePose();
      if (pose && (pose.rot || pose.dx || pose.dy || pose.scale && pose.scale !== 1)) {
        const k = pose.scale || 1;
        const rad = (pose.rot || 0) * Math.PI / 180;
        const c = Math.cos(rad) * k, s = Math.sin(rad) * k;
        const pivX = (vr.x0 + vr.x1) * 0.5;
        const pivY = vr.y0 + (vr.y1 - vr.y0) * (pose.pivotY == null ? 0.62 : pose.pivotY);
        const tx = pivX - (c * pivX - s * pivY) + (pose.dx || 0);
        const ty = pivY - (s * pivX + c * pivY) + (pose.dy || 0);
        const rm = new CubismMatrix44();
        rm.setMatrix(new Float32Array([
          c,
          s,
          0,
          0,
          -s,
          c,
          0,
          0,
          0,
          0,
          1,
          0,
          tx,
          ty,
          0,
          1
        ]));
        proj.multiplyByMatrix(rm);
      }
      proj.multiplyByMatrix(this._modelMatrix);
      const r = this.getRenderer();
      r.setMvpMatrix(proj);
      r.setRenderState(null, [0, 0, viewW, viewH]);
      r.drawModel(SHADER_DIR);
    } catch (e) {
      this._fail("draw", e);
    }
  }
  _fail(where, e) {
    if (this._error) return;
    this._error = where + ": " + (e && (e.stack || e.message) || e);
    console.error("[l2d] " + this._error);
  }

  info() {
    const m = this._model;
    const effects = {};
    for (const k of Object.keys(this._effects)) effects[k] = this._effects[k];
    return {
      ready: this._ready,
      canvas: m ? [m.getCanvasWidth(), m.getCanvasHeight()] : null,
      modelSpace: this._modelSpace,
      bounds: this._bounds,
      paramCount: this._paramNames.length,
      params: this._paramNames,
      drawables: m ? m.getDrawableCount() : 0,
      parts: m ? m.getPartCount() : 0,
      textures: { bound: this._texBound, failed: this._texFailed.length, size: this._texSize },
      fromIndex: !!this._index,
      slots: this._slots.map((s) => s.label + "(" + (s.members || []).length + ")"),
      expressions: this._expressions.map((e) => e.name),
      motions: [...this._motions.entries()].map(([g, l]) => g + ":" + l.length),
      effects,
      timings: this._timings,
      texMs: this._texMs || null,
      schedulerCount: this._scheduler.getUpdatableCount(),
      error: this._error
    };
  }
}
