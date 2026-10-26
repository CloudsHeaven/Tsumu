(function(global) {
  "use strict";
  var KEY = "tsumu.settings.v1";
  var DEFAULTS = {

    llm: {
      baseUrl: "",
      model: "gpt-4o-mini",
      apiKey: "",
      temperature: 0.9,
      maxTokens: 2e3,

      historyTurns: 12,
      contextWindow: 0,

      thinking: "auto",

      thinkingEffort: "default",

      thinkingStyle: "auto",

      lang: "auto"

    },

    memory: {
      enabled: true,
      turnsPerSession: 8,

      sessionCap: 8,

      summaryCap: 8

    },

    longterm: {
      enabled: true,
      everyTurns: 4

    },

    prompt: {
      chara: "",
      world: ""
    },

    tts: {
      provider: "openai",
      baseUrl: "",
      apiKey: "",
      mode: "clone",

      modelClone: "voice-clone-model",
      modelPreset: "tts-model",
      presetVoice: "Chloe",
      format: "wav",

      reference: "",

      styleHint: "",
      modeHints: {},

      qwenBaseUrl: "",
      qwenApiKey: "",
      qwenModel: "qwen3-tts-flash",

      qwenVoice: "Cherry",

      qwenCloneTarget: "qwen3-tts-vc-2026-01-22",

      fishBaseUrl: "",
      fishApiKey: "",
      fishModel: "s2.1-pro-free",
      fishVoice: "",

      fishVoiceAsmr: "",
      lang: "auto"

    },

    voice: { lang: "auto" },
    translate: { lang: "auto" },

    chara: {
      personality: "穏やかで好奇心旺盛、素直で話しやすい",
      likes: "話を聞くこと、静かな時間、あたたかい飲みもの",
      dislikes: "せかされること",
      situation: "画面の向こうで、君と話している",
      callMe: "君",
      extra: ""
    },

    profile: {
      name: "",
      birthday: "",
      gender: "",
      appearance: "",
      background: "",
      hobby: "",
      interest: "",
      futureGoals: "",
      personality: ""
    },
    audio: { bgm: 0.55, ambient: 0.45, voice: 1, se: 0.85 },

    avatar: { highPrecisionMask: true, expressions: [], texTier: "" },

    app: {
      lang: "zh",

      voice: true,
      volume: 0.9,
      textSpeed: 8,

      vibration: true,
      rim: true,

      voiceKeepMB: 200,

      showOriginal: false,
      showBubble: true,

      timeMode: "real",

      flowSpeed: 60,

      accent: "classic",

      uiAlpha: 3,

      memoryRows: 40,

      exprHold: 20,

      imageKeepMB: 200
    },

    web: {
      city: "",
      searchProvider: "tavily",
      searchKey: ""
    },

    state: {
      mode: "chat",

      style: "voice",

      stage: "",
      tod: "aft",

      narration: false,
      day: 1,
      lastDayDate: "",

      gameHour: 12,
      gameClockAt: 0,
      todManualUntil: 0,
      onboardingDone: false
    }
  };
  function deepClone(v) {
    if (Array.isArray(v)) {
      var a = [], i;
      for (i = 0; i < v.length; i++) a.push(deepClone(v[i]));
      return a;
    }
    if (v && typeof v === "object") {
      var o = {}, k;
      for (k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = deepClone(v[k]);
      return o;
    }
    return v;
  }
  function deepMerge(base, patch) {
    var out = Array.isArray(base) ? base.slice() : {};
    var k;
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = deepClone(base[k]);
    for (k in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
      var v = patch[k];
      out[k] = v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object" && !Array.isArray(base[k]) ? deepMerge(base[k], v) : deepClone(v);
    }
    return out;
  }
  var SECRET_KEYS = ["apiKey", "qwenApiKey", "fishApiKey", "searchKey"];
  function redactSecrets(obj) {
    if (!obj || typeof obj !== "object") return obj;
    var out = Array.isArray(obj) ? [] : {};
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      var v = obj[k];
      if (SECRET_KEYS.indexOf(k) >= 0) {
        out[k] = "";
        continue;
      }
      out[k] = v && typeof v === "object" ? redactSecrets(v) : v;
    }
    return out;
  }
  var data;
  try {
    data = deepMerge(DEFAULTS, JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch (e) {
    data = deepMerge(DEFAULTS, {});
  }
  if (data.state && data.state.mode === "text") {
    data.state.mode = "chat";
  }
  if (data.tts && data.tts.provider === "qwen") {
    if (!data.tts.qwenApiKey && data.tts.apiKey) data.tts.qwenApiKey = data.tts.apiKey;
    if (!data.tts.qwenBaseUrl && data.tts.baseUrl) data.tts.qwenBaseUrl = data.tts.baseUrl;
  }
  if (data.tts && data.tts.fishVoice === "2bc96959c27d41cc87d517b83569d43a") {
    data.tts.fishVoice = "";
  }
  if (data.llm && Number(data.llm.maxTokens) === 400) data.llm.maxTokens = 1200;
  if (data.app && !data.app.textSpeedMigrated) {
    if (Number(data.app.textSpeed) === 30) data.app.textSpeed = 8;
    data.app.textSpeedMigrated = true;
  }
  if (data.memory) data.memory.enabled = false;
  var Config = {
    get: function() {
      return data;
    },
    section: function(name) {
      return data[name];
    },
    set: function(path, value) {
      var parts = path.split("."), node = data, i;
      for (i = 0; i < parts.length - 1; i++) {
        if (typeof node[parts[i]] !== "object" || node[parts[i]] === null) node[parts[i]] = {};
        node = node[parts[i]];
      }
      node[parts[parts.length - 1]] = value;
      Config.save();
    },
    save: function() {
      var s = JSON.stringify(data);
      var ss = typeof window !== "undefined" ? window.SafeStore : null;
      if (ss && ss.set) {
        ss.set(KEY, s);
        return;
      }
      try {
        localStorage.setItem(KEY, s);
      } catch (e) {
      }
    },
    reset: function() {
      data = deepMerge(DEFAULTS, {});
      Config.save();
    },

    resetKeepSecrets: function() {
      var secrets = Config.getSecrets();
      Config.reset();
      Config.setSecrets(secrets);
    },

    exportJSONSafe: function() {
      return JSON.stringify(redactSecrets(data), null, 2);
    },

    getSecrets: function() {
      var out = {};
      ["llm", "tts", "web"].forEach(function(sec) {
        var s = data[sec] || {};
        SECRET_KEYS.forEach(function(k) {
          if (s[k] !== void 0) out[sec + "." + k] = s[k];
        });
      });
      return out;
    },
    setSecrets: function(snap) {
      if (!snap) return;
      for (var path in snap) {
        if (Object.prototype.hasOwnProperty.call(snap, path)) Config.set(path, snap[path]);
      }
    },
    importJSON: function(text) {
      var parsed = JSON.parse(text);
      data = deepMerge(DEFAULTS, parsed);
      Config.save();
    },

    eraseAll: function() {
      var doomed = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("tsumu.") === 0) doomed.push(k);
      }
      doomed.forEach(function(k2) {
        localStorage.removeItem(k2);
      });
      data = deepMerge(DEFAULTS, {});
      Config._hydrated = Promise.resolve();
      ["tsumu_crf", "tsumu_voice"].forEach(function(db) {
        try {
          indexedDB.deleteDatabase(db);
        } catch (e) {
        }
      });
      var shell = typeof window !== "undefined" ? window.tsumuShell : null;
      if (!shell || !shell.saveWebStorage) return Promise.resolve();
      return new Promise(function(done) {
        try {
          shell.saveWebStorage({});
        } catch (e) {
          return done();
        }
        setTimeout(done, 500);
      });
    },

    hydrate: function() {
      if (Config._hydrated) return Config._hydrated;
      Config._hydrated = fetch("config/providers.json").then(function(r) {
        return r.ok ? r.json() : null;
      }).then(function(p) {
        if (!p) return;
        function hostOf(u) {
          try {
            return new URL(u).host;
          } catch (e) {
            return "";
          }
        }
        if (p.llm) {
          var llmHostOk = p.llm.base_url && hostOf(data.llm.baseUrl) === hostOf(p.llm.base_url);
          if (!data.llm.apiKey || !llmHostOk) {
            if (p.llm.base_url) data.llm.baseUrl = p.llm.base_url;
            if (p.llm.model) data.llm.model = p.llm.model;
            if (p.llm.api_key) data.llm.apiKey = p.llm.api_key;
            if (p.llm.temperature != null) data.llm.temperature = p.llm.temperature;
          }
        }
        if (p.tts) {
          var ttsHostOk = p.tts.base_url && hostOf(data.tts.baseUrl) === hostOf(p.tts.base_url);
          if (!data.tts.apiKey || !ttsHostOk) {
            if (p.tts.base_url) data.tts.baseUrl = p.tts.base_url;
            if (p.tts.api_key) data.tts.apiKey = p.tts.api_key;
            if (p.tts.model_clone) data.tts.modelClone = p.tts.model_clone;
            if (p.tts.model_preset) data.tts.modelPreset = p.tts.model_preset;
            if (p.tts.reference_audio) data.tts.reference = p.tts.reference_audio;
          }
          if (p.tts.fish_api_key && !data.tts.fishApiKey) {
            data.tts.fishApiKey = p.tts.fish_api_key;
            if (p.tts.fish_base_url) data.tts.fishBaseUrl = p.tts.fish_base_url;
            if (p.tts.fish_model) data.tts.fishModel = p.tts.fish_model;
            if (p.tts.fish_voice) data.tts.fishVoice = p.tts.fish_voice;
            if (p.tts.provider === "fish") data.tts.provider = "fish";
          }
        }
        Config.save();
      }).catch(function() {
      });
      return Config._hydrated;
    }
  };
  global.Config = Config;
})(window);
