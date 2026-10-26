"use strict";
(function(global) {
  var D = typeof document !== "undefined";
  var DB_NAME = "tsumu_l2d";
  var DB_VER = 1;
  var STORE_M = "models";
  var STORE_F = "files";
  function normalizeRel(p) {
    return String(p == null ? "" : p).replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "").replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  }
  function joinRel(a, b) {
    var x = normalizeRel(a), y = normalizeRel(b);
    if (!x) return y;
    if (!y) return x;
    return x + "/" + y;
  }
  function newId() {
    var t = ( new Date()).getTime().toString(36);
    var r = Math.floor(Math.random() * 1679616).toString(36);
    return "m" + t + r;
  }
  function safeName(name) {
    var s = String(name == null ? "" : name).replace(/[\\/:*?"<>|]+/g, "_").trim();
    return s || "model";
  }
  function listModelJson(entries) {
    return (entries || []).map(function(e) {
      return normalizeRel(e && (e.rel || e.name));
    }).filter(function(p) {
      return /\.model3\.json$/i.test(p);
    }).sort();
  }
  function hasIDB() {
    try {
      return typeof indexedDB !== "undefined" && !!indexedDB;
    } catch (e) {
      return false;
    }
  }
  var _db = null;
  function openDB() {
    if (_db) return Promise.resolve(_db);
    if (!hasIDB()) return Promise.resolve(null);
    return new Promise(function(resolve) {
      var req;
      try {
        req = indexedDB.open(DB_NAME, DB_VER);
      } catch (e) {
        resolve(null);
        return;
      }
      req.onupgradeneeded = function() {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE_M)) db.createObjectStore(STORE_M, { keyPath: "id" });
        if (!db.objectStoreNames.contains(STORE_F)) db.createObjectStore(STORE_F, { keyPath: "k" });
      };
      req.onsuccess = function() {
        _db = req.result;
        resolve(_db);
      };
      req.onerror = function() {
        resolve(null);
      };
    });
  }
  function tx(db, store, mode) {
    return db.transaction(store, mode).objectStore(store);
  }
  function reqP(req) {
    return new Promise(function(resolve, reject) {
      req.onsuccess = function() {
        resolve(req.result);
      };
      req.onerror = function() {
        reject(req.error);
      };
    });
  }
  function put(store, val) {
    return openDB().then(function(db) {
      if (!db) return false;
      return reqP(tx(db, store, "readwrite").put(val)).then(function() {
        return true;
      });
    });
  }
  function get(store, key) {
    return openDB().then(function(db) {
      if (!db) return null;
      return reqP(tx(db, store, "readonly").get(key));
    });
  }
  function del(store, key) {
    return openDB().then(function(db) {
      if (!db) return false;
      return reqP(tx(db, store, "readwrite").delete(key)).then(function() {
        return true;
      });
    });
  }
  function all(store) {
    return openDB().then(function(db) {
      if (!db) return [];
      return reqP(tx(db, store, "readonly").getAll()).then(function(v) {
        return v || [];
      });
    });
  }
  function fileKey(modelId, rel) {
    return String(modelId) + "\0" + normalizeRel(rel);
  }
  function rangeForModel(modelId) {
    var lo = String(modelId) + "\0";
    var hi = String(modelId) + "\0￿";
    return IDBKeyRange.bound(lo, hi);
  }
  function filesOf(modelId) {
    return openDB().then(function(db) {
      if (!db || typeof IDBKeyRange === "undefined") return [];
      return reqP(tx(db, STORE_F, "readonly").getAll(rangeForModel(modelId))).then(function(v) {
        return v || [];
      });
    });
  }
  function summarize(entries) {
    var files = (entries || []).filter(function(e) {
      return e && e.rel && e.blob;
    });
    var bytes = 0;
    files.forEach(function(e) {
      bytes += e.blob && e.blob.size || 0;
    });
    return { count: files.length, bytes, modelJson: listModelJson(files) };
  }
  async function readDirHandle(dir, prefix, out) {
    out = out || [];
    prefix = prefix || "";
    var handles = [];
    if (dir && typeof dir.values === "function") {
      var it = dir.values();
      if (it && typeof it[Symbol.asyncIterator] === "function") {
        for await (const h of it) handles.push(h);
      } else if (it && typeof it.then === "function") {
        var inner = await it;
        for (; ; ) {
          var r = await inner.next();
          if (!r || r.done) break;
          handles.push(r.value);
        }
      }
    } else if (dir && typeof dir.entries === "function") {
      for await (const h of dir.entries()) handles.push(h);
    }
    var jobs = [];
    for (var i = 0; i < handles.length; i++) {
      (function(h) {
        var rel = joinRel(prefix, h.name);
        if (h.kind === "directory") {
          jobs.push(readDirHandle(h, rel, out));
        } else {
          jobs.push(h.getFile().then(function(f) {
            out.push({ rel, blob: f });
          }).catch(function() {
          }));
        }
      })(handles[i]);
    }
    await Promise.all(jobs);
    return out;
  }
  var _crcTable = null;
  function crcTable() {
    if (_crcTable) return _crcTable;
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
      t[n] = c >>> 0;
    }
    _crcTable = t;
    return t;
  }
  function crc32(bytes) {
    var t = crcTable();
    var c = 4294967295;
    for (var i = 0; i < bytes.length; i++) {
      c = (t[(c ^ bytes[i]) & 255] ^ c >>> 8) >>> 0;
    }
    return (c ^ 4294967295) >>> 0;
  }
  function utf8(s) {
    return new TextEncoder().encode(String(s));
  }
  function dosDateTime(d) {
    d = d ||  new Date();
    var year = d.getFullYear();
    if (year < 1980) year = 1980;
    var time = (d.getHours() & 31) << 11 | (d.getMinutes() & 63) << 5 | Math.floor(d.getSeconds() / 2) & 31;
    var date = (year - 1980 & 127) << 9 | (d.getMonth() + 1 & 15) << 5 | d.getDate() & 31;
    return { time: time & 65535, date: date & 65535 };
  }
  function writeStoreEntry(out, nameBytes, dataBytes, dt) {
    var crc = crc32(dataBytes);
    var size = dataBytes.length;
    var local = new Uint8Array(30 + nameBytes.length);
    var dv = new DataView(local.buffer);
    dv.setUint32(0, 67324752, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 2048, true);
    dv.setUint16(8, 0, true);
    dv.setUint16(10, dt.time, true);
    dv.setUint16(12, dt.date, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, size, true);
    dv.setUint32(22, size, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    out.push(local, dataBytes);
    return { nameBytes, crc, size, offset: -1, dt };
  }
  async function zipEntries(entries, opts) {
    opts = opts || {};
    var out = [];
    var central = [];
    var offset = 0;
    var dt = dosDateTime(opts.date);
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e || !e.rel || !e.blob) continue;
      var rel = normalizeRel(e.rel);
      if (!rel) continue;
      var nameBytes = utf8(rel);
      var buf = e.blob instanceof ArrayBuffer ? e.blob : await e.blob.arrayBuffer();
      var dataBytes = new Uint8Array(buf);
      var rec = writeStoreEntry(out, nameBytes, dataBytes, dt);
      rec.offset = offset;
      offset += 30 + nameBytes.length + dataBytes.length;
      central.push(rec);
    }
    var cdStart = offset;
    var cdSize = 0;
    central.forEach(function(r) {
      cdSize += 46 + r.nameBytes.length;
    });
    var cd = new Uint8Array(cdSize);
    var cdv = new DataView(cd.buffer);
    var p = 0;
    central.forEach(function(r) {
      cdv.setUint32(p, 33639248, true);
      cdv.setUint16(p + 4, 20, true);
      cdv.setUint16(p + 6, 20, true);
      cdv.setUint16(p + 8, 2048, true);
      cdv.setUint16(p + 10, 0, true);
      cdv.setUint16(p + 12, r.dt.time, true);
      cdv.setUint16(p + 14, r.dt.date, true);
      cdv.setUint32(p + 16, r.crc, true);
      cdv.setUint32(p + 20, r.size, true);
      cdv.setUint32(p + 24, r.size, true);
      cdv.setUint16(p + 28, r.nameBytes.length, true);
      cdv.setUint16(p + 30, 0, true);
      cdv.setUint16(p + 32, 0, true);
      cdv.setUint16(p + 34, 0, true);
      cdv.setUint16(p + 36, 0, true);
      cdv.setUint32(p + 38, 0, true);
      cdv.setUint32(p + 42, r.offset, true);
      cd.set(r.nameBytes, p + 46);
      p += 46 + r.nameBytes.length;
    });
    out.push(cd);
    var eocd = new Uint8Array(22);
    var edv = new DataView(eocd.buffer);
    edv.setUint32(0, 101010256, true);
    edv.setUint16(4, 0, true);
    edv.setUint16(6, 0, true);
    edv.setUint16(8, central.length, true);
    edv.setUint16(10, central.length, true);
    edv.setUint32(12, cdSize, true);
    edv.setUint32(16, cdStart, true);
    edv.setUint16(20, 0, true);
    out.push(eocd);
    return new Blob(out, { type: "application/zip" });
  }
  var META_NAME = "__tsumu_meta.json";
  async function exportModel(id) {
    var rec = await getModel(id);
    if (!rec) return null;
    var files = await filesOf(id);
    if (!files.length) return null;
    var entries = files.map(function(f) {
      return { rel: f.rel, blob: f.blob };
    }).filter(function(e) {
      return !!e.rel;
    });
    entries = entries.filter(function(e) {
      return normalizeRel(e.rel) !== META_NAME;
    });
    var meta = {
      format: "tsumu-l2d-v1",
      name: rec.name || "model",
      modelJson: normalizeRel(rec.modelJson),
      candidates: rec.candidates || [],
      mapping: rec.mapping || null,
      exportedAt: ( new Date()).toISOString()
    };
    entries.push({ rel: META_NAME, blob: new Blob([JSON.stringify(meta, null, 2)], { type: "application/json" }) });
    var zip = await zipEntries(entries, { date:  new Date() });
    return { zip, name: safeName(rec.name || "model"), meta, files: entries.length };
  }
  function downloadModel(id) {
    return exportModel(id).then(function(r) {
      if (!r) return false;
      try {
        var url = URL.createObjectURL(r.zip);
        var a = document.createElement("a");
        a.href = url;
        a.download = r.name + ".zip";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function() {
          try {
            URL.revokeObjectURL(url);
          } catch (e) {
          }
        }, 2e4);
        return true;
      } catch (e) {
        return false;
      }
    });
  }
  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === "undefined") throw new Error("NO_DEFLATE");
    var ds = new DecompressionStream("deflate-raw");
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  function decodeZipName(bytes, utf8Flag) {
    var order = utf8Flag ? ["utf-8", "gb18030"] : ["utf-8", "gb18030"];
    for (var i = 0; i < order.length; i++) {
      try {
        return new TextDecoder(order[i], { fatal: true }).decode(bytes);
      } catch (e) {
      }
    }
    try {
      return new TextDecoder("utf-8").decode(bytes);
    } catch (e) {
      return "";
    }
  }
  function findEOCD(buf, dv) {
    var max = Math.min(buf.length, 66e3);
    for (var i = buf.length - 22; i >= 0 && buf.length - i <= max; i--) {
      if (dv.getUint32(i, true) === 101010256) return i;
    }
    return -1;
  }
  async function unzipEntries(fileOrBlob) {
    var buf = new Uint8Array(await fileOrBlob.arrayBuffer());
    if (buf.length < 22) throw new Error("NOT_ZIP");
    var dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    var eocd = findEOCD(buf, dv);
    if (eocd < 0) throw new Error("NOT_ZIP");
    var count = dv.getUint16(eocd + 10, true);
    var cdOff = dv.getUint32(eocd + 16, true);
    if (count > 0 && cdOff >= buf.length) throw new Error("NOT_ZIP");
    var decoder = new TextDecoder("utf-8");
    var out = [];
    var p = cdOff;
    for (var i = 0; i < count; i++) {
      if (p + 46 > buf.length || dv.getUint32(p, true) !== 33639248) break;
      var flags = dv.getUint16(p + 8, true);
      var method = dv.getUint16(p + 10, true);
      var csize = dv.getUint32(p + 20, true);
      var usize = dv.getUint32(p + 24, true);
      var nlen = dv.getUint16(p + 28, true);
      var elen = dv.getUint16(p + 30, true);
      var clen = dv.getUint16(p + 32, true);
      var off = dv.getUint32(p + 42, true);
      var name = decodeZipName(buf.subarray(p + 46, p + 46 + nlen), !!(flags & 2048));
      p += 46 + nlen + elen + clen;
      if (/[\/\\]$/.test(name)) continue;
      var rel = normalizeRel(name);
      if (!rel) continue;
      if (/^__MACOSX\//i.test(rel) || /(^|\/)\.DS_Store$/i.test(rel)) continue;
      if (method !== 0 && method !== 8) {
        var e = new Error("ZIP_METHOD_" + method);
        e.method = method;
        throw e;
      }
      if (off + 30 > buf.length || dv.getUint32(off, true) !== 67324752) throw new Error("BAD_LOCAL_HEADER");
      var lnlen = dv.getUint16(off + 26, true);
      var lelen = dv.getUint16(off + 28, true);
      var ds = off + 30 + lnlen + lelen;
      if (ds + csize > buf.length) throw new Error("TRUNCATED");
      var data = buf.slice(ds, ds + csize);
      if (method === 8) data = await inflateRaw(data);
      out.push({ rel, blob: new Blob([data]) });
    }
    return out;
  }
  async function readZipMeta(fileOrBlob, entries) {
    var list = entries || await unzipEntries(fileOrBlob);
    var hit = list.filter(function(e) {
      return normalizeRel(e.rel) === META_NAME;
    })[0];
    if (!hit) return { meta: null, files: list };
    var txt = await hit.blob.text();
    var meta = null;
    try {
      meta = JSON.parse(txt);
    } catch (e) {
      meta = null;
    }
    if (meta && meta.format !== "tsumu-l2d-v1") meta = null;
    return { meta, files: list.filter(function(e) {
      return normalizeRel(e.rel) !== META_NAME;
    }) };
  }
  async function importFromZip(fileOrBlob, opts) {
    opts = opts || {};
    var entries = await unzipEntries(fileOrBlob);
    if (!entries.length) throw new Error("EMPTY");
    var r = await readZipMeta(fileOrBlob, entries);
    var meta = r.meta || {};
    var o = {
      name: opts.name || meta.name || (fileOrBlob && fileOrBlob.name ? String(fileOrBlob.name).replace(/\.zip$/i, "") : "model"),
      modelJson: opts.modelJson || meta.modelJson || null,
      mapping: opts.mapping || meta.mapping || null
    };
    var rec = await importEntries(r.files, o);
    return rec;
  }
  function importEntries(entries, opts) {
    opts = opts || {};
    var sum = summarize(entries);
    if (!sum.count) return Promise.reject(new Error("EMPTY"));
    if (!sum.modelJson.length) return Promise.reject(new Error("NO_MODEL3"));
    var main = normalizeRel(opts.modelJson || sum.modelJson[0]);
    if (sum.modelJson.indexOf(main) < 0) return Promise.reject(new Error("BAD_MODEL3"));
    var want = safeName(opts.name || "model");
    return listModels().then(function(arr) {
      var same = (arr || []).filter(function(m) {
        return m && !m.builtin && m.name === want && m.bytes === sum.bytes && m.files === sum.count;
      })[0];
      if (same && !opts.id) return same;
      return createRecord();
    });
    function createRecord() {
      var id = opts.id || newId();
      var rec = {
        id,
        name: want,
        modelJson: main,
        candidates: sum.modelJson,
        bytes: sum.bytes,
        files: sum.count,
        importedAt: ( new Date()).toISOString(),
        mapping: opts.mapping || null,

        builtin: false
      };
      return put(STORE_M, rec).then(function() {
        var jobs = entries.filter(function(e) {
          return e && e.rel && e.blob;
        }).map(function(e) {
          return put(STORE_F, { k: fileKey(id, e.rel), modelId: id, rel: normalizeRel(e.rel), blob: e.blob });
        });
        return Promise.all(jobs);
      }).then(function() {
        return rec;
      });
    }
  }
  function importFromDirectory(dirHandle, opts) {
    return readDirHandle(dirHandle, "", []).then(function(flat) {
      opts = opts || {};
      if (opts.name == null && dirHandle && dirHandle.name) opts.name = dirHandle.name;
      return importEntries(flat, opts);
    });
  }
  function listModels() {
    return all(STORE_M).then(function(arr) {
      return arr.sort(function(a, b) {
        return String(b.importedAt).localeCompare(String(a.importedAt));
      });
    });
  }
  function getModel(id) {
    return get(STORE_M, id);
  }
  function usedBytes() {
    return all(STORE_M).then(function(arr) {
      var t = 0;
      arr.forEach(function(m) {
        t += m && m.bytes || 0;
      });
      return t;
    });
  }
  function removeModel(id) {
    return filesOf(id).then(function(fs) {
      return Promise.all(fs.map(function(f) {
        return del(STORE_F, f.k);
      })).then(function() {
        return del(STORE_M, id);
      });
    });
  }
  function renameModel(id, name) {
    return getModel(id).then(function(m) {
      if (!m) return null;
      m.name = safeName(name);
      return put(STORE_M, m).then(function() {
        return m;
      });
    });
  }
  function setMapping(id, mapping) {
    return getModel(id).then(function(m) {
      if (!m) return null;
      m.mapping = mapping || null;
      return put(STORE_M, m).then(function() {
        return m;
      });
    });
  }
  function setModelJson(id, rel) {
    var want = normalizeRel(rel);
    if (!want) return Promise.resolve(null);
    return getModel(id).then(function(m) {
      if (!m) return null;
      var cands = m.candidates && m.candidates.length ? m.candidates : [];
      var allowed = cands.indexOf(want) >= 0;
      var next = function(okv) {
        if (!okv) return null;
        m.modelJson = want;
        return put(STORE_M, m).then(function() {
          return m;
        });
      };
      if (allowed) return next(true);
      return filesOf(id).then(function(fs) {
        var hit = fs.filter(function(f) {
          return normalizeRel(f.rel) === want && /\.model3\.json$/i.test(want);
        });
        return next(hit.length > 0);
      });
    });
  }
  function modelJsonCandidates(id) {
    return Promise.all([getModel(id), filesOf(id)]).then(function(r) {
      var m = r[0], fs = r[1] || [];
      var out = [];
      var push = function(p) {
        var v = normalizeRel(p);
        if (v && out.indexOf(v) < 0) out.push(v);
      };
      if (m && m.modelJson) push(m.modelJson);
      (m && m.candidates || []).forEach(push);
      fs.forEach(function(f) {
        if (/\.model3\.json$/i.test(String(f.rel))) push(f.rel);
      });
      return out;
    });
  }
  function sourceFor(modelId) {
    var mid = String(modelId || "");
    return {
      get: function(url, asArrayBuffer) {
        var u = String(url == null ? "" : url);
        var prefix = "idb:" + mid + "/";
        if (u.indexOf(prefix) !== 0) return Promise.resolve(null);
        var rel = normalizeRel(u.slice(prefix.length));
        return get(STORE_F, fileKey(mid, rel)).then(function(rec) {
          if (!rec || !rec.blob) return null;
          return asArrayBuffer ? rec.blob : rec.blob.text();
        }).catch(function() {
          return null;
        });
      }
    };
  }
  function modelJsonUrl(model) {
    if (!model || !model.id) return null;
    return "idb:" + model.id + "/" + normalizeRel(model.modelJson);
  }
  var API = {
    DB_NAME,
    available: hasIDB,
    importEntries,
    importFromDirectory,
    readDirHandle,

    listModels,
    getModel,
    removeModel,
    renameModel,
    setMapping,

    setModelJson,
    modelJsonCandidates,
    usedBytes,
    sourceFor,
    modelJsonUrl,
    filesOf,

    exportModel,
    downloadModel,
    zipEntries,

    crc32,

    META_NAME,

    unzipEntries,
    readZipMeta,
    importFromZip,

    _summarize: summarize,
    _scanForTest: function(entries) {
      return summarize(entries);
    },
    _internals: {
      normalizeRel,
      joinRel,
      newId,
      safeName,
      listModelJson,
      fileKey,
      summarize
    }
  };
  if (D) global.L2dStore = API;
  else global.__l2dStoreInternals = API;
})(typeof window !== "undefined" ? window : globalThis);
