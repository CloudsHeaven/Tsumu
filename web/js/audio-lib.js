(function(global) {
  "use strict";
  var AUDIO_RE = /\.(mp3|m4a|m4b|aac|flac|wav|ogg|oga|opus|weba)$/i;
  var LYRIC_RE = /\.(lrc|vtt)$/i;
  var IMAGE_RE = /\.(jpg|jpeg|png|webp|gif|bmp)$/i;
  var KNOWN_BAD_RE = /\.(ape|dsf|dff|wma|tak|tta|aiff?|alac|mka|ra)$/i;
  var MOUTH_ENV_RE = /\.vocals\.env$/i;
  var DERIVED_RE = /\.(vocals|non_vocals|accompaniment|instrumental)\./i;
  var DB_NAME = "tsumu-audio-lib", DB_STORE = "kv", DB_KEY_OLD = "dirHandle";
  try {
    var _st = typeof navigator !== "undefined" ? navigator.storage : null;
    if (_st && _st.persist) {
      (_st.persisted ? _st.persisted() : Promise.resolve(false)).then(function(yes) {
        if (!yes && _st.persist) {
          try {
            _st.persist();
          } catch (e) {
          }
        }
      }).catch(function() {
      });
    }
  } catch (e) {
  }
  var LIBS = ["asmr", "music"];
  function mkLib() {
    return { dir: null, label: "", entries: [], byId: {}, ids: 0, hasImage: false };
  }
  var _state = { asmr: mkLib(), music: mkLib() };
  var _active = "asmr";
  function L(lib) {
    return _state[lib] || _state[_active];
  }
  function splitId(id) {
    var s = String(id == null ? "" : id), i = s.indexOf(":");
    if (i < 0) return { lib: _active, key: s };
    return { lib: s.slice(0, i), key: s.slice(i + 1) };
  }
  function entryOf(id) {
    var p = splitId(id);
    return L(p.lib).byId[p.key] || null;
  }
  function baseName(n) {
    return String(n).replace(/\.[^.]+$/, "");
  }
  function withDb(cb) {
    return new Promise(function(resolve) {
      var req;
      try {
        req = indexedDB.open(DB_NAME, 1);
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
  function nameScore(base, full, cand) {
    if (cand === base) return 0;
    if (cand === full) return 1;
    if (cand.indexOf(base + ".") === 0) return 2 + (cand.length - base.length);
    if (base.indexOf(cand + ".") === 0) return 20;
    return -1;
  }
  function bestMatch(audioName, audioDir, candidates) {
    var base = baseName(audioName).toLowerCase(), full = String(audioName).toLowerCase();
    var best = null, bestScore = 1e9;
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      var s = nameScore(base, full, baseName(c.name).toLowerCase());
      if (s < 0) continue;
      if (c.dir !== audioDir) s += 50;
      if (s < bestScore) {
        bestScore = s;
        best = c;
      }
    }
    return best;
  }
  var COVER_STRONG = /(cover|folder|front|jacket|package|album|artwork|封面|封面图|包装|表紙|ジャケット|パッケージ)/i;
  function sharedDirs(a, b) {
    var A = String(a || "").split("/"), B = String(b || "").split("/");
    var n = 0;
    while (n < A.length && n < B.length && A[n] === B[n]) n++;
    return n;
  }
  function pickCover(audioName, audioDir, images) {
    var same = [], i;
    for (i = 0; i < images.length; i++) if (images[i].dir === audioDir) same.push(images[i]);
    var byName = bestMatch(audioName, audioDir, same);
    if (byName && baseName(byName.name).toLowerCase() === baseName(audioName).toLowerCase()) return byName;
    for (i = 0; i < same.length; i++) if (COVER_STRONG.test(same[i].name)) return same[i];
    if (same.length === 1) return same[0];
    var cand = [];
    for (i = 0; i < images.length; i++) if (sharedDirs(images[i].dir, audioDir) > 0) cand.push(images[i]);
    if (cand.length) {
      cand.sort(function(x, y) {
        var dx = sharedDirs(x.dir, audioDir), dy = sharedDirs(y.dir, audioDir);
        if (dx !== dy) return dy - dx;
        var sx = COVER_STRONG.test(x.name) ? 0 : 1, sy = COVER_STRONG.test(y.name) ? 0 : 1;
        return sx - sy;
      });
      return cand[0];
    }
    for (i = 0; i < images.length; i++) if (COVER_STRONG.test(images[i].name)) return images[i];
    return images.length === 1 ? images[0] : null;
  }
  function build(list, lib) {
    var st = L(lib);
    st.entries = [];
    st.byId = {};
    st.ids = 0;
    var audio = [], lyrics = [], images = [], envs = [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var name = it.name;
      if (!it.dir) it.dir = "";
      if (MOUTH_ENV_RE.test(name)) envs.push(it);
      else if (DERIVED_RE.test(name)) {
      } else if (LYRIC_RE.test(name)) lyrics.push(it);
      else if (IMAGE_RE.test(name)) images.push(it);
      else if (AUDIO_RE.test(name)) audio.push(it);
      else if (KNOWN_BAD_RE.test(name)) audio.push(it);
    }
    st.hasImage = images.length > 0;
    var envMap = {};
    for (var q = 0; q < envs.length; q++) {
      envMap[envs[q].dir + "\0" + envs[q].name.replace(MOUTH_ENV_RE, "")] = envs[q];
    }
    for (var k = 0; k < audio.length; k++) {
      var a = audio[k];
      var id = (lib || _active) + ":a" + ++st.ids;
      var e = {
        id,
        name: a.name,
        dir: a.dir,
        file: a.file,
        bad: KNOWN_BAD_RE.test(a.name),
        lyricFile: bestMatch(a.name, a.dir, lyrics),
        coverFile: pickCover(a.name, a.dir, images),
        envFile: envMap[a.dir + "\0" + baseName(a.name)] || null,
        _url: null,
        _coverUrl: null,
        _env: void 0
      };
      st.entries.push(e);
      st.byId[id.slice(id.indexOf(":") + 1)] = e;
    }
    st.entries.sort(function(x, y) {
      var d = String(x.dir).localeCompare(String(y.dir), "zh-Hans-CN");
      if (d) return d;
      return String(x.name).localeCompare(String(y.name), "zh-Hans-CN", { numeric: true, sensitivity: "base" });
    });
  }
  var MAX_DEPTH = 4, MAX_FILES = 3e3;
  function readDirHandle(dir) {
    var out = [], count = 0;
    function walk(d, rel, depth) {
      var it = d.entries ? d.entries() : null;
      if (!it || !it.next || depth > MAX_DEPTH) return Promise.resolve();
      function step() {
        if (count >= MAX_FILES) return Promise.resolve();
        return it.next().then(function(r) {
          if (r.done) return;
          var name = r.value[0], h = r.value[1];
          if (h && h.kind === "directory") {
            return walk(h, rel ? rel + "/" + name : name, depth + 1).then(step);
          }
          if (h && h.kind === "file" && (AUDIO_RE.test(name) || LYRIC_RE.test(name) || IMAGE_RE.test(name) || KNOWN_BAD_RE.test(name) || MOUTH_ENV_RE.test(name))) {
            count++;
            return h.getFile().then(
              function(f) {
                out.push({ name, file: f, dir: rel });
                return step();
              },
              function() {
                return step();
              }
            );
          }
          return step();
        });
      }
      return step();
    }
    return walk(dir, "", 0).then(function() {
      return out;
    });
  }
  function pickViaInput() {
    return new Promise(function(resolve) {
      var inp = document.createElement("input");
      inp.type = "file";
      inp.multiple = true;
      inp.setAttribute("webkitdirectory", "");
      inp.setAttribute("directory", "");
      inp.style.cssText = "position:fixed;left:-9999px;top:0;";
      document.body.appendChild(inp);
      var done = false;
      function finish(v) {
        if (done) return;
        done = true;
        try {
          inp.remove();
        } catch (e) {
        }
        resolve(v);
      }
      inp.addEventListener("change", function() {
        var fs = inp.files ? Array.prototype.slice.call(inp.files) : [];
        finish(fs.map(function(f) {
          var rel = f.webkitRelativePath || f.name;
          var parts = rel.split("/");
          return { name: parts[parts.length - 1], file: f, dir: parts.slice(1, -1).join("/") };
        }));
      });
      inp.addEventListener("cancel", function() {
        finish([]);
      });
      inp.click();
    });
  }
  var AudioLib = {

    supported: function() {
      try {
        return typeof document !== "undefined";
      } catch (e) {
        return false;
      }
    },

    setActive: function(lib) {
      if (LIBS.indexOf(lib) >= 0) _active = lib;
      return _active;
    },
    active: function() {
      return _active;
    },
    count: function(lib) {
      return L(lib).entries.length;
    },
    hasFolder: function(lib) {
      return L(lib).entries.length > 0;
    },
    folderName: function(lib) {
      return L(lib).label;
    },

    pick: function(lib) {
      var self = this, L0 = lib || _active;
      if (global.showDirectoryPicker) {
        var opt = { id: "tsumu-audio", mode: "read" };
        if (L(L0).dir) {
          try {
            opt.startIn = L(L0).dir;
          } catch (e) {
          }
        }
        return global.showDirectoryPicker(opt).then(function(dir) {
          return readDirHandle(dir).then(function(list) {
            L(L0).dir = dir;
            L(L0).label = dir.name || L0;
            dbPut("dir:" + L0, dir);
            build(list, L0);
            return { count: L(L0).entries.length, persistent: true, lib: L0 };
          });
        }).catch(function(e) {
          if (e && e.name === "AbortError") return { cancelled: true };
          return self.pickFallback(L0);
        });
      }
      return self.pickFallback(L0);
    },
    pickFallback: function(lib) {
      var L0 = lib || _active;
      return pickViaInput().then(function(list) {
        if (!list.length) return { cancelled: true };
        L(L0).dir = null;
        L(L0).label = (list[0] && list[0].file && list[0].file.webkitRelativePath || "").split("/")[0] || L0;
        build(list, L0);
        return { count: L(L0).entries.length, persistent: false, lib: L0 };
      });
    },

    restore: function(lib, ask) {
      var L0 = lib || _active;
      return dbGet("dir:" + L0).then(function(h) {
        if (!h && L0 === "asmr") {
          return dbGet(DB_KEY_OLD).then(function(old) {
            if (!old) return "none";
            return dbPut("dir:" + L0, old).then(function() {
              return old;
            });
          });
        }
        return h;
      }).then(function(h) {
        if (!h || !h.queryPermission) return "none";
        var opts = { mode: "read" };
        var q = h.queryPermission(opts);
        function after(state) {
          if (state === "granted") {
            return readDirHandle(h).then(function(list) {
              L(L0).dir = h;
              L(L0).label = h.name || L0;
              build(list, L0);
              return "ok";
            });
          }
          if (ask && h.requestPermission) {
            return h.requestPermission(opts).then(function(st2) {
              if (st2 !== "granted") return "none";
              return readDirHandle(h).then(function(list) {
                L(L0).dir = h;
                L(L0).label = h.name || L0;
                build(list, L0);
                return "ok";
              });
            });
          }
          return "prompt";
        }
        return q && q.then ? q.then(after) : after("none");
      }).catch(function() {
        return "none";
      });
    },

    list: function(lib) {
      return L(lib).entries.map(function(e) {
        return {
          id: e.id,
          name: e.name,
          dir: e.dir || "",
          bad: e.bad,
          size: e.file && e.file.size || 0,
          url: AudioLib.url(e.id),
          coverUrl: AudioLib.coverUrl(e.id),

          coverKey: (function() {
            try {
              var f = e.coverFile && e.coverFile.file;
              if (!f) return null;
              return f.name + "|" + f.size + "|" + (f.lastModified || 0);
            } catch (err) {
              return null;
            }
          })(),
          coverName: e.coverFile ? e.coverFile.name : null,
          lyricName: e.lyricFile ? e.lyricFile.name : null
        };
      });
    },

    hasImage: function(lib) {
      return L(lib).hasImage;
    },

    hasEnv: function(id) {
      var e = entryOf(id);
      return !!(e && e.envFile);
    },
    envCount: function(lib) {
      var es = L(lib).entries, n = 0;
      for (var i = 0; i < es.length; i++) if (es[i].envFile) n++;
      return n;
    },
    readEnv: function(id) {
      var e = entryOf(id);
      if (!e || !e.envFile || !e.envFile.file || !e.envFile.file.arrayBuffer) return Promise.resolve(null);
      if (e._env !== void 0) return Promise.resolve(e._env);
      var file = e.envFile.file;
      return file.arrayBuffer().then(function(buf) {
        var parsed = global.TsumuMouthEnv ? global.TsumuMouthEnv.parse(buf) : null;
        e._env = parsed;
        return parsed;
      }).catch(function() {
        e._env = null;
        return null;
      });
    },

    lyricCount: function(lib) {
      var es = L(lib).entries, n = 0;
      for (var i = 0; i < es.length; i++) if (es[i].lyricFile) n++;
      return n;
    },
    url: function(id) {
      var e = entryOf(id);
      if (!e) return null;
      if (!e._url) {
        try {
          e._url = URL.createObjectURL(e.file);
        } catch (err) {
          return null;
        }
      }
      return e._url;
    },
    coverUrl: function(id) {
      var e = entryOf(id);
      if (!e || !e.coverFile || !e.coverFile.file) return null;
      if (!e._coverUrl) {
        try {
          var _f = e.coverFile.file;
          var _k = _f.name + "|" + _f.size + "|" + (_f.lastModified || 0);
          var _sh = AudioLib._coverShared || (AudioLib._coverShared = {});
          if (!_sh[_k]) _sh[_k] = URL.createObjectURL(_f);
          e._coverUrl = _sh[_k];
        } catch (err) {
          return null;
        }
      }
      return e._coverUrl;
    },

    lyricLines: function(id) {
      var e = entryOf(id);
      if (!e || !e.lyricFile) return Promise.resolve(null);
      if (e._lines !== void 0) return Promise.resolve(e._lines);
      var f = e.lyricFile.file;
      var p = f.arrayBuffer ? f.arrayBuffer() : new Response(f).arrayBuffer();
      return p.then(function(buf) {
        try {
          var r = global.Lyrics.parse(buf, f.name);
          e._lines = r.lines && r.lines.length ? r.lines : null;
        } catch (err) {
          e._lines = null;
        }
        return e._lines;
      }).catch(function() {
        e._lines = null;
        return null;
      });
    },

    _loadFiles: function(files, lib) {
      var L0 = lib || _active;
      var list = [];
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        list.push({
          name: f.name,
          file: f.file || f,
          dir: f.dir || ""
        });
      }
      L(L0).dir = null;
      L(L0).label = "test-" + L0;
      build(list, L0);
      return L(L0).entries.length;
    },

    _scanDirForTest: function(dir, label, lib) {
      var L0 = lib || _active;
      return readDirHandle(dir).then(function(list) {
        L(L0).dir = null;
        L(L0).label = label || "test-" + L0;
        build(list, L0);
        return {
          count: L(L0).entries.length,
          lyric: AudioLib.lyricCount(L0),
          image: L(L0).hasImage,
          env: AudioLib.envCount(L0),
          lib: L0
        };
      });
    }
  };
  global.AudioLib = AudioLib;
})(window);
