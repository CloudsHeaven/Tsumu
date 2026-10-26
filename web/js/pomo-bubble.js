(function(global) {
  "use strict";
  var KEY = "tsumu.pomobubble.v1";
  var COOLDOWN_MS = 3 * 24 * 3600 * 1e3;
  var MAX_SHOWN_MEM = 400;
  var SPAWN_MS = 8e3;
  var MAX_ALIVE = 3;
  function read() {
    try {
      var o = JSON.parse(global.localStorage.getItem(KEY) || "");
      if (o && typeof o === "object") {
        return {
          v: 1,
          enabled: o.enabled !== false,
          blur: o.blur !== false,

          shown: o.shown && typeof o.shown === "object" ? o.shown : {}
        };
      }
    } catch (e) {
    }
    return { v: 1, enabled: true, blur: true, shown: {} };
  }
  function write(doc) {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(doc));
    } catch (e) {
    }
  }
  var TEXT_KEYS = ["text", "summary", "memo", "content", "said", "line", "note", "value"];
  function entryText(e) {
    if (e == null) return "";
    if (typeof e === "string") return clean(e);
    for (var i = 0; i < TEXT_KEYS.length; i++) {
      var v = e[TEXT_KEYS[i]];
      if (typeof v === "string" && v.trim()) return clean(v);
    }
    var out = [];
    for (var k in e) {
      if (!Object.prototype.hasOwnProperty.call(e, k)) continue;
      if (k === "date" || k === "said_at" || k === "kind" || k === "id" || k === "importance") continue;
      var s = e[k];
      if (typeof s === "string" && s.trim().length > 1) out.push(s.trim());
    }
    return clean(out.join(" · "));
  }
  function clean(s) {
    return String(s || "").replace(/^\s*\d{4}-\d{2}-\d{2}[T ]?[\d:]*\s*[·|,，-]?\s*/, "").replace(/\s+/g, " ").trim();
  }
  function entryKey(e, i) {
    if (e && typeof e === "object") {
      if (e.id) return "i:" + e.id;
      var d = e.date || e.said_at || "";
      var t = entryText(e).slice(0, 60);
      if (d || t) return "d:" + d + "|" + t;
    }
    return "x:" + i + "|" + clean(typeof e === "string" ? e : "").slice(0, 60);
  }
  var bag = [];
  function resetBag() {
    bag.length = 0;
  }
  function refillBag(total, rand) {
    resetBag();
    for (var i = 0; i < total; i++) bag.push(i);
    for (var j = bag.length - 1; j > 0; j--) {
      var k = Math.floor(rand() * (j + 1)), t = bag[j];
      bag[j] = bag[k];
      bag[k] = t;
    }
  }
  function choose(entries, shown, now, rand) {
    var n = (entries || []).length;
    if (!n) return null;
    var r = typeof rand === "function" ? rand : Math.random;
    var sinceFill = 0;
    while (true) {
      if (!bag.length) {
        refillBag(n, r);
        sinceFill = 0;
      }
      var idx = bag.pop();
      sinceFill++;
      var e = entries[idx], k = entryKey(e, idx), t = entryText(e);
      if (!t || t.length < 2) {
        if (sinceFill >= n) break;
        continue;
      }
      var last = Number(shown ? shown[k] : 0) || 0;
      if (!last || now - last >= COOLDOWN_MS) return { index: idx, key: k, text: t };
      if (sinceFill >= n) break;
    }
    if (shown) {
      for (var kk in shown) {
        if (Object.prototype.hasOwnProperty.call(shown, kk)) delete shown[kk];
      }
    }
    refillBag(n, r);
    for (var t2 = 0; t2 < n; t2++) {
      var idx2 = bag.pop();
      var e2 = entries[idx2], k2 = entryKey(e2, idx2), txt = entryText(e2);
      if (!txt || txt.length < 2) continue;
      return { index: idx2, key: k2, text: txt };
    }
    return null;
  }
  function pruneShown(shown) {
    var keys = Object.keys(shown || {});
    if (keys.length <= MAX_SHOWN_MEM) return shown;
    keys.sort(function(a, b) {
      return (shown[a] || 0) - (shown[b] || 0);
    });
    var drop = keys.length - MAX_SHOWN_MEM;
    for (var i = 0; i < drop; i++) delete shown[keys[i]];
    return shown;
  }
  function tease(entry) {
    var e = entry || {};
    var d = String(e.date || e.said_at || "").slice(0, 10);
    var k = String(e.kind || e.type || "").trim();
    return d || k ? d + (k ? " · " + k : "") : "一段回忆";
  }
  var S = {
    alive: [],

    nextAt: 0,

    enabled: true,
    blur: true,
    paused: false,

    entries: []
  };
  var PomoBubble = {
    KEY,
    SPAWN_MS,
    MAX_ALIVE,
    cfg: read,
    set: function(patch) {
      var d = read(), p = patch || {};
      if (p.enabled != null) d.enabled = !!p.enabled;
      if (p.blur != null) d.blur = !!p.blur;
      write(d);
      S.enabled = d.enabled;
      S.blur = d.blur;
      return d;
    },
    enabled: function() {
      return S.enabled;
    },
    setEnabled: function(on) {
      S.enabled = !!on;
      if (!S.enabled) S.alive = [];
    },
    setPaused: function(on) {
      S.paused = !!on;
    },
    isPaused: function() {
      return S.paused;
    },
    alive: function() {
      return S.alive.slice();
    },
    count: function() {
      return S.alive.length;
    },

    setEntries: function(arr) {
      S.entries = Array.isArray(arr) ? arr : [];
      resetBag();
    },
    entriesCount: function() {
      return S.entries.length;
    },

    tick: function(now, opts) {
      var t = Number(now) || Date.now();
      var o = opts || {};
      var ttl = Number(o.ttl) || 8e3;
      S.alive = S.alive.filter(function(b) {
        return t - b.at < ttl;
      });
      if (S.paused || o.awake) {
        S.alive = [];
        return [];
      }
      if (!S.enabled || !S.entries.length) return [];
      var room = MAX_ALIVE - S.alive.length;
      if (room <= 0) return [];
      var want = 0;
      if (t >= (S.nextAt || 0)) {
        want = 1;
      }
      if (want <= 0) return [];
      var out = [], doc = read();
      for (var i = 0; i < want; i++) {
        var pickd = choose(S.entries, doc.shown, t, o.rand);
        if (!pickd) break;
        doc.shown[pickd.key] = t;
        S.alive.push({ key: pickd.key, text: pickd.text, at: t });
        out.push({ key: pickd.key, text: pickd.text, at: t, tease: tease(S.entries[pickd.index]) });
      }
      if (out.length) {
        pruneShown(doc.shown);
        write(doc);
        S.nextAt = t + SPAWN_MS;
      } else {
        S.nextAt = t + SPAWN_MS;
      }
      return out;
    },

    dropKeys: function(keys) {
      var map = {}, n = 0, i;
      keys = keys || [];
      for (i = 0; i < keys.length; i++) if (keys[i] != null && keys[i] !== "") map[keys[i]] = 1;
      if (!keys.length) return 0;
      S.alive = S.alive.filter(function(b) {
        if (map[b.key]) {
          n++;
          return false;
        }
        return true;
      });
      return n;
    },

    _pure: { choose, resetBag, tease, entryText, pruneShown, COOLDOWN_MS },

    _reset: function() {
      resetBag();
      S.alive = [];
      S.nextAt = 0;
      write({ v: 1, enabled: true, blur: true, shown: {} });
    }
  };
  var d0 = read();
  S.enabled = d0.enabled;
  S.blur = d0.blur;
  global.PomoBubble = PomoBubble;
})(typeof window !== "undefined" ? window : globalThis);
