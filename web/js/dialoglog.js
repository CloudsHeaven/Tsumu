(function(global) {
  "use strict";
  var KEY = "tsumu.dialog.v1";
  var MAX = 400;
  var TEXT_MAX = 4e3;
  var state = { v: 1, cards: [] };
  function clip(s) {
    return String(s == null ? "" : s).replace(/\s+$/, "").slice(0, TEXT_MAX);
  }
  function uid() {
    return "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function valid(c) {
    return c && typeof c === "object" && c.id && (c.user || c.reply);
  }
  function put(key, val) {
    if (global.SafeStore && global.SafeStore.set) return global.SafeStore.set(key, val);
    try {
      global.localStorage.setItem(key, val);
      return true;
    } catch (e) {
      return false;
    }
  }
  function persist() {
    put(KEY, JSON.stringify(state));
  }
  function load() {
    try {
      var raw = global.localStorage.getItem(KEY);
      var j = raw ? JSON.parse(raw) : null;
      if (j && j.v === 1 && Array.isArray(j.cards)) {
        state = { v: 1, cards: j.cards.filter(valid) };
        return;
      }
    } catch (e) {
    }
    state = { v: 1, cards: [] };
  }
  function trim() {
    if (state.cards.length <= MAX) return 0;
    var dropped = 0;
    while (state.cards.length > MAX) {
      var i = -1, k;
      for (k = 0; k < state.cards.length; k++) if (!state.cards[k].fav) {
        i = k;
        break;
      }
      if (i < 0) i = 0;
      state.cards.splice(i, 1);
      dropped++;
    }
    return dropped;
  }
  function find(id) {
    for (var i = 0; i < state.cards.length; i++) if (state.cards[i].id === id) return state.cards[i];
    return null;
  }
  var DialogLog = {
    KEY,
    MAX,
    load,
    save: persist,

    add: function(user, reply, spoken, raw) {
      try {
        var u = clip(user), r = clip(reply), sp = clip(spoken), rw = clip(raw);
        if (!u && !r) return null;
        var c = { id: uid(), at: Date.now(), user: u, reply: r, spoken: sp, raw: rw, clip: null, img: null, fav: false };
        state.cards.push(c);
        trim();
        persist();
        return c;
      } catch (e) {
        return null;
      }
    },

    setClip: function(id, key) {
      var c = find(id);
      if (!c) return false;
      c.clip = key || null;
      persist();
      return true;
    },

    setImg: function(id, key) {
      var c = find(id);
      if (!c) return false;
      c.img = key || null;
      persist();
      return true;
    },
    toggleFav: function(id) {
      var c = find(id);
      if (!c) return null;
      c.fav = !c.fav;
      persist();
      return c.fav;
    },
    remove: function(id) {
      var n = state.cards.length;
      state.cards = state.cards.filter(function(c) {
        return c.id !== id;
      });
      if (state.cards.length === n) return false;
      persist();
      return true;
    },

    clear: function() {
      state.cards = [];
      persist();
    },
    get: function(id) {
      return find(id);
    },
    count: function() {
      return state.cards.length;
    },
    favCount: function() {
      return state.cards.filter(function(c) {
        return c.fav;
      }).length;
    },

    list: function(opts) {
      opts = opts || {};
      var q = String(opts.q || "").trim().toLowerCase();
      var out = state.cards.slice().reverse();
      if (opts.favOnly) out = out.filter(function(c) {
        return c.fav;
      });
      if (q) {
        out = out.filter(function(c) {
          return (c.user || "").toLowerCase().indexOf(q) >= 0 || (c.reply || "").toLowerCase().indexOf(q) >= 0 || (c.spoken || "").toLowerCase().indexOf(q) >= 0;
        });
      }
      return out;
    },

    snapshot: function() {
      return JSON.parse(JSON.stringify(state));
    },
    restore: function(snap) {
      if (!snap || !Array.isArray(snap.cards)) {
        state = { v: 1, cards: [] };
        persist();
        return false;
      }
      state = { v: 1, cards: snap.cards.filter(valid) };
      trim();
      persist();
      return true;
    }
  };
  load();
  global.DialogLog = DialogLog;
})(typeof window !== "undefined" ? window : globalThis);
