(function(global) {
  "use strict";
  var DB = "tsumu_voice";
  var STORE = "clips";
  var _db = null;
  var _total = -1;
  var _protected = null;
  function setProtected(fn) {
    _protected = typeof fn === "function" ? fn : null;
  }
  function isProtected(key) {
    if (!_protected) return false;
    try {
      return !!_protected(String(key));
    } catch (e) {
      return false;
    }
  }
  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function(res, rej) {
      var req;
      try {
        req = indexedDB.open(DB, 1);
      } catch (e) {
        rej(e);
        return;
      }
      req.onupgradeneeded = function() {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var os = db.createObjectStore(STORE, { keyPath: "key" });
          os.createIndex("at", "at", { unique: false });
        }
      };
      req.onsuccess = function() {
        _db = req.result;
        res(_db);
      };
      req.onerror = function() {
        rej(req.error);
      };
    });
  }
  function tx(mode) {
    return open().then(function(db) {
      return db.transaction(STORE, mode).objectStore(STORE);
    });
  }
  function limitBytes() {
    var mb = 200;
    try {
      mb = Number(Config.section("app").voiceKeepMB);
    } catch (e) {
    }
    if (!(mb >= 0)) mb = 200;
    return mb === 0 ? Infinity : mb * 1048576;
  }
  function recount() {
    return tx("readonly").then(function(os) {
      return new Promise(function(res) {
        var sum = 0;
        var cur = os.openCursor();
        cur.onsuccess = function() {
          var c = cur.result;
          if (!c) {
            _total = sum;
            res(sum);
            return;
          }
          sum += Number(c.value.size) || 0;
          c.continue();
        };
        cur.onerror = function() {
          _total = 0;
          res(0);
        };
      });
    }).catch(function() {
      _total = 0;
      return 0;
    });
  }
  function total() {
    if (_total >= 0) return Promise.resolve(_total);
    return recount();
  }
  function entries() {
    return tx("readonly").then(function(os) {
      return new Promise(function(res) {
        var out = [];
        var cur = os.openCursor();
        cur.onsuccess = function() {
          var c = cur.result;
          if (!c) {
            res(out);
            return;
          }
          out.push(c.value);
          c.continue();
        };
        cur.onerror = function() {
          res(out);
        };
      });
    }).catch(function() {
      return [];
    });
  }
  function dropKeys(keys) {
    if (!keys.length) return Promise.resolve(0);
    return tx("readwrite").then(function(os) {
      return new Promise(function(res) {
        var freed = 0;
        keys.forEach(function(k) {
          var g = os.get(k);
          g.onsuccess = function() {
            if (g.result) freed += Number(g.result.size) || 0;
            os.delete(k);
          };
        });
        os.transaction.oncomplete = function() {
          if (_total >= 0) _total = Math.max(0, _total - freed);
          res(freed);
        };
        os.transaction.onerror = function() {
          res(0);
        };
      });
    });
  }
  function put(key, blob) {
    if (!key || !blob || !blob.size) return Promise.resolve(false);
    var lim = limitBytes();
    if (lim !== Infinity && blob.size > lim) return Promise.resolve(false);
    return tx("readwrite").then(function(os) {
      return new Promise(function(res) {
        var rec = { key: String(key), blob, size: blob.size, at: Number(key) || Date.now() };
        var p = os.put(rec);
        p.onsuccess = function() {
          if (_total >= 0) _total += rec.size;
          res(true);
        };
        p.onerror = function() {
          res(false);
        };
      });
    }).then(function(ok) {
      if (!ok) return false;
      return trim(lim).then(function() {
        return true;
      });
    }).catch(function() {
      return false;
    });
  }
  function trim(lim) {
    lim = lim || limitBytes();
    if (lim === Infinity) return Promise.resolve(0);
    return total().then(function(sum) {
      if (sum <= lim) return 0;
      return entries().then(function(list) {
        list.sort(function(a, b) {
          return (a.at || 0) - (b.at || 0);
        });
        var drop = [], need = sum - lim, i = 0;
        while (i < list.length && need > 0) {
          if (!isProtected(list[i].key)) {
            drop.push(list[i].key);
            need -= Number(list[i].size) || 0;
          }
          i++;
        }
        return dropKeys(drop).then(function(freed) {
          return recount().then(function() {
            return freed;
          });
        });
      });
    });
  }
  function get(key) {
    if (!key) return Promise.resolve(null);
    return tx("readonly").then(function(os) {
      return new Promise(function(res) {
        var g = os.get(String(key));
        g.onsuccess = function() {
          var r = g.result;
          if (!r) {
            res(null);
            return;
          }
          if (typeof Blob !== "undefined" && r instanceof Blob) {
            res(r);
            return;
          }
          if (r.blob) {
            res(r.blob);
            return;
          }
          res(null);
        };
        g.onerror = function() {
          res(null);
        };
      });
    }).catch(function() {
      return null;
    });
  }
  function clear() {
    return tx("readwrite").then(function(os) {
      return new Promise(function(res) {
        var c = os.clear();
        c.onsuccess = function() {
          _total = 0;
          res(true);
        };
        c.onerror = function() {
          res(false);
        };
      });
    }).catch(function() {
      return false;
    });
  }
  global.VoiceCache = {
    put,
    get,
    clear,
    total,
    recount,
    trim: function() {
      return trim();
    },
    limitBytes,
    setProtected,
    isProtected,
    _entries: entries
  };
})(typeof window !== "undefined" ? window : globalThis);
