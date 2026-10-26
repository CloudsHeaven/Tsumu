(function(global) {
  "use strict";
  var KEY = "tsumu.todo.v1";
  var MAX_ITEMS = 300;
  var MAX_TEXT = 120;
  var listeners = [];
  function blank() {
    return { v: 1, items: [] };
  }
  function read() {
    try {
      var o = JSON.parse(global.localStorage.getItem(KEY) || "");
      if (o && Array.isArray(o.items)) return { v: 1, items: o.items.filter(function(x) {
        return x && typeof x === "object";
      }) };
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
  function uid() {
    return "td" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function clampText(s) {
    var t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    return t.length > MAX_TEXT ? t.slice(0, MAX_TEXT) : t;
  }
  var Todo = {

    onChange: function(fn) {
      if (typeof fn !== "function") return function() {
      };
      listeners.push(fn);
      return function() {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },

    list: function() {
      var items = read().items;
      var open = [], done = [], pos = {};
      for (var i = 0; i < items.length; i++) {
        pos[items[i].id] = i;
        (items[i].done ? done : open).push(items[i]);
      }
      open.sort(function(a, b) {
        return (b.at || 0) - (a.at || 0) || (pos[b.id] || 0) - (pos[a.id] || 0);
      });
      done.sort(function(a, b) {
        return (b.doneAt || 0) - (a.doneAt || 0) || (pos[b.id] || 0) - (pos[a.id] || 0);
      });
      return open.concat(done);
    },

    stats: function() {
      var items = read().items, done = 0;
      for (var i = 0; i < items.length; i++) if (items[i].done) done++;
      return { done, open: items.length - done, total: items.length };
    },
    add: function(text) {
      var t = clampText(text);
      if (!t) return null;
      var doc = read();
      if (doc.items.length >= MAX_ITEMS) return null;
      var it = { id: uid(), text: t, done: false, at: Date.now(), doneAt: 0 };
      doc.items.push(it);
      write(doc);
      return it;
    },

    toggle: function(id) {
      var doc = read();
      for (var i = 0; i < doc.items.length; i++) {
        if (doc.items[i].id === id) {
          var it = doc.items[i];
          it.done = !it.done;
          it.doneAt = it.done ? Date.now() : 0;
          write(doc);
          return it;
        }
      }
      return null;
    },
    edit: function(id, text) {
      var t = clampText(text);
      if (!t) return null;
      var doc = read();
      for (var i = 0; i < doc.items.length; i++) {
        if (doc.items[i].id === id) {
          doc.items[i].text = t;
          write(doc);
          return doc.items[i];
        }
      }
      return null;
    },

    remove: function(id) {
      var doc = read();
      for (var i = 0; i < doc.items.length; i++) {
        if (doc.items[i].id === id) {
          var gone = doc.items.splice(i, 1)[0];
          write(doc);
          return { item: gone, index: i };
        }
      }
      return null;
    },

    restore: function(item, index) {
      if (!item || !item.id) return false;
      var doc = read();
      for (var i = 0; i < doc.items.length; i++) if (doc.items[i].id === item.id) return false;
      var at = typeof index === "number" && index >= 0 && index <= doc.items.length ? index : doc.items.length;
      doc.items.splice(at, 0, item);
      write(doc);
      return true;
    },

    snapshot: function() {
      return JSON.parse(JSON.stringify(read()));
    },
    clear: function() {
      write(blank());
    },
    replaceWith: function(doc) {
      if (doc && Array.isArray(doc.items)) write({ v: 1, items: doc.items });
    }
  };
  global.Todo = Todo;
})(typeof window !== "undefined" ? window : globalThis);
