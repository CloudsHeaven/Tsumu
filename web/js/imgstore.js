(function(global) {
  "use strict";
  var DB = "tsumu_image";
  var STORE = "images";
  var _db = null;
  var _total = -1;
  var _protected = null;
  var MAX_EDGE = 1024;
  var QUALITY = 0.75;
  function setProtected(fn) {
    _protected = typeof fn === "function" ? fn : null;
  }
  function isProtected(id) {
    if (!_protected) return false;
    try {
      return !!_protected(String(id));
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
      var v = Config.section("app").imageKeepMB;
      if (v !== void 0 && v !== null) mb = Number(v);
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
        keys.forEach(function(k) {
          os.delete(k);
        });
        os.transaction.oncomplete = function() {
          _total = -1;
          res(keys.length);
        };
        os.transaction.onerror = function() {
          res(0);
        };
      });
    }).catch(function() {
      return 0;
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
        return dropKeys(drop).then(function(n) {
          return recount().then(function() {
            return n;
          });
        });
      });
    });
  }
  function put(key, blob) {
    if (!key || !blob || !blob.size) return Promise.resolve(false);
    var lim = limitBytes();
    if (lim !== Infinity && blob.size > lim) return Promise.resolve(false);
    return tx("readwrite").then(function(os) {
      return new Promise(function(res) {
        var rec = { key: String(key), blob, size: blob.size, at: Date.now() };
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
  function get(key) {
    if (!key) return Promise.resolve(null);
    return tx("readonly").then(function(os) {
      return new Promise(function(res) {
        var g = os.get(String(key));
        g.onsuccess = function() {
          res(g.result || null);
        };
        g.onerror = function() {
          res(null);
        };
      });
    }).catch(function() {
      return null;
    });
  }
  function url(key) {
    return get(key).then(function(rec) {
      if (!rec || !rec.blob) return null;
      try {
        return URL.createObjectURL(rec.blob);
      } catch (e) {
        return null;
      }
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
  function compress(file) {
    if (!file) return Promise.resolve(null);
    var maxEdge = MAX_EDGE, q = QUALITY;
    return decode(file).then(function(src) {
      var w = src.width, h = src.height;
      if (!w || !h) return null;
      var k = Math.min(1, maxEdge / Math.max(w, h));
      var tw = Math.max(1, Math.round(w * k)), th = Math.max(1, Math.round(h * k));
      var cv = document.createElement("canvas");
      cv.width = tw;
      cv.height = th;
      var ctx = cv.getContext("2d");
      ctx.drawImage(src, 0, 0, tw, th);
      if (src.close) {
        try {
          src.close();
        } catch (e) {
        }
      }
      var dataUrl = cv.toDataURL("image/jpeg", q);
      return { dataUrl, size: Math.round(dataUrl.length * 0.75), w: tw, h: th };
    }).catch(function() {
      return null;
    });
  }
  function decode(file) {
    if (global.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: "from-image" }).catch(function() {
        return createImageBitmap(file);
      });
    }
    return new Promise(function(res, rej) {
      var fr = new FileReader();
      fr.onload = function() {
        var im = new Image();
        im.onload = function() {
          res(im);
        };
        im.onerror = rej;
        im.src = fr.result;
      };
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
  }
  function dataUrlToBlob(dataUrl) {
    try {
      var parts = String(dataUrl).split(",");
      if (parts.length < 2) return null;
      var mime = (parts[0].match(/data:([^;]+)/) || [])[1] || "image/jpeg";
      var bin = atob(parts[1]);
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return new Blob([arr], { type: mime });
    } catch (e) {
      return null;
    }
  }
  global.ImgStore = {
    compress,
    dataUrlToBlob,
    put,
    get,
    url,
    clear,
    total,
    recount,
    trim: function() {
      return trim();
    },
    limitBytes,
    setProtected,
    isProtected,
    remove: function(key) {
      return dropKeys([key]);
    },
    removeMany: dropKeys,
    _entries: entries,
    _MAX_EDGE: MAX_EDGE,
    _QUALITY: QUALITY
  };
})(typeof window !== "undefined" ? window : globalThis);
