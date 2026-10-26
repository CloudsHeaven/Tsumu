(function(global) {
  "use strict";
  var KEY = "tsumu.pomo.v1";
  var MODES = ["focus", "short", "long"];
  var listeners = [];
  function blank() {
    return {
      v: 1,
      cfg: { focus: 25, short: 5, long: 15, every: 4, plan: 1 },
      run: { mode: "idle", endAt: 0, total: 0, left: 0, paused: false, idx: 0, bind: "", awayAt: 0 },
      days: {}
    };
  }
  function read() {
    try {
      var o = JSON.parse(global.localStorage.getItem(KEY) || "");
      if (o && o.cfg && o.run) {
        var b = blank();
        b.cfg.focus = num(o.cfg.focus, 25);
        b.cfg.short = num(o.cfg.short, 5);
        b.cfg.long = num(o.cfg.long, 15);
        b.cfg.every = num(o.cfg.every, 4);
        b.cfg.plan = num(o.cfg.plan, 1);
        b.run.mode = MODES.indexOf(o.run.mode) >= 0 ? o.run.mode : "idle";
        b.run.endAt = num(o.run.endAt, 0);
        b.run.total = num(o.run.total, 0);
        b.run.left = num(o.run.left, 0);
        b.run.paused = !!o.run.paused;
        b.run.idx = num(o.run.idx, 0);
        b.run.bind = String(o.run.bind || "");
        b.run.awayAt = num(o.run.awayAt, 0);
        b.days = o.days && typeof o.days === "object" ? o.days : {};
        return b;
      }
    } catch (e) {
    }
    return blank();
  }
  function write(doc) {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(doc));
    } catch (e) {
    }
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i]();
      } catch (e) {
      }
    }
  }
  function num(v, d) {
    var n = Number(v);
    return isFinite(n) && n > 0 ? n : d;
  }
  function clampMin(v, d, lo, hi) {
    var n = Math.round(Number(v));
    if (!isFinite(n)) return d;
    return Math.max(lo, Math.min(hi, n));
  }
  function dayKey(t) {
    var dt = new Date(t == null ? Date.now() : t);
    var m = dt.getMonth() + 1, d = dt.getDate();
    return dt.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (d < 10 ? "0" : "") + d;
  }
  function msOf(cfg, mode) {
    var min = mode === "focus" ? cfg.focus : mode === "long" ? cfg.long : cfg.short;
    return Math.max(1, min) * 6e4;
  }
  var Pomo = {
    KEY,
    MODES,
    onChange: function(fn) {
      if (typeof fn !== "function") return function() {
      };
      listeners.push(fn);
      return function() {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    get: function() {
      return read().cfg;
    },

    set: function(patch) {
      var doc = read(), c = doc.cfg, p = patch || {};
      if (p.focus != null) c.focus = clampMin(p.focus, c.focus, 1, 180);
      if (p.short != null) c.short = clampMin(p.short, c.short, 1, 60);
      if (p.long != null) c.long = clampMin(p.long, c.long, 1, 60);
      if (p.every != null) c.every = clampMin(p.every, c.every, 2, 8);
      if (p.plan != null) c.plan = clampMin(p.plan, c.plan, 1, 12);
      write(doc);
      return c;
    },

    state: function() {
      var doc = read(), r = doc.run, now = Date.now();
      var total = r.total || 0, left = 0, running = false;
      if (r.mode !== "idle") {
        if (r.paused) {
          left = Math.max(0, r.left || 0);
        } else if (r.endAt) {
          left = Math.max(0, r.endAt - now);
          running = left > 0;
        }
      }
      return {
        mode: r.mode,
        running,
        paused: !!r.paused,
        leftMs: left,
        totalMs: total,
        elapsedMs: total ? Math.max(0, total - left) : 0,
        frac: total ? Math.max(0, Math.min(1, (total - left) / total)) : 0,
        idx: r.idx || 0,
        plan: doc.cfg.plan,
        bind: r.bind || "",

        hasNext: (r.idx || 0) < doc.cfg.plan
      };
    },

    start: function(mode, opts) {
      var doc = read(), m = MODES.indexOf(mode) >= 0 ? mode : "focus";
      var o = opts || {};
      doc.run.mode = m;
      doc.run.total = msOf(doc.cfg, m);
      doc.run.left = doc.run.total;
      doc.run.endAt = Date.now() + doc.run.total;
      doc.run.paused = false;
      if (o.resetIdx) doc.run.idx = 0;
      if (m === "focus" && o.bind != null) doc.run.bind = String(o.bind || "");
      write(doc);
      return Pomo.state();
    },
    pause: function() {
      var doc = read(), r = doc.run;
      if (r.mode === "idle" || r.paused) return Pomo.state();
      r.left = Math.max(0, r.endAt - Date.now());
      r.endAt = 0;
      r.paused = true;
      write(doc);
      return Pomo.state();
    },
    resume: function() {
      var doc = read(), r = doc.run;
      if (r.mode === "idle" || !r.paused) return Pomo.state();
      r.endAt = Date.now() + Math.max(0, r.left);
      r.paused = false;
      write(doc);
      return Pomo.state();
    },

    stop: function() {
      var doc = read();
      doc.run.mode = "idle";
      doc.run.endAt = 0;
      doc.run.left = 0;
      doc.run.total = 0;
      doc.run.paused = false;
      doc.run.idx = 0;
      doc.run.bind = "";
      write(doc);
      return Pomo.state();
    },

    tick: function() {
      var doc = read(), r = doc.run;
      if (r.mode === "idle" || r.paused || !r.endAt || r.endAt > Date.now()) return { finished: "", n: 0 };
      var mode = r.mode;
      if (mode === "focus") {
        var k = dayKey();
        var d = doc.days[k] || { n: 0, min: 0 };
        d.n += 1;
        d.min += Math.round((r.total || 0) / 6e4);
        doc.days[k] = d;
        r.idx = (r.idx || 0) + 1;
      }
      var next = null;
      if ((r.idx || 0) < doc.cfg.plan) {
        var long = r.idx % doc.cfg.every === 0;
        next = mode === "focus" ? long ? "long" : "short" : "focus";
      }
      if (next) {
        r.mode = next;
        r.total = msOf(doc.cfg, next);
        r.left = r.total;
        r.endAt = 0;
        r.paused = true;
      } else {
        r.mode = "idle";
        r.endAt = 0;
        r.left = 0;
        r.total = 0;
        r.paused = false;
        r.idx = 0;
        r.bind = "";
      }
      write(doc);
      return { finished: mode, n: (doc.days[dayKey()] || {}).n || 0, next: next || "" };
    },

    reconcile: function() {
      var doc = read(), r = doc.run;
      if (r.mode === "idle" || r.paused || !r.endAt || r.endAt > Date.now()) return false;
      Pomo.tick();
      return true;
    },

    markAway: function() {
      var doc = read(), r = doc.run;
      if (r.mode === "idle" || r.paused || !r.endAt) return false;
      r.awayAt = Date.now();
      write(doc);
      return true;
    },

    clearAway: function() {
      var doc = read();
      if (!doc.run.awayAt) return false;
      doc.run.awayAt = 0;
      write(doc);
      return true;
    },

    reconcileAway: function() {
      var doc = read(), r = doc.run, away = num(r.awayAt, 0);
      if (!away) return 0;
      var gap = Math.max(0, Date.now() - away);
      r.awayAt = 0;
      if (r.mode !== "idle" && !r.paused && r.endAt) r.endAt += gap;
      write(doc);
      return gap;
    },
    stats: function(now) {
      var doc = read(), k = dayKey(now);
      var today = doc.days[k] || { n: 0, min: 0 };
      var n = 0, min = 0, t = now == null ? Date.now() : now;
      for (var i = 0; i < 7; i++) {
        var d = doc.days[dayKey(t - i * 864e5)];
        if (d) {
          n += d.n || 0;
          min += d.min || 0;
        }
      }
      return { today: { n: today.n || 0, min: today.min || 0 }, week: { n, min } };
    },

    _reset: function() {
      write(blank());
    }
  };
  global.Pomo = Pomo;
})(typeof window !== "undefined" ? window : globalThis);
