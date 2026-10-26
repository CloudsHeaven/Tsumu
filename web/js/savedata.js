(function(global) {
  "use strict";
  var FMT = "tsumu-save";
  var VER = 1;
  var BACKUP_KEY = "tsumu.savedata.backup.v1";
  var KEYS = [
    "tsumu.settings.v1",

    "tsumu.saves.v1",

    "tsumu.dialog.v1",

    "tsumu.todo.v1",

    "tsumu.pomo.v1",

    "tsumu.pomoaudio.v1",

    "tsumu.pomobubble.v1",

    "tsumu.memory.v1",

    "tsumu.longterm.v1",

    "tsumu.diary.v1",

    "tsumu.longmem.v1",

    "tsumu.voicefav.v1",

    "tsumu.favfolders.v1",

    "tsumu.voicelast.v1",
    "tsumu.daily.v1",
    "tsumu.alarms.v1",

    "tsumu.game.v1"

  ];
  var LABELS = {
    "tsumu.settings.v1": "设置与人设",
    "tsumu.saves.v1": "存档槽",
    "tsumu.dialog.v1": "对话记录",
    "tsumu.todo.v1": "待办事项",
    "tsumu.pomo.v1": "番茄钟",
    "tsumu.pomoaudio.v1": "番茄钟音源",
    "tsumu.pomobubble.v1": "番茄钟气泡",
    "tsumu.memory.v1": "回忆卡片",
    "tsumu.longterm.v1": "长期记忆",
    "tsumu.diary.v1": "日记（织音眼中的你）",
    "tsumu.longmem.v1": "会话总结",
    "tsumu.voicefav.v1": "珍藏",
    "tsumu.favfolders.v1": "收藏夹",
    "tsumu.voicelast.v1": "最近语音",
    "tsumu.daily.v1": "每日记录",
    "tsumu.alarms.v1": "闹钟",
    "tsumu.game.v1": "游戏状态"
  };
  var SECRET_KEYS = ["apiKey", "qwenApiKey", "fishApiKey", "searchKey"];
  function redact(obj) {
    if (!obj || typeof obj !== "object") return obj;
    var out = Array.isArray(obj) ? [] : {};
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      var v = obj[k];
      if (SECRET_KEYS.indexOf(k) >= 0) {
        out[k] = "";
        continue;
      }
      out[k] = v && typeof v === "object" ? redact(v) : v;
    }
    return out;
  }
  function redactSettings(raw) {
    if (!raw) return raw;
    try {
      var j = JSON.parse(raw);
      return JSON.stringify(redact(j));
    } catch (e) {
      return raw;
    }
  }
  function safeGet(k) {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  }
  function pack() {
    var keys = {}, bytes = 0, present = [];
    KEYS.forEach(function(k) {
      var v = safeGet(k);
      if (v == null || v === "") return;
      if (k === "tsumu.settings.v1") v = redactSettings(v);
      keys[k] = v;
      bytes += v.length;
      present.push(k);
    });
    var meta = {
      fmt: FMT,
      v: VER,
      at: Date.now(),
      keys: present,
      bytes
    };
    return JSON.stringify({ meta, keys }, null, 1);
  }
  function unpack(text) {
    var s = String(text == null ? "" : text).trim();
    if (!s) throw new Error("EMPTY");
    var j;
    try {
      j = JSON.parse(s);
    } catch (e) {
      throw new Error("NOT_JSON");
    }
    if (!j || !j.meta || j.meta.fmt !== FMT) throw new Error("NOT_SAVE");
    if (!j.keys || typeof j.keys !== "object") throw new Error("NO_KEYS");
    var v = Number(j.meta.v) || 0;
    if (v > VER) throw new Error("TOO_NEW");
    if (v < 1) throw new Error("TOO_OLD");
    var kept = {}, present = [];
    KEYS.forEach(function(k) {
      if (typeof j.keys[k] === "string") {
        kept[k] = j.keys[k];
        present.push(k);
      }
    });
    if (!present.length) throw new Error("NO_KEYS");
    return { meta: j.meta, keys: kept, present };
  }
  function describe(parsed) {
    return parsed.present.map(function(k) {
      return { key: k, label: LABELS[k] || k, bytes: (parsed.keys[k] || "").length };
    });
  }
  function backup() {
    var snap = { at: Date.now(), keys: {} };
    KEYS.forEach(function(k) {
      var v = safeGet(k);
      if (v != null) snap.keys[k] = v;
    });
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(snap));
      return true;
    } catch (e) {
      return false;
    }
  }
  function hasBackup() {
    return !!safeGet(BACKUP_KEY);
  }
  function backupInfo() {
    var s = safeGet(BACKUP_KEY);
    if (!s) return null;
    try {
      var j = JSON.parse(s);
      return { at: j.at, keys: Object.keys(j.keys || {}).length };
    } catch (e) {
      return null;
    }
  }
  function applyKeyMap(map, opts) {
    opts = opts || {};
    var secrets = null;
    if (!opts.rawSecrets && global.Config && Config.getSecrets) {
      try {
        secrets = Config.getSecrets();
      } catch (e) {
        secrets = null;
      }
    }
    var written = 0;
    Object.keys(map).forEach(function(k) {
      if (typeof map[k] !== "string") return;
      try {
        localStorage.setItem(k, map[k]);
        written++;
      } catch (e) {
      }
    });
    if (secrets && global.Config && Config.setSecrets) {
      try {
        Config.setSecrets(secrets);
      } catch (e) {
      }
    }
    return written;
  }
  function apply(parsed) {
    backup();
    return applyKeyMap(parsed.keys, {});
  }
  function undo() {
    var s = safeGet(BACKUP_KEY);
    if (!s) return 0;
    var j;
    try {
      j = JSON.parse(s);
    } catch (e) {
      return 0;
    }
    return applyKeyMap(j.keys || {}, { rawSecrets: true });
  }
  function dropBackup() {
    try {
      localStorage.removeItem(BACKUP_KEY);
    } catch (e) {
    }
  }
  function fileName() {
    var d =  new Date();
    var p = function(n) {
      return (n < 10 ? "0" : "") + n;
    };
    return "tsumu-save-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + ".json";
  }
  function readSlots() {
    try {
      var a = JSON.parse(safeGet("tsumu.saves.v1") || "[]");
      return Array.isArray(a) ? a : [];
    } catch (e) {
      return [];
    }
  }
  var SLOT_EXTRAS = ["tsumu.voicefav.v1", "tsumu.favfolders.v1", "tsumu.voicelast.v1"];
  function packSlot(index) {
    var slots = readSlots();
    var i = Number(index);
    if (!(i >= 0)) throw new Error("BAD_SLOT");
    var s = slots[i];
    if (!s) throw new Error("EMPTY_SLOT");
    var extra = {};
    SLOT_EXTRAS.forEach(function(k) {
      var v = safeGet(k);
      if (v != null && v !== "") extra[k] = v;
    });
    var meta = {
      fmt: FMT,
      v: VER,
      scope: "slot",
      slot: i,
      at: Date.now(),
      label: String(s.label || ""),
      day: s.day || 0,
      bytes: JSON.stringify(s).length,
      extra: Object.keys(extra)
    };
    return JSON.stringify({ meta, slot: s, extra }, null, 1);
  }
  function unpackSlot(text) {
    var s = String(text == null ? "" : text).trim();
    if (!s) throw new Error("EMPTY");
    var j;
    try {
      j = JSON.parse(s);
    } catch (e) {
      throw new Error("NOT_JSON");
    }
    if (!j || !j.meta || j.meta.fmt !== FMT) throw new Error("NOT_SAVE");
    if (j.meta.scope !== "slot") throw new Error("NOT_SLOT");
    var v = Number(j.meta.v) || 0;
    if (v > VER) throw new Error("TOO_NEW");
    if (v < 1) throw new Error("TOO_OLD");
    if (!j.slot || typeof j.slot !== "object") throw new Error("NO_SLOT");
    if (!j.slot.settings) throw new Error("NO_SLOT");
    var extra = {};
    if (j.extra && typeof j.extra === "object") {
      SLOT_EXTRAS.forEach(function(k) {
        if (typeof j.extra[k] === "string") extra[k] = j.extra[k];
      });
    }
    return { meta: j.meta, slot: j.slot, extra };
  }
  function applySlot(index, parsed, opts) {
    opts = opts || {};
    var restoreExtra = opts.restoreExtra !== false;
    var i = Number(index);
    if (!(i >= 0)) throw new Error("BAD_SLOT");
    var slots = readSlots();
    var entry = parsed && parsed.slot ? parsed.slot : parsed && parsed.keys ? null : parsed;
    if (!entry || typeof entry !== "object") throw new Error("NO_SLOT");
    backup();
    while (slots.length <= i) slots.push(null);
    slots[i] = entry;
    try {
      localStorage.setItem("tsumu.saves.v1", JSON.stringify(slots));
    } catch (e) {
      throw new Error("WRITE_FAIL");
    }
    var ex = parsed && parsed.extra || {};
    var nExtra = 0;
    if (restoreExtra) {
      Object.keys(ex).forEach(function(k) {
        if (SLOT_EXTRAS.indexOf(k) < 0) return;
        try {
          localStorage.setItem(k, ex[k]);
          nExtra++;
        } catch (e) {
        }
      });
    }
    return 1 + nExtra;
  }
  global.SaveData = {
    FMT,
    VER,
    KEYS,
    LABELS,
    BACKUP_KEY,
    pack,
    unpack,
    describe,
    apply,
    undo,
    backup,
    hasBackup,
    backupInfo,
    dropBackup,
    fileName,

    readSlots,
    packSlot,
    unpackSlot,
    applySlot,
    slotFileName: function(index) {
      return fileName().replace(/\.json$/, "") + "-slot" + (Number(index) + 1) + ".json";
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
