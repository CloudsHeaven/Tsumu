(function(global) {
  "use strict";
  var KEY = "tsumu.pomoaudio.v1";
  var listeners = [];
  function defaults() {
    return { v: 1, volLofi: 0.45, volAmb: 0.45, volCustom: 0.45, gainDb: 0, mode: "one", follow: true, tab: "lofi" };
  }
  function read() {
    try {
      var o = JSON.parse(global.localStorage.getItem(KEY) || "");
      if (o && typeof o === "object") {
        var d = defaults();
        d.volLofi = clamp01(o.volLofi, d.volLofi);
        d.volAmb = clamp01(o.volAmb, d.volAmb);
        d.volCustom = clamp01(o.volCustom, d.volCustom);
        d.gainDb = clampDb(o.gainDb, d.gainDb);
        d.mode = o.mode === "seq" || o.mode === "shuffle" ? o.mode : "one";
        d.follow = o.follow !== false;
        d.tab = o.tab === "amb" || o.tab === "custom" ? o.tab : "lofi";
        return d;
      }
    } catch (e) {
    }
    return defaults();
  }
  function write(cfg) {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(cfg));
    } catch (e) {
    }
    emit();
  }
  function clamp01(v, d) {
    var n = Number(v);
    return isFinite(n) ? Math.max(0, Math.min(1, n)) : d;
  }
  function clampDb(v, d) {
    var n = Number(v);
    return isFinite(n) ? Math.max(0, Math.min(24, n)) : d;
  }
  function emit() {
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i]();
      } catch (e) {
      }
    }
  }
  function dbToGain(db) {
    return Math.pow(10, (Number(db) || 0) / 20);
  }
  var bags = {};
  function bagOf(which) {
    var w = which || "lofi";
    if (!bags[w]) bags[w] = [];
    return bags[w];
  }
  function nextIndex(mode, cur, total, rand, which) {
    if (total <= 0) return -1;
    if (mode === "one") return cur < 0 ? 0 : cur;
    if (mode === "seq") return ((cur < 0 ? -1 : cur) + 1) % total;
    var r = typeof rand === "function" ? rand : Math.random;
    var bag = bagOf(which);
    if (bag.length === 0) {
      for (var i = 0; i < total; i++) bag.push(i);
      for (var j = bag.length - 1; j > 0; j--) {
        var k = Math.floor(r() * (j + 1));
        var t = bag[j];
        bag[j] = bag[k];
        bag[k] = t;
      }
      if (total > 1 && bag[0] === cur) {
        var s = bag[0];
        bag[0] = bag[1];
        bag[1] = s;
      }
    }
    return bag.shift();
  }
  function resetBag(which) {
    if (which) {
      bags[which] = [];
    } else {
      bags = {};
    }
  }
  function chan(w) {
    return w === "amb" || w === "custom" ? w : "lofi";
  }
  function gainKey(w) {
    return w === "amb" ? "gainAmb" : w === "custom" ? "gainCustom" : "gainLofi";
  }
  function volOf(cfg, w) {
    return w === "amb" ? cfg.volAmb : w === "custom" ? cfg.volCustom : cfg.volLofi;
  }
  function volKey(w) {
    return w === "amb" ? "volAmb" : w === "custom" ? "volCustom" : "volLofi";
  }
  var A = {
    lofi: null,
    amb: null,
    custom: null,
    ctx: null,
    gainLofi: null,
    gainAmb: null,
    gainCustom: null,
    comp: null,
    list: { lofi: [], amb: [], custom: [] },

    idx: { lofi: -1, amb: -1, custom: -1 },
    active: "",

    fadeTimers: { lofi: 0, amb: 0, custom: 0 },
    ducked: false,
    customDir: null,
    customLabel: "",

    onTick: null,

    customUrl: [],

    hooks: { onMainPlayerShouldPause: null }

  };
  function rememberTab(w) {
    var c = read();
    if (c.tab === w) return;
    c.tab = w;
    try {
      global.localStorage.setItem(KEY, JSON.stringify(c));
    } catch (e) {
    }
  }
  function ensureEl(which) {
    var el = A[which];
    if (el) return el;
    if (!global.Audio) return null;
    el = new global.Audio();
    el.preload = "none";
    el.loop = false;
    el.addEventListener("ended", function() {
      onEnded(which);
    });
    el.addEventListener("error", function() {
      emit();
    });
    el.addEventListener("loadedmetadata", function() {
      try {
        var d = el.duration;
        if (isFinite(d) && d > 0 && A.list[which][A.idx[which]]) A.list[which][A.idx[which]].dur = d;
      } catch (e) {
      }
      emit();
    });
    el.addEventListener("timeupdate", function() {
      if (typeof A.onTick === "function") {
        try {
          A.onTick();
        } catch (e) {
        }
      }
    });
    A[which] = el;
    return el;
  }
  function ensureGraph() {
    if (A.ctx) return;
    var Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) return;
    try {
      A.ctx = new Ctx();
      A.comp = A.ctx.createDynamicsCompressor ? A.ctx.createDynamicsCompressor() : null;
      if (A.comp) {
        A.comp.threshold.value = -6;
        A.comp.knee.value = 6;
        A.comp.ratio.value = 8;
        A.comp.attack.value = 3e-3;
        A.comp.release.value = 0.25;
      }
      ["lofi", "amb", "custom"].forEach(function(w) {
        var el = ensureEl(w);
        if (!el) return;
        var g = A.ctx.createGain();
        try {
          var src = A.ctx.createMediaElementSource(el);
          src.connect(g);
        } catch (e) {
          return;
        }
        if (A.comp) {
          g.connect(A.comp);
        } else {
          g.connect(A.ctx.destination);
        }
        A[gainKey(w)] = g;
      });
      if (A.comp) A.comp.connect(A.ctx.destination);
    } catch (e) {
      A.ctx = null;
    }
  }
  function applyGain() {
    var cfg = read();
    var boost = dbToGain(cfg.gainDb) * (A.ducked ? 0.25 : 1);
    ["lofi", "amb", "custom"].forEach(function(w) {
      var g = A[gainKey(w)];
      if (g && A.ctx) {
        try {
          g.gain.setTargetAtTime(boost, A.ctx.currentTime, 0.05);
        } catch (e) {
          g.gain.value = boost;
        }
      }
      var el = A[w];
      if (el && !A.fadeTimers[w]) {
        var lv = volOf(cfg, w);
        el.volume = A.ctx ? lv : lv * (A.ducked ? 0.25 : 1);
      }
    });
  }
  function clearFade(which) {
    if (which) {
      if (A.fadeTimers[which]) {
        clearInterval(A.fadeTimers[which]);
        A.fadeTimers[which] = 0;
      }
      return;
    }
    ["lofi", "amb", "custom"].forEach(function(w) {
      if (A.fadeTimers[w]) {
        clearInterval(A.fadeTimers[w]);
        A.fadeTimers[w] = 0;
      }
    });
  }
  function fade(which, to, ms, then) {
    var el = A[which];
    if (!el) {
      if (then) then();
      return;
    }
    clearFade(which);
    var from = Number(el.volume);
    var steps = Math.max(1, Math.round((ms || 600) / 80));
    var i = 0;
    el.volume = Math.max(0, Math.min(1, from));
    if (steps <= 1 || Math.abs(to - from) < 0.01) {
      el.volume = to;
      if (then) then();
      return;
    }
    A.fadeTimers[which] = setInterval(function() {
      i++;
      var v = from + (to - from) * (i / steps);
      el.volume = Math.max(0, Math.min(1, v));
      if (i >= steps) {
        clearFade(which);
        el.volume = to;
        if (then) then();
      }
    }, 80);
  }
  function itemAt(which, i) {
    var l = A.list[which];
    return i >= 0 && i < l.length ? l[i] : null;
  }
  function playIndex(which, i, opts) {
    var it = itemAt(which, i);
    if (!it) return false;
    var el = ensureEl(which);
    if (!el) return false;
    ensureGraph();
    if (A.ctx && A.ctx.state === "suspended" && A.ctx.resume) {
      try {
        A.ctx.resume();
      } catch (e) {
      }
    }
    A.idx[which] = i;
    el.src = it.url;
    el.volume = 0;
    try {
      el.currentTime = 0;
    } catch (e) {
    }
    var p = el.play();
    if (p && p.catch) p.catch(function() {
      emit();
    });
    var cfg = read();
    var target = volOf(cfg, which);
    fade(which, target, opts && opts.fadeMs != null ? opts.fadeMs : 1500);
    A.active = which;
    applyGain();
    emit();
    return true;
  }
  function onEnded(which) {
    var cfg = read();
    if (cfg.mode === "one") {
      playIndex(which, A.idx[which], { fadeMs: 0 });
      return;
    }
    var ni = nextIndex(cfg.mode, A.idx[which], A.list[which].length, null, which);
    if (ni < 0) {
      stop(which);
      return;
    }
    playIndex(which, ni, { fadeMs: 120 });
  }
  function stop(which, ms) {
    var w = which || A.active;
    if (!w) return;
    var el = A[w];
    if (!el) return;
    var done = function() {
      try {
        el.pause();
        el.removeAttribute("src");
        el.load();
      } catch (e) {
      }
    };
    if (ms === 0) {
      done();
    } else {
      fade(w, 0, ms == null ? 800 : ms, done);
    }
    A.active = A.active === w ? "" : A.active;
    emit();
  }
  function pause(which) {
    var w = which || A.active;
    if (!w || !A[w]) return;
    try {
      A[w].pause();
    } catch (e) {
    }
    emit();
  }
  function resume(which) {
    var w = which || A.active;
    if (!w || !A[w]) return;
    ensureGraph();
    if (A.ctx && A.ctx.state === "suspended" && A.ctx.resume) {
      try {
        A.ctx.resume();
      } catch (e) {
      }
    }
    var p = A[w].play();
    if (p && p.catch) p.catch(function() {
    });
    emit();
  }
  function toggle(which) {
    var w = chan(which || A.active || "lofi");
    rememberTab(w);
    var el = A[w];
    if (!el || !el.src) {
      return start(w);
    }
    if (el.paused) resume(w);
    else pause(w);
    return true;
  }
  function start(which, opts) {
    var w = chan(which);
    if (!A.list[w].length) {
      emit();
      return false;
    }
    if (A.active && A.active !== w) pause(A.active);
    var i0 = A.idx[w] >= 0 ? A.idx[w] : nextIndex(read().mode, -1, A.list[w].length, null, w);
    if (playIndex(w, i0, opts)) return true;
    resetBag(w);
    var i1 = nextIndex(read().mode, -1, A.list[w].length, null, w);
    return playIndex(w, i1, opts);
  }
  var DB_NAME = "tsumu-pomo-audio", DB_STORE = "handles", DB_KEY = "customDir";
  var AUDIO_RE = /\.(mp3|m4a|m4b|aac|flac|wav|ogg|oga|opus|weba)$/i;
  var MAX_DEPTH = 6, MAX_FILES = 2e3;
  function withDb(cb) {
    return new Promise(function(resolve) {
      var req;
      try {
        req = global.indexedDB.open(DB_NAME, 1);
      } catch (e) {
        resolve(null);
        return;
      }
      req.onupgradeneeded = function() {
        var db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      req.onsuccess = function() {
        resolve(req.result);
      };
      req.onerror = function() {
        resolve(null);
      };
    }).then(function(db) {
      if (!db) return null;
      return new Promise(function(resolve) {
        try {
          var tx = db.transaction(DB_STORE, cb.write ? "readwrite" : "readonly");
          var out = cb.run(tx.objectStore(DB_STORE));
          tx.oncomplete = function() {
            resolve(out && out.result !== void 0 ? out.result : null);
          };
          tx.onerror = function() {
            resolve(null);
          };
          tx.onabort = function() {
            resolve(null);
          };
        } catch (e) {
          resolve(null);
        }
      });
    });
  }
  function dbGet(key) {
    return withDb({ write: false, run: function(st) {
      return st.get(key);
    } });
  }
  function dbPut(key, val) {
    return withDb({ write: true, run: function(st) {
      st.put(val, key);
      return null;
    } });
  }
  function revokeCustomUrls() {
    (A.customUrl || []).forEach(function(u) {
      try {
        global.URL.revokeObjectURL(u);
      } catch (e) {
      }
    });
    A.customUrl = [];
  }
  function setCustomList(list, label) {
    revokeCustomUrls();
    A.list.custom = list || [];
    A.customLabel = label || "";
    A.customUrl = A.list.custom.map(function(e) {
      return e.url;
    }).filter(Boolean);
    resetBag();
    emit();
  }
  function readCustomDir(dir) {
    var out = [], count = 0;
    function walk(d, rel, depth) {
      var it = d.entries ? d.entries() : null;
      if (!it || !it.next || depth > MAX_DEPTH) return Promise.resolve();
      function step() {
        if (count >= MAX_FILES) return Promise.resolve();
        return it.next().then(function(r) {
          if (r.done) return;
          var name = r.value[0], h = r.value[1];
          if (h && h.kind === "directory") return walk(h, rel ? rel + "/" + name : name, depth + 1).then(step);
          if (!h || h.kind !== "file" || !AUDIO_RE.test(name)) return step();
          count++;
          return h.getFile().then(function(f) {
            var u = global.URL && global.URL.createObjectURL ? global.URL.createObjectURL(f) : "";
            out.push({ name, url: u, dur: 0, dir: rel });
            return step();
          }, function() {
            return step();
          });
        }, function() {
          return;
        });
      }
      return step();
    }
    return walk(dir, "", 0).then(function() {
      out.sort(function(a, b) {
        return String(a.name).localeCompare(String(b.name));
      });
      return out;
    });
  }
  function pickCustomFolder() {
    if (!global.showDirectoryPicker) return Promise.resolve({ cancelled: true, unsupported: true });
    var opt = { id: "tsumu-pomo-audio", mode: "read" };
    try {
      if (A.customDir) opt.startIn = A.customDir;
    } catch (e) {
    }
    return global.showDirectoryPicker(opt).then(function(dir) {
      return readCustomDir(dir).then(function(list) {
        A.customDir = dir;
        dbPut(DB_KEY, dir);
        setCustomList(list, dir.name || "");
        return { count: list.length, label: dir.name || "", persistent: true };
      });
    }).catch(function(e) {
      if (e && e.name === "AbortError") return { cancelled: true };
      return { cancelled: true, error: String(e && e.message || e) };
    });
  }
  function restoreCustomFolder(ask) {
    return dbGet(DB_KEY).then(function(h) {
      if (!h) return "none";
      if (!h.queryPermission) {
        return readCustomDir(h).then(function(list) {
          A.customDir = h;
          setCustomList(list, h.name || "");
          return "ok";
        }).catch(function() {
          return "none";
        });
      }
      var opts = { mode: "read" };
      function after(state) {
        if (state === "granted") {
          return readCustomDir(h).then(function(list) {
            A.customDir = h;
            setCustomList(list, h.name || "");
            return "ok";
          });
        }
        if (ask && h.requestPermission) {
          return h.requestPermission(opts).then(function(st2) {
            if (st2 !== "granted") return "prompt";
            return readCustomDir(h).then(function(list) {
              A.customDir = h;
              setCustomList(list, h.name || "");
              return "ok";
            });
          });
        }
        return "prompt";
      }
      var q = h.queryPermission(opts);
      return q && q.then ? q.then(after, function() {
        return "none";
      }) : after("none");
    }).catch(function() {
      return "none";
    });
  }
  var PomoAudio = {
    KEY,

    setBuiltin: function(lofi, amb) {
      A.list.lofi = (lofi || []).slice();
      A.list.amb = (amb || []).slice();
      resetBag();
      emit();
    },
    setFolderFiles: function(which, files) {
      var w = chan(which);
      if (w === "custom") {
        revokeCustomUrls();
      }
      A.list[w] = (files || []).map(function(f) {
        var u = global.URL && global.URL.createObjectURL ? global.URL.createObjectURL(f) : "";
        if (w === "custom" && u) A.customUrl.push(u);
        return { name: f.name || "track", url: u, dur: 0 };
      });
      resetBag();
      emit();
    },
    list: function(which) {
      return A.list[chan(which)].slice();
    },
    active: function() {
      return { which: A.active, index: A.active ? A.idx[A.active] : -1, playing: !!(A.active && A[A.active] && !A[A.active].paused) };
    },
    cfg: read,
    set: function(patch) {
      var c = read(), p = patch || {};
      if (p.volLofi != null) c.volLofi = clamp01(p.volLofi, c.volLofi);
      if (p.volAmb != null) c.volAmb = clamp01(p.volAmb, c.volAmb);
      if (p.volCustom != null) c.volCustom = clamp01(p.volCustom, c.volCustom);
      if (p.gainDb != null) c.gainDb = clampDb(p.gainDb, c.gainDb);
      if (p.mode != null) c.mode = p.mode === "seq" || p.mode === "shuffle" ? p.mode : "one";
      if (p.follow != null) c.follow = !!p.follow;
      if (p.tab != null) c.tab = p.tab === "amb" || p.tab === "custom" ? p.tab : "lofi";
      write(c);
      applyGain();
      return c;
    },
    start,
    pause,
    resume,
    toggle,
    stop,

    playAt: function(which, i) {
      var w = chan(which);
      rememberTab(w);
      if (A.active && A.active !== w) pause(A.active);
      return playIndex(w, Number(i) || 0, { fadeMs: 200 });
    },
    next: function(which) {
      var w = chan(which || A.active || "lofi");
      rememberTab(w);
      var ni = nextIndex(read().mode, A.idx[w], A.list[w].length, null, w);
      return ni < 0 ? false : playIndex(w, ni, { fadeMs: 120 });
    },
    prev: function(which) {
      var w = chan(which || A.active || "lofi");
      rememberTab(w);
      var n = A.list[w].length;
      if (!n) return false;
      var pi = (A.idx[w] - 1 + n) % n;
      return playIndex(w, pi, { fadeMs: 120 });
    },

    duck: function(on) {
      var want = !!on;
      if (want === A.ducked) return;
      A.ducked = want;
      applyGain();
    },

    notifySessionStart: function() {
      if (typeof A.hooks.onMainPlayerShouldPause === "function") {
        try {
          A.hooks.onMainPlayerShouldPause();
        } catch (e) {
        }
      }
    },

    yieldToMainPlayer: function() {
      if (A.active) pause(A.active);
    },
    onMainPlayerShouldPause: function(fn) {
      A.hooks.onMainPlayerShouldPause = typeof fn === "function" ? fn : null;
    },
    onChange: function(fn) {
      if (typeof fn !== "function") return function() {
      };
      listeners.push(fn);
      return function() {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },

    teardown: function() {
      clearFade();
      ["lofi", "amb", "custom"].forEach(function(w) {
        var el = A[w];
        if (el) {
          try {
            el.pause();
            el.removeAttribute("src");
          } catch (e) {
          }
        }
      });
      A.active = "";
      A.idx = { lofi: -1, amb: -1, custom: -1 };
      emit();
    },

    pickCustom: pickCustomFolder,
    restoreCustom: restoreCustomFolder,
    customLabel: function() {
      return A.customLabel || "";
    },
    customCount: function() {
      return A.list.custom.length;
    },
    hasCustom: function() {
      return A.list.custom.length > 0;
    },

    time: function() {
      var w = A.active || "lofi", el = A[w];
      return {
        which: w,
        cur: el && isFinite(el.currentTime) ? el.currentTime : 0,
        dur: el && isFinite(el.duration) ? el.duration : 0,
        playing: !!(el && !el.paused)
      };
    },

    onTick: function(fn) {
      A.onTick = typeof fn === "function" ? fn : null;
      return !!A.onTick;
    },

    seek: function(fraction) {
      var w = A.active || "lofi", el = A[w];
      if (!el) return false;
      var d = el.duration;
      if (!isFinite(d) || d <= 0) return false;
      var f = Math.max(0, Math.min(1, Number(fraction) || 0));
      try {
        el.currentTime = d * f;
      } catch (e) {
        return false;
      }
      if (typeof A.onTick === "function") {
        try {
          A.onTick();
        } catch (e) {
        }
      }
      return true;
    },

    _useDirHandleForTest: function(h, persist) {
      return readCustomDir(h).then(function(list) {
        A.customDir = h;
        if (persist) dbPut(DB_KEY, h);
        setCustomList(list, h.name || "");
        return list.length;
      });
    },
    _customHandle: function() {
      return A.customDir || null;
    },

    _pure: { nextIndex, dbToGain, resetBag },
    _raw: A
  };
  global.PomoAudio = PomoAudio;
})(typeof window !== "undefined" ? window : globalThis);
