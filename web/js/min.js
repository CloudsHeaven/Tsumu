(function() {
  "use strict";
  var $ = function(id) {
    return document.getElementById(id);
  };
  function morphCardFor(boxId, btnId) {
    try {
      var P = window.TsumuPlayer;
      if (P && P.morphCard) P.morphCard($(boxId), $(btnId));
    } catch (e) {
    }
  }
  function put(key, val) {
    if (window.SafeStore && SafeStore.set) return SafeStore.set(key, val);
    try {
      localStorage.setItem(key, val);
      return true;
    } catch (e) {
      return false;
    }
  }
  function T(key, fallback, map) {
    if (window.I18n && I18n.tf) return I18n.tf(key, fallback === void 0 ? key : fallback, map);
    var s = fallback === void 0 ? key : fallback;
    if (map) Object.keys(map).forEach(function(k) {
      s = s.split("{" + k + "}").join(map[k]);
    });
    return s;
  }
  var statusState = { key: "status.unconfigured", bad: true, map: null, detail: null };
  var history = [];
  var busy = false;
  var audioEl = new Audio();
  var lastClipUrl = null;
  var curClipKey = null;
  var MEM_PLAY = "▶";
  var MEM_PAUSE = "⏸";
  window.TsumuAudio = audioEl;
  function logEl() {
    return $("log");
  }
  function atBottom() {
    var el = logEl();
    return el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }
  function scrollBottom() {
    var el = logEl();
    el.scrollTop = el.scrollHeight;
  }
  function addMsg(who, text, img) {
    var stick = atBottom();
    var row = document.createElement("div");
    row.className = "msg " + who;
    var bubble = document.createElement("div");
    bubble.className = "bubble";
    row.appendChild(bubble);
    renderBubble(bubble, text, text, who);
    if (img) {
      var im = document.createElement("img");
      im.className = "thumb";
      im.alt = "";
      im.src = img;
      (bubble._lastBody || bubble).appendChild(im);
    }
    logEl().appendChild(row);
    if (stick) scrollBottom();
    if (chatBooted && who === "ai" && chatIsCollapsed()) {
      chatUnread = true;
      paintChatToggle();
    }
    return bubble;
  }
  function renderBubble(bubble, text, raw, who) {
    var row = bubble && bubble.parentNode;
    if (!row) {
      bubble.textContent = who === "me" ? raw : text;
      return;
    }
    var shown = String(text == null ? "" : text);
    var lang = window.Langs ? Langs.ui() : "zh";
    var split = null;
    try {
      if (window.Segments && Segments.splitNarration) {
        split = Segments.splitNarration(who === "ai" ? shown : raw, lang);
      }
    } catch (e) {
      split = null;
    }
    var parts = split && split.parts && split.parts.length ? split.parts : null;
    var hasNarr = false;
    if (parts) {
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].kind === "narr") {
          hasNarr = true;
          break;
        }
      }
    }
    if (!parts || !hasNarr) {
      clearSegNodes(bubble, row);
      bubble.textContent = shown;
      bubble.style.display = "";
      return;
    }
    renderSegParts(bubble, row, parts);
  }
  function clearSegNodes(bubble, row) {
    bubble._segNodes = null;
    var kids = Array.prototype.slice.call(row.children || []);
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (el === bubble) continue;
      var cn = String(el.className || "");
      if (cn === "bubble-narr" || cn === "bubble") row.removeChild(el);
    }
  }
  function renderSegParts(bubble, row, parts) {
    clearSegNodes(bubble, row);
    var nodes = [], usedPrimary = false, lastBody = null;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p.text) continue;
      var el;
      if (p.kind === "body" && !usedPrimary) {
        el = bubble;
        usedPrimary = true;
      } else {
        el = document.createElement("div");
        el.className = p.kind === "narr" ? "bubble-narr" : "bubble";
      }
      el.textContent = p.text;
      if (p.kind === "body") {
        el.style.display = "";
        lastBody = el;
      }
      nodes.push(el);
    }
    if (!usedPrimary) {
      bubble.textContent = "";
      bubble.style.display = "none";
    }
    for (var j = 0; j < nodes.length; j++) row.appendChild(nodes[j]);
    bubble._segNodes = nodes;
    bubble._lastBody = lastBody || bubble;
  }
  function setMsg(bubble, text) {
    var stick = atBottom();
    var row = bubble && bubble.parentNode;
    var raw = text;
    try {
      if (bubble && bubble.dataset && bubble.dataset.raw) raw = bubble.dataset.raw;
    } catch (e) {
    }
    if (row) {
      var who = (row.className || "").indexOf("me") >= 0 ? "me" : "ai";
      renderBubble(bubble, text, raw, who);
    } else {
      bubble.textContent = text;
    }
    if (stick) scrollBottom();
  }
  function cfg() {
    return {
      llm: Config.section("llm") || {},
      tts: Config.section("tts") || {},
      app: Config.section("app") || {},
      state: Config.section("state") || {},
      web: Config.section("web") || {}
    };
  }
  function paintStatus() {
    var el = $("status");
    if (!el) return;
    var text = T(statusState.key, statusState.key, statusState.map);
    el.textContent = text;
    el.className = statusState.bad ? "off" : "on";
    el.title = statusState.detail ? text + " — " + statusState.detail : text;
  }
  function setStatus(key, bad, map, detail) {
    statusState = { key, bad: !!bad, map: map || null, detail: detail || null };
    paintStatus();
  }
  function isAsmr() {
    return (Config.section("state") || {}).mode === "asmr";
  }
  function syncAsmrBtn() {
    var b = $("btn-asmr");
    if (!b) return;
    var on = isAsmr();
    b.classList.toggle("on", on);
    document.body.classList.toggle("asmr", on);
    b.title = T(on ? "ui.asmrTipOn" : "ui.asmrTipOff");
  }
  function toggleAsmr() {
    var next = isAsmr() ? "chat" : "asmr";
    try {
      Config.set("state.mode", next);
    } catch (e) {
    }
    syncAsmrBtn();
    setStatus(next === "asmr" ? "ui.modeAsmr" : "status.ready");
    addMsg("sys", T(next === "asmr" ? "ui.asmrOn" : "ui.asmrOff"));
  }
  function isDiary() {
    return !!(Config.section("state") || {}).diary;
  }
  function syncDiaryBtn() {
    var b = $("btn-diary");
    if (!b) return;
    b.classList.toggle("on", isDiary());
    b.title = T(isDiary() ? "ui.diaryTipOn" : "ui.diaryTipOff");
  }
  function toggleDiary() {
    var on = !isDiary();
    try {
      Config.set("state.diary", on);
      if (Config.save) Config.save();
    } catch (e) {
    }
    syncDiaryBtn();
    addMsg("sys", T(on ? "ui.diaryOn" : "ui.diaryOff"));
    if (on || !window.Diary) return;
    var n = Diary.pendingCount();
    if (!n) {
      addMsg("sys", T("diary.nothing", "这段时间没聊什么，日记没变化"));
      return;
    }
    if (isDiaryCardOpen()) diaryState(T("diary.consolidating", "整理中…"));
    Diary.flushNow().then(function(ok) {
      if (isDiaryCardOpen()) renderDiary();
      addMsg("sys", T(
        ok ? "diary.done" : "diary.kept",
        ok ? "日记已更新（{n} 轮对话）" : "日记整理失败，已保留待整理的内容（下次会再试）",
        { n }
      ));
    }).catch(function() {
    });
  }
  var _emoTimer = 0, _emoPreset = "", _emoWait = 0;
  function emoHoldMs() {
    var v = 20;
    try {
      var x = (Config.section("app") || {}).exprHold;
      if (x !== void 0 && x !== null) v = Number(x);
    } catch (e) {
    }
    if (!isFinite(v) || v < 0) v = 20;
    return v * 1e3;
  }
  function ttsSpeaking() {
    try {
      return !!(window.TsumuAudio && window.TsumuAudio.paused === false);
    } catch (e) {
      return false;
    }
  }
  function cancelEmoTimer() {
    if (_emoTimer) {
      clearTimeout(_emoTimer);
      _emoTimer = 0;
    }
    _emoPreset = "";
    _emoWait = 0;
  }
  function armEmoTimer(preset) {
    cancelEmoTimer();
    var ms = emoHoldMs();
    if (!ms || !preset) return;
    _emoPreset = String(preset);
    function fire() {
      _emoTimer = 0;
      var L = window.TsumuL2d;
      if (!L || !L.model || !L.model.clearLlmEmotion) return;
      if (ttsSpeaking() && _emoWait < 30) {
        _emoWait++;
        _emoTimer = setTimeout(fire, 1e3);
        return;
      }
      try {
        if (L.model.activeEmotion && L.model.activeEmotion() !== _emoPreset) {
          cancelEmoTimer();
          return;
        }
      } catch (e) {
      }
      try {
        if (L.model.clearLlmEmotion() && L.syncExprPanel) L.syncExprPanel();
      } catch (e) {
      }
      cancelEmoTimer();
    }
    _emoTimer = setTimeout(fire, ms);
  }
  function guessLang(text) {
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return "ja";
    if (/[\u4e00-\u9fff]/.test(text)) return "zh";
    return "en";
  }
  function noKana(s) {
    return !/[\u3040-\u309f\u30a0-\u30ff]/.test(String(s || ""));
  }
  var FENCE_OPEN = "［";
  function isTagLine(s) {
    var t = String(s == null ? "" : s).trim();
    return t.charAt(0) === "[" || t.charAt(0) === FENCE_OPEN || t.charAt(0) === "【";
  }
  function zhOnly(raw) {
    var src = String(raw == null ? "" : raw);
    var kept = [], trans = [], inTrans = false;
    src.split("\n").forEach(function(l) {
      var t = String(l).trim();
      if (!t) return;
      if (isTagLine(t)) return;
      if (/^译文\s*[：:]/.test(t)) {
        inTrans = true;
        trans.push(t.replace(/^译文\s*[：:]\s*/, ""));
        return;
      }
      if (/^(旁白|织音)\s*[：:]/.test(t)) {
        inTrans = false;
        kept.push(t.replace(/^旁白\s*[：:]\s*/, "").replace(/^织音\s*[：:]\s*/, ""));
        return;
      }
      if (kept.length && !inTrans) kept.push(t);
      else if (trans.length && inTrans) trans.push(t);
    });
    var zh = kept.filter(noKana);
    if (zh.length) return zh.join("\n");
    var zhT = trans.filter(noKana);
    if (zhT.length) return zhT.join("\n");
    if (kept.length) return kept.join("\n");
    if (trans.length) return trans.join("\n");
    return src;
  }
  function displayOf(raw) {
    if (!window.Segments) return raw;
    try {
      var src = zhOnly(raw);
      var t2 = Segments.displayText(
        src,
        window.Langs ? Langs.ui() : "zh",
        { showOriginal: false }
      );
      if (t2) return t2;
    } catch (e) {
    }
    return raw;
  }
  function speakOf(raw) {
    if (!window.Segments || !Segments.speakText) return raw;
    try {
      var src = String(raw == null ? "" : raw);
      var a = "";
      try {
        a = Segments.speakText(src) || "";
      } catch (e1) {
      }
      var b = "";
      try {
        if (Segments.translationText) b = Segments.translationText(src) || "";
      } catch (e2) {
      }
      var _vl = typeof ttsLang === "function" ? ttsLang() : "zh";
      var isJa = function(s) {
        return /[\u3040-\u309f\u30a0-\u30ff]/.test(String(s || ""));
      };
      var isEn = function(s) {
        var x = String(s || "");
        return /[A-Za-z]/.test(x) && !/[\u3040-\u30ff]/.test(x) && !/[\u4e00-\u9fff]/.test(x);
      };
      if (_vl === "ja") {
        if (isJa(b)) return b;
        if (isJa(a)) return a;
        return "";
      }
      if (_vl === "en") {
        if (isEn(b)) return b;
        if (isEn(a)) return a;
        return "";
      }
      if (a && !isJa(a)) return a;
      if (b && !isJa(b)) return b;
      return a || b || "";
    } catch (e) {
    }
    return raw;
  }
  function needTranslateFallback(raw) {
    try {
      var t = window.Langs && Langs.translate ? Langs.translate() : "";
      var r = window.Langs && Langs.llm ? Langs.llm() : "";
      if (!t || t === r) return false;
      if (window.Segments && Segments.translationText) return !Segments.translationText(raw);
      return false;
    } catch (e) {
      return false;
    }
  }
  function speak(text, clipId) {
    var c = cfg();
    if (c.tts.mode === "off") return;
    if (c.app.voice === false) return;
    if (!String(text || "").trim()) return;
    var mode = c.state.mode || "chat";
    setStatus(mode === "asmr" ? "status.ttsBusyAsmr" : "status.ttsBusy");
    var lang = window.Langs && Langs.tts ? Langs.tts() : guessLang(text);
    Api.speak(text, lang, mode).then(function(url) {
      setStatus(mode === "asmr" ? "ui.modeAsmr" : "status.ready");
      if (!url) return;
      if (lastClipUrl) {
        try {
          URL.revokeObjectURL(lastClipUrl);
        } catch (e) {
        }
      }
      lastClipUrl = url;
      var fx = (Api.MODE_PLAY_FX || {})[mode] || null;
      audioEl.src = url;
      cacheClip(url, clipId);
      audioEl.volume = Math.max(0, Math.min(1, Number(c.app.volume) || 0.9));
      audioEl.playbackRate = fx && fx.rate || 1;
      audioEl.onended = function() {
        setStatus(mode === "asmr" ? "ui.modeAsmr" : "status.ready");
      };
      audioEl.onerror = function() {
        setStatus("status.playFail", true);
      };
      audioEl.play().catch(function(e) {
        setStatus("status.playDenied", true, null, e && e.message ? e.message : e);
      });
    }).catch(function(e) {
      setStatus("status.ttsFail", true, null, e && e.message ? e.message : e);
    });
  }
  var _webTestMsg = "";
  function renderWebStatus() {
    var el = $("s-web-status");
    if (!el) return;
    var w = Config.section("web") || {};
    var key = String(w.searchKey || "").trim();
    var city = String(w.city || "").trim();
    var ready = false;
    try {
      ready = !!(window.WebSrc && window.WebSrc.configured && window.WebSrc.configured());
    } catch (e) {
      ready = false;
    }
    var L = [];
    L.push(city ? T("web.stCity", "城市：已设置「{v}」", { v: city }) : T("web.stCityNone", "城市：未设置 ⇒ 天气不会工作"));
    L.push(key ? T("web.stKey", "API Key：已保存（末 4 位 {v}）", { v: key.slice(-4) }) : ready ? T("web.stKeyLlm", "API Key：未单独填 ⇒ 借用上面 LLM 的 Key（前提：上面也是 DeepSeek API）") : T("web.stKeyNone", "API Key：未填 ⇒ 网页检索不会工作"));
    if (_webTestMsg) L.push(_webTestMsg);
    el.textContent = L.join("　·　");
  }
  function syncWebKeyPh() {
    var el = $("s-web-key"), prov = $("s-web-provider");
    if (!el) return;
    var ds = prov && String(prov.value || "").toLowerCase() === "deepseek";
    el.placeholder = ds ? T("web.keyPhDsh", "LLM 用 DeepSeek API 时可留空") : T("web.keyPhNone", "留空 = 不开启网页检索");
  }
  function renderImgStatus(msg) {
    var el = $("s-img-status");
    if (!el) return;
    var box = window.ImgStore;
    if (!box) {
      el.textContent = msg || "";
      return;
    }
    Promise.all([box.total(), box._entries()]).then(function(r) {
      var usedMB = (Number(r[0]) || 0) / 1048576;
      var lim = box.limitBytes();
      var limTxt = lim === Infinity ? T("settings.imgNoLimit", "不限") : Math.round(lim / 1048576) + " MB";
      var nCard = 0, bCard = 0, nCov = 0, bCov = 0;
      (r[1] || []).forEach(function(e) {
        var sz = Number(e && e.size) || 0;
        if (String(e && e.key || "").indexOf("cover:") === 0) {
          nCov++;
          bCov += sz;
        } else {
          nCard++;
          bCard += sz;
        }
      });
      el.textContent = T(
        "settings.imgUsage",
        "已用 {u} MB / 上限 {l} · 回忆图片 {n1} 张（{u1} MB）· 封面 {n2} 张（{u2} MB）",
        {
          u: usedMB.toFixed(1),
          l: limTxt,
          n1: nCard,
          u1: (bCard / 1048576).toFixed(1),
          n2: nCov,
          u2: (bCov / 1048576).toFixed(1)
        }
      ) + (msg ? "　·　" + msg : "");
    }).catch(function() {
      el.textContent = msg || "";
    });
  }
  function renderL2dCap() {
    var box = $("l2d-cap-body");
    if (!box) return;
    var cap = window.L2dCapability;
    var stage = window.TsumuL2d;
    var info = null;
    try {
      if (stage && stage.model && typeof stage.model.info === "function") info = stage.model.info();
    } catch (e) {
      info = null;
    }
    if (!cap || typeof cap.report !== "function" || !info) {
      box.innerHTML = "<p>" + esc(T("l2d.noCap", "没有读到模型信息\n（未安装模型）")) + "</p>";
      return;
    }
    var r = cap.report(info);
    var html = "<p>" + esc(T(
      "l2d.capCount",
      "可用 {ok} 项 · 需要对应 {miss} 项",
      { ok: r.summary.ok, miss: r.summary.missing }
    )) + "</p>";
    r.area.forEach(function(a) {
      html += '<p style="margin:6px 0 0"><b>' + esc(a.title) + "</b></p>";
      a.ok.forEach(function(s) {
        html += '<div style="color:#9fd7a6">✓ ' + esc(s) + "</div>";
      });
      a.missing.forEach(function(s) {
        html += '<div style="color:#d9a3a3">– ' + esc(s) + "</div>";
      });
      if (a.note) html += '<div style="opacity:.7">' + esc(a.note) + "</div>";
    });
    html += '<p style="margin:8px 0 0;opacity:.75">' + esc(T("l2d.capNote", "换成别人的模型时，需要“同名差分/动作”的功能通常会缺失；缺失时会自动降级，不会报错。")) + "</p>";
    box.innerHTML = html;
  }
  function wireNoModelGuide() {
    try {
      window.L2dNomodel = {
        show: function() {
          var el = $("l2d-nomodel");
          if (el) el.classList.remove("hide");
        },
        hide: function() {
          var el = $("l2d-nomodel");
          if (el) el.classList.add("hide");
        }
      };
      var btn = $("btn-l2d-settings");
      if (btn && !btn.dataset.wired) {
        btn.dataset.wired = "1";
        btn.addEventListener("click", function() {
          try {
            openSettings();
          } catch (e) {
          }
        });
      }
    } catch (e) {
    }
  }
  function fmtMB(n) {
    return Math.round((Number(n) || 0) / 1048576 * 10) / 10 + " MB";
  }
  function renderModelList() {
    var box = $("l2d-model-list");
    var st = $("l2d-model-status");
    if (!box) return;
    var S = window.L2dStore;
    var stage = window.TsumuL2d;
    var cur = stage && stage.modelRefOf ? stage.modelRefOf() : "";
    var builtin = stage && stage.listBuiltinModels ? stage.listBuiltinModels() || [] : [];
    var show = function(html) {
      box.innerHTML = html;
    };
    var imported = [];
    var candsMap = {};
    var builtinAvail = {};
    var probeBuiltins = function() {
      if (!stage || typeof stage.probeBuiltin !== "function") return Promise.resolve();
      return Promise.all(builtin.map(function(m) {
        return Promise.resolve(stage.probeBuiltin(m.ref)).then(function(v) {
          builtinAvail[m.ref] = !!v;
        }).catch(function() {
          builtinAvail[m.ref] = false;
        });
      })).catch(function() {
      });
    };
    var done = function() {
      return probeBuiltins().then(function() {
        var jobs = imported.map(function(m) {
          return S.modelJsonCandidates(m.id).then(function(c) {
            candsMap[m.id] = c || [];
          }).catch(function() {
            candsMap[m.id] = [];
          });
        });
        return Promise.all(jobs).then(function() {
          paint();
        }).catch(function() {
          paint();
        });
      });
    };
    var paint = function() {
      var html = "";
      builtin.forEach(function(m) {
        var avail = builtinAvail[m.ref] !== false;
        html += '<div class="ex-row" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>' + esc(m.name) + '</b><span style="opacity:.65">(' + esc(avail ? T("l2d.builtinTag", "内置") : T("l2d.builtinMissing", "内置 · 缺文件")) + ")</span>" + (m.ref === cur && avail ? '<span style="color:#9fd7a6">● ' + esc(T("l2d.inUse", "使用中")) + "</span>" : "") + "</div>";
      });
      imported.forEach(function(m) {
        var ref = "idb:" + m.id;
        var cands = candsMap[m.id] || [];
        var picker = "";
        if (cands.length > 1) {
          var opts = "";
          cands.forEach(function(c) {
            opts += '<option value="' + esc(c) + '"' + (c === m.modelJson ? " selected" : "") + ">" + esc(c) + "</option>";
          });
          picker = '<div style="display:flex;gap:6px;align-items:center;width:100%;margin-top:2px"><span style="opacity:.65">' + esc(T("l2d.mainFile", "主文件")) + '</span><select class="mini-sel" data-l2d-main="' + esc(ref) + '" title="' + esc(T("l2d.mainFileHint", "这个模型里有多份 .model3.json，选一份当主文件（换错可能加载不了）。")) + '">' + opts + "</select></div>";
        }
        html += '<div class="ex-row" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>' + esc(m.name) + '</b><span style="opacity:.65">' + esc(fmtMB(m.bytes)) + " · " + m.files + "</span>" + (ref === cur ? '<span style="color:#9fd7a6">● ' + esc(T("l2d.inUse", "使用中")) + "</span>" : "") + (ref === cur ? "" : '<button class="mini-btn" data-l2d-use="' + esc(ref) + '">' + esc(T("l2d.useThis", "切换到此模型")) + "</button>") + '<button class="mini-btn" data-l2d-export="' + esc(ref) + '">' + esc(T("l2d.export", "导出 zip")) + '</button><button class="mini-btn" data-l2d-rename="' + esc(ref) + '">' + esc(T("l2d.rename", "重命名")) + '</button><button class="mini-btn" data-l2d-del="' + esc(ref) + '">' + esc(T("l2d.remove", "删除")) + "</button>" + picker + "</div>";
      });
      if (!imported.length) html += '<div class="hint-sub" style="margin:0">' + esc(T("l2d.noImported", "还没有导入任何模型。")) + "</div>";
      show(html);
      if (st) {
        var total = 0;
        imported.forEach(function(m) {
          total += m.bytes || 0;
        });
        st.textContent = total ? T("l2d.usedSpace", "已用 {s}", { s: fmtMB(total) }) : "";
      }
    };
    if (!S || !S.available || !S.available()) {
      done();
      return;
    }
    S.listModels().then(function(list) {
      imported = list || [];
      done();
    }).catch(function() {
      done();
    });
  }
  function renderExprMap() {
    var wrap = $("l2d-map-wrap"), body = $("l2d-map-body");
    var CLS_HIDDEN = "hidden";
    if (!wrap || !body) return;
    var stage = window.TsumuL2d;
    var cur = stage && stage.modelRefOf ? stage.modelRefOf() : "";
    if (!stage || cur.indexOf("idb:") !== 0 || !stage.missingExprNames) {
      wrap.classList.add(CLS_HIDDEN);
      return;
    }
    var missing = [];
    try {
      missing = stage.missingExprNames() || [];
    } catch (e) {
      missing = [];
    }
    if (!missing.length) {
      wrap.classList.add(CLS_HIDDEN);
      return;
    }
    var avail = [];
    try {
      avail = stage.availableExprNames() || [];
    } catch (e) {
      avail = [];
    }
    wrap.classList.remove(CLS_HIDDEN);
    var html = '<div class="hint-sub" style="margin:0 0 4px">' + esc(T("l2d.mapOurName", "需要的表情")) + " → " + esc(T("l2d.mapTheirName", "本模型里的对应表情")) + "</div>";
    missing.forEach(function(ourName) {
      var opts = '<option value="">' + esc(T("l2d.mapNone", "（没有对应的）")) + "</option>";
      avail.forEach(function(theirName) {
        opts += '<option value="' + esc(theirName) + '">' + esc(theirName) + "</option>";
      });
      html += '<div class="ex-row" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>' + esc(ourName) + '</b><span style="opacity:.6">→</span><select class="mini-sel" data-l2d-map="' + esc(ourName) + '">' + opts + "</select></div>";
    });
    body.innerHTML = html;
    var list = body.querySelectorAll("select[data-l2d-map]");
    for (var i = 0; i < list.length; i++) {
      (function(el) {
        var ourName = el.getAttribute("data-l2d-map");
        try {
          var have = stage.getAliasOf ? stage.getAliasOf(ourName) : null;
          if (have) el.value = have;
        } catch (e) {
        }
        el.addEventListener("change", function(ev) {
          var el2 = ev.target;
          stage.setExprAlias(cur, el2.getAttribute("data-l2d-map"), el2.value).then(function() {
            renderExprMap();
            try {
              renderL2dCap();
            } catch (e) {
            }
          });
        });
      })(list[i]);
    }
  }
  function wireModelList() {
    var box = $("l2d-model-list");
    if (!box || box.dataset.wired) return;
    box.dataset.wired = "1";
    box.addEventListener("change", function(e) {
      var el = e.target;
      if (!el || !el.dataset || !el.dataset.l2dMain) return;
      var S = window.L2dStore;
      if (!S || !S.setModelJson) return;
      var mref = el.dataset.l2dMain;
      S.setModelJson(String(mref).slice(4), el.value).then(function(m) {
        if (!m) {
          try {
            alert(T("l2d.switchFail", "切换失败（目标模型读不到）"));
          } catch (e2) {
          }
        }
        renderModelList();
      }).catch(function() {
        renderModelList();
      });
    });
    box.addEventListener("click", function(e) {
      var t = e.target;
      if (!t || !t.dataset) return;
      var stage = window.TsumuL2d, S = window.L2dStore;
      if (t.dataset.l2dUse) {
        var ref = t.dataset.l2dUse;
        if (stage && stage.switchModel) {
          t.disabled = true;
          stage.switchModel(ref).then(function(ok) {
            if (!ok) {
              try {
                alert(T("l2d.switchFail", "切换失败（目标模型读不到）"));
              } catch (e2) {
              }
            }
            renderModelList();
            renderL2dCap();
            renderExprMap();
          });
        }
        return;
      }
      var id = t.dataset.l2dRename ? t.dataset.l2dRename.slice(4) : t.dataset.l2dDel ? t.dataset.l2dDel.slice(4) : null;
      if (t.dataset.l2dExport && S && S.downloadModel) {
        var eid = t.dataset.l2dExport.slice(4);
        if (st) st.textContent = T("l2d.exporting", "正在打包…");
        t.disabled = true;
        S.downloadModel(eid).then(function(okv) {
          if (st) st.textContent = okv ? T("l2d.exported", "已导出（在下载文件夹里）") : T("l2d.exportFail", "导出失败");
          t.disabled = false;
        }).catch(function() {
          if (st) st.textContent = T("l2d.exportFail", "导出失败");
          t.disabled = false;
        });
        return;
      }
      if (t.dataset.l2dRename && S && S.renameModel) {
        S.getModel(id).then(function(m) {
          var name = prompt(T("l2d.rename", "重命名"), m && m.name || "");
          if (name == null) return;
          return S.renameModel(id, name).then(function() {
            renderModelList();
          });
        });
        return;
      }
      if (t.dataset.l2dDel && S && S.removeModel) {
        var cur = stage && stage.modelRefOf ? stage.modelRefOf() : "";
        if (t.dataset.l2dDel === cur) {
          try {
            alert(T("l2d.removeInUse", "这是正在使用的模型，先切换到别的模型再删。"));
          } catch (e3) {
          }
          return;
        }
        S.getModel(id).then(function(m) {
          var name = m && m.name || "";
          if (!confirm(T("l2d.removeConfirm", "确定删除「{n}」吗？删除后可以重新导入。", { n: name }))) return;
          return S.removeModel(id).then(function() {
            renderModelList();
          });
        });
      }
    });
    var btn = $("btn-l2d-import"), st = $("l2d-model-status");
    if (btn && !btn.dataset.wired) {
      btn.dataset.wired = "1";
      btn.addEventListener("click", function() {
        var SS = window.L2dStore;
        var say = function(msg) {
          if (st) st.textContent = msg || "";
        };
        if (!SS || !SS.available || !SS.available()) {
          say(T("l2d.importFail", "导入失败：{e}", { e: "store" }));
          return;
        }
        if (!window.showDirectoryPicker) {
          say(T("l2d.importNoDir", "这个浏览器不支持选择文件夹（需要 showDirectoryPicker）。"));
          return;
        }
        say(T("l2d.importing", "正在导入…"));
        window.showDirectoryPicker({ id: "tsumu-l2d", mode: "read" }).then(function(dir) {
          return SS.importFromDirectory(dir);
        }).then(function(rec) {
          say(T("l2d.imported", "已导入「{n}」", { n: rec && rec.name }));
          renderModelList();
        }).catch(function(e) {
          var m = e && e.message || String(e);
          if (m === "EMPTY") m = T("l2d.importEmpty", "这个文件夹是空的。");
          else if (m === "NO_MODEL3") m = T("l2d.importNoModel", "没有找到 Live2D 模型（缺少 .model3.json 文件）。");
          else if (m === "BAD_MODEL3") m = T("l2d.importBadModel", "指定的模型主文件不在这个文件夹里。");
          else if (/abort/i.test(m)) m = "";
          say(m ? T("l2d.importFail", "导入失败：{e}", { e: m }) : "");
        });
      });
    }
    var zbtn = $("btn-l2d-import-zip"), zin = $("l2d-zip-input");
    var sayZip = function(msg) {
      var st2 = $("l2d-model-status");
      if (st2) st2.textContent = msg || "";
    };
    if (zbtn && zin) {
      if (zbtn.dataset.wired !== "1") {
        zbtn.dataset.wired = "1";
        zbtn.addEventListener("click", function() {
          try {
            zin.value = "";
            zin.click();
          } catch (e) {
          }
        });
      }
      if (zin.dataset.wired !== "1") {
        zin.dataset.wired = "1";
        zin.addEventListener("change", function() {
          var f = zin.files && zin.files[0];
          var SS = window.L2dStore;
          if (!f) return;
          if (!SS || !SS.importFromZip) {
            sayZip(T("l2d.importFail", "导入失败：{e}", { e: "store" }));
            return;
          }
          sayZip(T("l2d.importing", "正在导入…"));
          SS.importFromZip(f, {}).then(function(rec) {
            sayZip(T("l2d.imported", "已导入「{n}」", { n: rec && rec.name }));
            renderModelList();
            renderExprMap();
          }).catch(function(e) {
            var m = e && e.message || String(e);
            if (m === "EMPTY") m = T("l2d.importEmpty", "这个文件夹是空的。");
            else if (m === "NO_MODEL3") m = T("l2d.importNoModel", "没有找到 Live2D 模型（缺少 .model3.json 文件）。");
            else if (m === "NOT_ZIP") m = T("l2d.zipNotZip", "这不是一个 zip 文件。");
            else if (/^ZIP_METHOD_/.test(m)) m = T("l2d.zipPacked", "这个 zip 是压缩过的，暂不支持（请先解压后选文件夹导入）。");
            else if (/abort/i.test(m)) m = "";
            sayZip(m ? T("l2d.importFail", "导入失败：{e}", { e: m }) : "");
          });
        });
      }
    }
    try {
      var sh = window.tsumuShell;
      if (sh && typeof sh.onDownloadDone === "function" && !window.__l2dDlWired) {
        window.__l2dDlWired = true;
        sh.onDownloadDone(function(info) {
          var st3 = $("l2d-model-status");
          if (!st3) return;
          if (info && info.ok) st3.textContent = T("l2d.exportedTo", "已保存到：{p}", { p: info.path || info.name || "" });
          else st3.textContent = T("l2d.exportFail", "导出失败");
        });
      }
    } catch (e) {
    }
  }
  var IMG_TIERS = [100, 200, 500, 1e3, 0];
  function wireImgSettings() {
    var keep = $("s-img-keep"), clr = $("s-img-clear");
    if (keep && !keep.dataset.wired) {
      keep.dataset.wired = "1";
      var cur = 200;
      try {
        var v0 = (Config.section("app") || {}).imageKeepMB;
        if (v0 != null && isFinite(Number(v0)) && Number(v0) >= 0) cur = Number(v0);
      } catch (e) {
      }
      var labelOf = function(mb) {
        if (mb === 0) return T("settings.imgKeepOptNoLimit", "不限制");
        if (mb >= 1e3 && mb % 1e3 === 0) return T("settings.imgKeepOptGb", "{v} GB", { v: mb / 1e3 });
        return T("settings.imgKeepOptMb", "{v} MB", { v: mb });
      };
      keep.innerHTML = "";
      var tiers = IMG_TIERS.slice();
      if (tiers.indexOf(cur) < 0) tiers.unshift(cur);
      tiers.forEach(function(mb) {
        var o = document.createElement("option");
        o.value = String(mb);
        o.textContent = mb === cur && IMG_TIERS.indexOf(cur) < 0 ? T("settings.imgKeepOptCurrent", "当前 {v} MB", { v: mb }) : labelOf(mb);
        keep.appendChild(o);
      });
      keep.value = String(cur);
      keep.addEventListener("change", function() {
        var v = Number(keep.value);
        if (!isFinite(v) || v < 0) v = 200;
        try {
          Config.set("app.imageKeepMB", v);
          if (Config.save) Config.save();
        } catch (e) {
        }
        var done = function() {
          renderImgStatus(T("toast.saved", "已保存"));
        };
        try {
          if (window.ImgStore) ImgStore.trim().then(done).catch(done);
          else done();
        } catch (e) {
          done();
        }
      });
    }
    var cc = $("s-cover-clear");
    if (cc && !cc.dataset.wired) {
      cc.dataset.wired = "1";
      cc.addEventListener("click", function() {
        var box = window.ImgStore;
        if (!box || !box._entries || !box.removeMany) return;
        box._entries().then(function(list) {
          var keys = [], bytes = 0;
          for (var i = 0; i < list.length; i++) {
            var k = String(list[i] && list[i].key || list[i] || "");
            if (k.indexOf("cover:") === 0) {
              keys.push(k);
              bytes += list[i] && list[i].size || 0;
            }
          }
          var done = function() {
            try {
              if (window.TsumuPlayer && TsumuPlayer.clearCoverCache) TsumuPlayer.clearCoverCache();
            } catch (e) {
            }
            renderImgStatus(T(
              "settings.coverCleared",
              "已清理封面缓存（{n} 张 · 约 {m} MB）",
              { n: keys.length, m: (bytes / 1048576).toFixed(1) }
            ));
          };
          if (!keys.length) {
            done();
            return;
          }
          Promise.resolve(box.removeMany(keys)).then(done).catch(done);
        }).catch(function() {
          renderImgStatus(T("settings.coverCleared", "已清理封面缓存（{n} 张 · 约 {m} MB）", { n: 0, m: "0.0" }));
        });
      });
    }
    if (clr && !clr.dataset.wired) {
      clr.dataset.wired = "1";
      clr.addEventListener("click", function() {
        if (!window.ImgStore) return;
        ImgStore.clear().then(function() {
          renderImgStatus(T("settings.imgCleared", "已清空图片缓存"));
        }).catch(function() {
          renderImgStatus(T("settings.imgCleared", "已清空图片缓存"));
        });
      });
    }
    renderImgStatus();
  }
  function wireImgProtect() {
    try {
      if (!window.ImgStore || !ImgStore.setProtected) return;
      ImgStore.setProtected(function(id) {
        try {
          var c = window.DialogLog ? DialogLog.get(id) : null;
          return !!(c && c.fav);
        } catch (e) {
          return false;
        }
      });
    } catch (e) {
    }
  }
  function gatherExtra(text) {
    var jobs = [];
    var prop = "";
    var wx = window.Weather, ws = window.WebSrc;
    var prevTurn = "";
    try {
      if (window.DialogLog && DialogLog.list) {
        var lastCard = DialogLog.list({})[0];
        if (lastCard && lastCard.user) prevTurn = String(lastCard.user);
      }
    } catch (e) {
      prevTurn = "";
    }
    try {
      if (wx && wx.matches(text) && wx.configured()) {
        setStatus("status.checkingWeather");
        prop = wx.prop || prop;
        jobs.push(wx.brief().catch(function() {
          return "";
        }));
      }
    } catch (e) {
    }
    try {
      if (ws && ws.matches(text) && ws.configured()) {
        setStatus("status.searching");
        if (!prop) prop = ws.prop || "";
        jobs.push(ws.search(text, prevTurn).catch(function() {
          return "";
        }));
      }
    } catch (e) {
    }
    try {
      var rc = window.Recall;
      if (rc && rc.matches(text) && rc.configured()) {
        setStatus("status.recalling");
        jobs.push(rc.search(text, null, prevTurn).catch(function() {
          return "";
        }));
      }
    } catch (e) {
    }
    if (!jobs.length) return Promise.resolve({ extra: "", prop: "" });
    return Promise.all(jobs).then(function(parts) {
      return { extra: parts.filter(Boolean).join("\n\n"), prop };
    });
  }
  var _propTimer = 0, _propWait = 0;
  function cancelPropTimer() {
    if (_propTimer) {
      clearTimeout(_propTimer);
      _propTimer = 0;
    }
    _propWait = 0;
  }
  function armPropTimer() {
    cancelPropTimer();
    var ms = emoHoldMs();
    if (!ms) return;
    function fire() {
      _propTimer = 0;
      var L = window.TsumuL2d;
      if (!L || !L.model || !L.model.restoreProp) return;
      if (ttsSpeaking() && _propWait < 30) {
        _propWait++;
        _propTimer = setTimeout(fire, 1e3);
        return;
      }
      try {
        if (!L.model.propIsOurs || L.model.propIsOurs()) {
          L.model.restoreProp();
          if (L.syncExprPanel) L.syncExprPanel();
        }
      } catch (e) {
      }
      cancelPropTimer();
    }
    _propTimer = setTimeout(fire, ms);
  }
  function applyProp(name) {
    try {
      var L = window.TsumuL2d;
      if (!L || !L.model) return;
      if (name && L.model.useProp) {
        if (L.model.useProp(name)) armPropTimer();
      } else if (L.model.restoreProp) {
        cancelPropTimer();
        L.model.restoreProp();
      }
      if (L.syncExprPanel) L.syncExprPanel();
    } catch (e) {
    }
  }
  function wireStoreWarn() {
    if (!window.SafeStore || !SafeStore.onWarn) return;
    SafeStore.onWarn(function(kind) {
      if (kind === "full") {
        hint(T("store.full", "⚠️ 存储空间已满，这次的内容【没能保存】—— 建议导出备份后清理"), true);
      } else {
        var p = Math.round((SafeStore.ratio() || 0) * 100);
        hint(T("store.near", "⚠️ 本地存储已用 {p}%，建议导出备份", { p }), true);
      }
    });
  }
  var _pendingImg = "";
  function setPendingImg(dataUrl) {
    _pendingImg = dataUrl || "";
    var box = $("img-preview"), th = $("img-preview-thumb");
    if (!box) return;
    if (_pendingImg) {
      if (th) th.src = _pendingImg;
      box.classList.remove("hidden");
    } else {
      box.classList.add("hidden");
      if (th) {
        try {
          th.removeAttribute("src");
        } catch (e) {
        }
      }
    }
  }
  function addImageFile(file) {
    if (!file) return;
    if (file.type && file.type.indexOf("image/") !== 0) {
      hint(T("chat.imgNotImage", "这不是图片文件"), true);
      return;
    }
    if (!window.ImgStore || !ImgStore.compress) {
      hint(T("chat.imgNoStore", "图片存储还没就绪"), true);
      return;
    }
    setStatus("status.imgBusy");
    ImgStore.compress(file).then(function(r) {
      setStatus("status.ready");
      if (!r || !r.dataUrl) {
        hint(T("chat.imgFail", "这张图处理失败（格式可能不支持）"), true);
        return;
      }
      setPendingImg(r.dataUrl);
      hint(T("chat.imgReady", "图片已就绪，点发送一起发出去"));
    }).catch(function() {
      setStatus("status.ready");
      hint(T("chat.imgFail", "这张图处理失败（格式可能不支持）"), true);
    });
  }
  function wireImage() {
    var btn = $("btn-img"), fi = $("img-file"), drop = $("btn-img-drop");
    if (btn && !btn.dataset.wired) {
      btn.dataset.wired = "1";
      btn.addEventListener("click", function() {
        if (fi) fi.click();
      });
    }
    if (fi && !fi.dataset.wired) {
      fi.dataset.wired = "1";
      fi.addEventListener("change", function() {
        var f = fi.files && fi.files[0];
        fi.value = "";
        if (f) addImageFile(f);
      });
    }
    if (drop && !drop.dataset.wired) {
      drop.dataset.wired = "1";
      drop.addEventListener("click", function() {
        setPendingImg("");
      });
    }
    var inp = $("input");
    if (inp && !inp.dataset.wiredImg) {
      inp.dataset.wiredImg = "1";
      inp.addEventListener("paste", function(ev) {
        try {
          var items = ev.clipboardData && ev.clipboardData.items || [];
          for (var i = 0; i < items.length; i++) {
            if (items[i].type && items[i].type.indexOf("image/") === 0) {
              var f = items[i].getAsFile();
              if (f) {
                ev.preventDefault();
                addImageFile(f);
                return;
              }
            }
          }
        } catch (e) {
        }
      });
    }
  }
  function send() {
    if (busy) return;
    var input = $("input");
    var text = buildMessage();
    var img = _pendingImg;
    if (!text && !img) return;
    var imgForLog = img;
    var c = cfg();
    if (!c.llm.apiKey) {
      setStatus("status.needLlmKey", true);
      openSettings();
      return;
    }
    busy = true;
    $("btn-send").disabled = true;
    input.value = "";
    var narrEl = $("input-narr");
    if (narrEl) narrEl.value = "";
    autogrow();
    var textForLog = text || T("chat.imgOnly", "（没说话，只是发了张图）");
    addMsg("me", text, img);
    setPendingImg("");
    var bubble = addMsg("ai", "…");
    setStatus("status.thinking");
    gatherExtra(text).then(function(g) {
      applyProp(g.prop);
      setStatus("status.thinking");
      return Api.chat(history.slice(), textForLog, {
        mode: c.state.mode || "chat",
        style: c.state.style || "voice",
        lang: c.llm.lang && c.llm.lang !== "auto" ? c.llm.lang : void 0,
        extra: g.extra,

        image: imgForLog,

        onProgress: function(acc) {
          _streamShow(bubble, acc);
        }
      });
    }).then(function(reply) {
      busy = false;
      $("btn-send").disabled = false;
      _streamStopIndicator();
      var out = reply && reply.text ? reply.text : "";
      if (!out) {
        setMsg(bubble, T("chat.emptyReply"));
        setStatus("status.emptyReply", true);
        return;
      }
      var shown = displayOf(out);
      var spoken = speakOf(out);
      if (reply && reply.memo) {
        try {
          if (window.LongMem && LongMem.remember) LongMem.remember(reply.memo);
        } catch (e) {
        }
      }
      function commit(finalShown, spokenOverride) {
        setMsg(bubble, finalShown);
        try {
          bubble.dataset.raw = out;
        } catch (e) {
        }
        history.push({ role: "user", content: textForLog });
        history.push({ role: "assistant", content: out });
        if (history.length > 80) history = history.slice(-80);
        var card = window.DialogLog ? DialogLog.add(textForLog, finalShown, spokenOverride != null ? spokenOverride : spoken, out) : null;
        try {
          if (card && imgForLog && window.ImgStore && ImgStore.dataUrlToBlob) {
            var blob = ImgStore.dataUrlToBlob(imgForLog);
            if (blob) {
              ImgStore.put(card.id, blob).then(function(ok) {
                if (ok && window.DialogLog && DialogLog.setImg) DialogLog.setImg(card.id, card.id);
              }).catch(function() {
              });
            }
          }
        } catch (e) {
        }
        if (window.LongMem) {
          let zhForMem = "";
          try {
            zhForMem = window.Segments && Segments.displayText ? String(Segments.displayText(spoken || out, "", { showOriginal: false }) || "") : "";
          } catch (e) {
            zhForMem = "";
          }
          try {
            LongMem.ingest(textForLog, spoken || out, zhForMem);
          } catch (e) {
          }
          renderLongMem();
        }
        if (window.Diary && isDiary()) {
          try {
            Diary.ingest(textForLog, finalShown);
          } catch (e) {
          }
        }
        try {
          var L = window.TsumuL2d;
          if (L && L.model && reply && reply.emotion && L.model.applyLlmEmotion) {
            var applied = L.model.applyLlmEmotion(reply.emotion);
            if (applied && !applied.unchanged && L.syncExprPanel) L.syncExprPanel();
            if (applied && !applied.unchanged) armEmoTimer(applied.preset);
          }
        } catch (e) {
        }
        setStatus(isAsmr() ? "ui.modeAsmr" : "status.ready");
        speak(spokenOverride != null ? spokenOverride : spoken, card ? card.id : null);
      }
      if (needTranslateFallback(out)) {
        setStatus("status.thinking");
        Api.translate(spoken || out, Langs.translate()).then(function(jp) {
          var t = String(jp == null ? "" : jp).trim();
          if (!t || t === spoken || t === out) {
            commit(shown);
            return;
          }
          commit(shown, "织音：" + t);
        }).catch(function() {
          commit(shown);
        });
        return;
      }
      commit(shown);
    }).catch(function(e) {
      busy = false;
      $("btn-send").disabled = false;
      var msg = e && e.message ? e.message : String(e);
      setMsg(bubble, T("chat.requestFail", "请求失败：{e}", { e: msg }));
      setStatus("status.fail", true);
      if (msg === "NO_KEY") openSettings();
    });
  }
  function voiceIdOf(tts) {
    if (tts.provider === "fish") return tts.fishVoice || "";
    if (tts.provider === "qwen") return tts.qwenVoice || "";
    return tts.presetVoice || "";
  }
  function voiceIdAsmrOf(tts) {
    if (tts.provider === "fish") return tts.fishVoiceAsmr || "";
    return "";
  }
  function ttsLang() {
    try {
      var v = String((Config.section("tts") || {}).lang || "auto");
      if (v === "ja" || v === "en" || v === "zh") return v;
      var t = typeof Langs !== "undefined" && Langs.translate ? String(Langs.translate() || "zh") : "zh";
      return t === "ja" || t === "en" ? t : "zh";
    } catch (e) {
      return "zh";
    }
  }
  function ttsJaOn() {
    try {
      var v = String((Config.section("tts") || {}).lang || "auto");
      return v === "ja";
    } catch (e) {
      return false;
    }
  }
  function voiceReadOn() {
    try {
      var el = $("s-tts-on");
      if (el) return !!el.checked;
      return String((Config.section("tts") || {}).mode || "preset") !== "off";
    } catch (e) {
      return true;
    }
  }
  function ttsTranslateLang() {
    return voiceReadOn() ? ttsLang() : "zh";
  }
  function fillLangSelects() {
    var ui = $("s-lang-ui");
    if (ui && !ui.options.length && window.I18n && I18n.LANGS) {
      I18n.LANGS.forEach(function(l) {
        var opt = document.createElement("option");
        opt.value = l.id;
        opt.textContent = l.label;
        ui.appendChild(opt);
      });
    }
  }
  function refreshLangSelects() {
  }
  function applyLang() {
    var lg = (Config.section("app") || {}).lang || "zh";
    if (window.I18n) {
      I18n.setLang(lg);
      try {
        document.documentElement.lang = lg === "zh-tw" ? "zh-Hant" : lg;
      } catch (e) {
      }
      if (I18n.apply) I18n.apply(document);
    }
    refreshLangSelects();
    syncAsmrBtn();
    syncDiaryBtn();
    paintStatus();
    syncTtsFields();
    try {
      if (window.TsumuL2d && TsumuL2d.refreshTexts) TsumuL2d.refreshTexts();
    } catch (e) {
    }
    try {
      refreshFeatureTexts();
    } catch (e) {
    }
  }
  function closeOtherCards(exceptId) {
    ["settings", "memory", "diary", "todo", "pomo"].forEach(function(id) {
      if (id === exceptId) return;
      var b = $(id);
      if (b && !b.classList.contains("hidden")) b.classList.add("hidden");
    });
  }
  function shellMorph(b, back) {
    if (!b || !b.animate) return;
    try {
      if (b.__morphAnim) {
        try {
          b.__morphAnim.cancel();
        } catch (e) {
        }
        b.__morphAnim = null;
      }
      var cs = getComputedStyle(b);
      var dur = parseFloat(cs.getPropertyValue("--dur-6")) || 300;
      var easeIn = (cs.getPropertyValue("--ease-enter") || "cubic-bezier(.2,.8,.25,1)").trim();
      var ease = back ? "cubic-bezier(.75, 0, .8, .2)" : easeIn;
      var from = { transform: "scale(.2)" };
      var to = { transform: "none" };
      var kf = back ? [to, from] : [from, to];
      b.__morphAnim = b.animate(kf, { duration: dur, easing: ease, fill: "both" });
      b.__morphAnim.addEventListener("finish", function() {
        try {
          b.__morphAnim.cancel();
        } catch (e) {
        }
      });
    } catch (e) {
    }
  }
  function hideCardNow(id) {
    var b = $(id);
    if (!b) return;
    b.classList.add("closing");
    shellMorph(b, true);
    b.classList.add("hidden");
    setTimeout(function() {
      b.classList.remove("closing");
    }, 420);
  }
  function showCardAfterLayout(id) {
    var b = $(id);
    if (!b) return;
    b.classList.remove("closing");
    b.classList.add("card-morphing");
    shellMorph(b, false);
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        b.classList.remove("hidden");
      });
    });
    setTimeout(function() {
      b.classList.remove("card-morphing");
    }, 180);
  }
  function texTierAvailable(ref) {
    var s = String(ref == null ? "" : ref);
    return s.indexOf("idb:") !== 0;
  }
  function syncTexTierRow() {
    var ref = "";
    try {
      ref = window.TsumuL2d && window.TsumuL2d.modelRefOf ? window.TsumuL2d.modelRefOf() : "";
    } catch (e) {
      ref = "";
    }
    var show = texTierAvailable(ref);
    var sel = $("s-tex-tier");
    if (sel) {
      sel.disabled = !show;
      try {
        sel.title = show ? "" : T(
          "settings.texTierNote",
          "当前用的是导入模型：贴图档位只对内置模型可用，所以这里暂不可选。"
        );
      } catch (e) {
      }
    }
    var row = $("s-tex-row");
    if (row) {
      try {
        row.classList.toggle("tex-off", !show);
      } catch (e) {
      }
    }
    var note = $("s-tex-note");
    if (note) {
      try {
        note.classList.toggle("hidden", show);
      } catch (e) {
      }
    }
  }
  function openSettings() {
    closeOtherCards("settings");
    var c = cfg();
    try {
      var eh = $("s-expr-hold");
      if (eh) eh.value = String(c.app.exprHold == null ? 20 : c.app.exprHold);
    } catch (e) {
    }
    try {
      var w = c.web || {};
      var we1 = $("s-web-city");
      if (we1) we1.value = w.city || "";
      var we2 = $("s-web-provider");
      if (we2 && w.searchProvider) we2.value = w.searchProvider;
      var we3 = $("s-web-key");
      if (we3) we3.value = w.searchKey || "";
    } catch (e) {
    }
    try {
      var ik2 = $("s-img-keep");
      if (ik2) ik2.value = String(c.app.imageKeepMB == null ? 200 : c.app.imageKeepMB);
      if (window.ImgStore && typeof renderImgStatus === "function") renderImgStatus();
    } catch (e) {
    }
    renderWebStatus();
    try {
      syncWebKeyPh();
    } catch (e) {
    }
    try {
      renderL2dCap();
    } catch (e) {
    }
    try {
      renderModelList();
    } catch (e) {
    }
    try {
      renderExprMap();
    } catch (e) {
    }
    $("s-llm-url").value = c.llm.baseUrl || "";
    $("s-llm-key").value = c.llm.apiKey || "";
    $("s-llm-model").value = c.llm.model || "";
    try {
      $("s-llm-max").value = String(c.llm.maxTokens || 1200);
    } catch (e) {
    }
    $("s-tts-provider").value = c.tts.provider || "fish";
    $("s-tts-url").value = ttsUrlOf(c.tts);
    $("s-tts-key").value = ttsKeyOf(c.tts);
    $("s-tts-model").value = ttsModelOf(c.tts);
    $("s-tts-voiceid").value = voiceIdOf(c.tts);
    $("s-tts-voiceid-asmr").value = voiceIdAsmrOf(c.tts);
    $("s-tts-on").checked = c.tts.mode !== "off";
    try {
      var sl = $("s-tts-lang");
      if (sl) sl.value = ttsLang();
    } catch (e) {
    }
    $("s-lang-ui").value = c.app.lang || "zh";
    if ($("s-tex-tier") && window.TsumuL2d && window.TsumuL2d.texTierOf) {
      $("s-tex-tier").value = window.TsumuL2d.texTierOf();
    }
    syncTexTierRow();
    fillPromptFields();
    renderLongMem();
    try {
      renderArchiveList();
    } catch (e) {
    }
    renderSlots();
    syncTtsFields();
    morphCardFor("settings", "btn-settings");
    showCardAfterLayout("settings");
    hint("");
  }
  function closeSettings() {
    setTimeout(function() {
      if (typeof saveSettings === "function") {
        try {
          saveSettings({ silent: true });
        } catch (e) {
        }
      }
    }, 400);
    morphCardFor("settings", "btn-settings");
    hideCardNow("settings");
  }
  function ttsUrlOf(tts) {
    if (tts.provider === "qwen") return tts.qwenBaseUrl || "";
    if (tts.provider === "fish") return tts.fishBaseUrl || "";
    return tts.baseUrl || "";
  }
  function ttsKeyOf(tts) {
    if (tts.provider === "qwen") return tts.qwenApiKey || "";
    if (tts.provider === "fish") return tts.fishApiKey || "";
    return tts.apiKey || "";
  }
  function ttsModelOf(tts) {
    if (tts.provider === "qwen") return tts.qwenModel || "";
    if (tts.provider === "fish") return tts.fishModel || "";
    return tts.modelPreset || "";
  }
  function syncTtsFields() {
    if (!$("s-tts-provider")) return;
    var v = $("s-tts-provider").value;
    var ph = v === "qwen" ? "qwen3-tts-flash" : v === "fish" ? "s2.1-pro-free" : "tts-1";
    $("s-tts-model").placeholder = ph;
    var asmrEl = $("s-tts-voiceid-asmr");
    var isFish = v === "fish";
    asmrEl.disabled = !isFish;
    asmrEl.parentElement.style.opacity = isFish ? "1" : ".45";
    asmrEl.placeholder = T(isFish ? "settings.voiceIdAsmrPh" : "settings.voiceIdAsmrFishOnly");
  }
  function hint(t, bad) {
    var el = $("settings-hint");
    el.textContent = t || "";
    el.className = "hint" + (bad ? " bad" : "");
  }
  function saveSettings(opts) {
    var silent = !!(opts && opts.silent);
    try {
      var uiLang = $("s-lang-ui").value || "zh";
      Config.set("app.lang", uiLang);
      Config.set("llm.baseUrl", $("s-llm-url").value.trim());
      Config.set("llm.apiKey", $("s-llm-key").value.trim());
      Config.set("llm.model", $("s-llm-model").value.trim());
      try {
        Config.set("llm.maxTokens", Math.max(64, parseInt($("s-llm-max").value, 10) || 400));
      } catch (e) {
      }
      var _vl = ttsLang();
      Config.set("llm.lang", "zh");
      Config.set("translate.lang", ttsTranslateLang());
      Config.set("tts.lang", _vl);
      var prov = $("s-tts-provider").value;
      var url = $("s-tts-url").value.trim();
      var key = $("s-tts-key").value.trim();
      var model = $("s-tts-model").value.trim();
      var vid = $("s-tts-voiceid").value.trim();
      var vidAsmr = $("s-tts-voiceid-asmr").value.trim();
      Config.set("tts.provider", prov);
      Config.set("tts.mode", $("s-tts-on").checked ? "preset" : "off");
      if (prov === "qwen") {
        Config.set("tts.qwenBaseUrl", url);
        Config.set("tts.qwenApiKey", key);
        Config.set("tts.qwenModel", model);
        Config.set("tts.qwenVoice", vid || "Cherry");
      } else if (prov === "fish") {
        Config.set("tts.fishBaseUrl", url);
        Config.set("tts.fishApiKey", key);
        Config.set("tts.fishModel", model || "s2.1-pro-free");
        Config.set("tts.fishVoice", vid);
        Config.set("tts.fishVoiceAsmr", vidAsmr);
      } else {
        Config.set("tts.baseUrl", url);
        Config.set("tts.apiKey", key);
        Config.set("tts.modelPreset", model);
        Config.set("tts.presetVoice", vid || "alloy");
      }
      if (Config.save) Config.save();
      savePromptFields();
      applyLang();
      if (!silent) {
        hint(T("toast.saved", "已保存"));
        setStatus(isAsmr() ? "ui.modeAsmr" : "status.ready");
        setTimeout(closeSettings, 400);
      }
    } catch (e) {
      hint(T("settings.saveFail", "保存失败：{e}", { e: e && e.message ? e.message : e }), true);
    }
  }
  var _streamLastShown = "";
  function _streamIndicator() {
  }
  function _streamPortion(raw) {
    var txt = String(raw == null ? "" : raw);
    if (!txt) return null;
    if (isTagLine(txt) && txt.indexOf("]") < 0 && txt.indexOf("］") < 0 && txt.indexOf("】") < 0) return null;
    var lines = txt.split("\n");
    var kept = [], sawLabel = false, sawTrans = false, inTag = false;
    for (var i = 0; i < lines.length; i++) {
      var t = String(lines[i]).trim();
      if (!t) continue;
      if (isTagLine(t)) {
        inTag = t.indexOf("]") < 0 && t.indexOf("］") < 0 && t.indexOf("】") < 0;
        continue;
      }
      if (inTag) {
        if (t.indexOf("]") >= 0 || t.indexOf("］") >= 0 || t.indexOf("】") >= 0) inTag = false;
        continue;
      }
      if (/^(?:译文|譯文|訳文)\s*[：:]/.test(t)) {
        sawTrans = true;
        continue;
      }
      if (i === lines.length - 1 && t.indexOf("\n") < 0 && !sawLabel) {
        if (/^[旁织译譯訳]$/.test(t)) return null;
        if (/^(?:旁白|织音|译文|譯文|訳文)\s*[：:]?\s*$/.test(t)) return null;
        if (/^(?:译文|譯文|訳文)\s*[：:]/.test(t)) return null;
      }
      if (/^(?:旁白|织音)\s*[：:]/.test(t)) {
        kept.push(t);
        sawLabel = true;
        sawTrans = false;
        continue;
      }
      if (sawTrans) continue;
      kept.push(t);
    }
    if (!kept.length) return null;
    return kept.join("\n");
  }
  function _streamShow(bubble, raw) {
    if (!bubble) return;
    var part = _streamPortion(raw);
    if (part == null) return _streamIndicator(bubble);
    var shownTxt = "";
    try {
      shownTxt = displayOf(part) || part;
    } catch (e) {
      shownTxt = part;
    }
    if (!shownTxt || shownTxt === _streamLastShown) return;
    _streamLastShown = shownTxt;
    setMsg(bubble, shownTxt + "…");
  }
  function _streamStopIndicator() {
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function(c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }
  function stamp(ms) {
    var d = new Date(ms || Date.now());
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }
  function fillPromptFields() {
    var p = {};
    try {
      p = Config.section("prompt") || {};
    } catch (e) {
    }
    var c = $("s-prompt-chara"), w = $("s-prompt-world");
    if (c) c.value = p.chara || (window.Prompts ? Prompts.DEFAULT_CHARA || "" : "");
    if (w) w.value = p.world || (window.Prompts ? Prompts.DEFAULT_WORLD || "" : "");
    renderPromptState();
  }
  function renderPromptState() {
    if (!window.Prompts) return;
    var c = $("prompt-state-chara"), w = $("prompt-state-world");
    if (c) c.textContent = T(Prompts.isCharaCustom() ? "prompt.custom" : "prompt.builtin");
    if (w) w.textContent = T(Prompts.isWorldCustom() ? "prompt.custom" : "prompt.builtin");
  }
  function savePromptFields() {
    if (!window.Prompts) return;
    var c = $("s-prompt-chara"), w = $("s-prompt-world");
    if (c) Prompts.setChara(c.value);
    if (w) Prompts.setWorld(w.value);
    renderPromptState();
  }
  function renderLongMem() {
    var box = $("ltm-list"), st = $("ltm-state"), on = $("s-ltm-on");
    if (!window.LongMem) return;
    if (on) on.checked = LongMem.enabled() !== false;
    var lines = [];
    try {
      lines = LongMem.readableLines() || [];
    } catch (e) {
      lines = [];
    }
    var digest = "";
    try {
      digest = LongMem.digest() || "";
    } catch (e) {
    }
    if (!lines.length && !digest) {
      if (box) box.textContent = T("settings.longtermEmpty", "暂无记忆 · 每 4 轮对话自动整理");
    } else if (box) {
      var html = lines.map(function(s) {
        var star = Number(s && s.importance) >= 5 ? "★ " : "";
        return esc(star + String(s && s.date || "") + " ・ " + String(s && s.summary || ""));
      }).join("\n");
      if (digest) {
        html += (html ? "\n\n" : "") + esc("【" + T("ltm.digestLabel", "概略") + "】") + "\n" + esc(digest);
      }
      box.textContent = html;
    }
    if (st) {
      var n = lines.length, d = digest.length;
      var pend = 0;
      try {
        pend = LongMem.pendingTurns() || 0;
      } catch (e) {
      }
      var fails = 0, writer = "";
      try {
        fails = LongMem.failCount() || 0;
      } catch (e) {
      }
      try {
        writer = LongMem.writer() || "";
      } catch (e) {
      }
      st.textContent = T("settings.longtermSummary", "共 {n} 条 · 概略 {d} 字", { n, d }) + (pend ? " · " + T("memory.pending", "未总结 {n} 轮", { n: pend }) : "") + (writer ? " · " + T("settings.ltmWriter", "上次整理：{m}", { m: writer }) : "") + (fails >= 3 ? "\n" + T(
        "settings.ltmFails",
        "⚠️ 最近连续 {n} 次整理失败 —— 当前模型可能不适配，点下面的「测试模型适配」看看",
        { n: fails }
      ) : "");
    }
  }
  var _archiveArm = 0, _archiveTimer = null;
  function renderArchiveList(msg) {
    var box = $("archive-list"), st = $("archive-state");
    if (!box) return;
    var arch = [];
    try {
      arch = window.LongMem && LongMem.archive && LongMem.archive() || [];
    } catch (e) {
      arch = [];
    }
    if (!arch.length) {
      box.textContent = T(
        "settings.archiveEmpty",
        "还没有重要回忆。聊到「第一次一起… / 承诺 / 告白 / 记住这个」之后，整理时就会记下来。"
      );
    } else {
      var show = arch.map(function(e, i) {
        return {
          date: String(e.date == null ? "" : e.date),
          said_at: String(e.said_at == null ? "" : e.said_at),
          refs: Number(e.refs) || 1,

          seq: Number(e.seq) || 0,
          _i: i,
          raw: e
        };
      }).sort(LongMem.displayOrderCmp || function(a, b) {
        return String(b.date || "").localeCompare(String(a.date || ""));
      }).map(function(o) {
        return o.raw;
      });
      box.textContent = show.map(function(e) {
        var s = "★ " + String(e.date || "") + " ・ " + String(e.summary || "");
        if (e.feeling) s += "\n　　（" + String(e.feeling) + "）";
        return s;
      }).join("\n");
    }
    if (st) {
      st.textContent = T("settings.archiveCount", "共 {n} 条", { n: arch.length }) + (msg ? "　·　" + msg : "");
    }
    var us = $("ultra-state");
    if (us) {
      var pend2 = 0, left = 0, writer2 = "", fails2 = 0;
      try {
        pend2 = LongMem.pendingTurns() || 0;
      } catch (e) {
      }
      try {
        var raw2 = (Config.section("longterm") || {}).everyTurns;
        var ev2 = parseInt(raw2, 10);
        ev2 = ev2 === ev2 && ev2 >= 1 && ev2 <= 50 ? ev2 : 4;
        left = Math.max(0, ev2 - pend2);
      } catch (e) {
        left = 0;
      }
      try {
        writer2 = LongMem.writer() || "";
      } catch (e) {
      }
      try {
        fails2 = LongMem.failCount() || 0;
      } catch (e) {
      }
      var line = T("memory.pending", "未总结 {n} 轮", { n: pend2 });
      if (left > 0) {
        line += "（再聊 {n} 轮自动整理）".replace("{n}", String(left));
      } else if (pend2 > 0) {
        line += "（下一轮就会自动整理）";
      }
      if (writer2) line += " · " + T("settings.ltmWriter", "上次整理：{m}", { m: writer2 });
      if (fails2 >= 3) {
        line += "\n" + T(
          "settings.ltmFails",
          "⚠️ 最近连续 {n} 次整理失败 —— 当前模型可能不适配，点上面的「测试模型适配」看看",
          { n: fails2 }
        );
      }
      us.textContent = line;
    }
  }
  function toggleArchiveView() {
    var box = $("archive-box"), btn = $("btn-archive-view");
    if (!box) return;
    var show = box.style.display === "none";
    box.style.display = show ? "" : "none";
    if (btn) {
      btn.textContent = T(
        show ? "settings.archiveHide" : "settings.archiveView",
        show ? "收起" : "查看"
      );
    }
    if (show) renderArchiveList();
  }
  function toggleLtmView() {
    var box = $("ltm-box"), btn = $("btn-ltm-view");
    if (!box) return;
    var show = box.style.display === "none";
    box.style.display = show ? "" : "none";
    if (btn) {
      btn.textContent = T(
        show ? "settings.archiveHide" : "settings.archiveView",
        show ? "收起" : "查看"
      );
    }
    if (show) renderLongMem();
  }
  function testModelFit(btn) {
    if (!window.LongMem || !LongMem.selfTest) return;
    var box = $("ltm-selftest");
    if (box) box.textContent = T("settings.selftestRunning", "正在测试当前模型…（会发 3 个很小的请求）");
    if (btn) btn.disabled = true;
    LongMem.selfTest().then(function(rows) {
      if (!box) return;
      var allOk = rows.length > 0 && rows.every(function(r) {
        return r.ok;
      });
      box.textContent = rows.map(function(r) {
        return (r.ok ? "✅ " : "❌ ") + T("settings.selftest." + r.key, r.key) + "：" + r.note;
      }).join("\n") + "\n" + (allOk ? T("settings.selftestAllOk", "三项都过 ⇒ 当前模型可以正常维护长期记忆 ✓") : T(
        "settings.selftestSomeBad",
        "★ 有项目没过 —— 长期记忆可能会退化成概略散文，建议换回原来的模型 ✓"
      ));
      renderLongMem();
    }).catch(function(e) {
      if (box) box.textContent = "❌ " + (e && e.message || e);
    }).then(function() {
      if (btn) btn.disabled = false;
    });
  }
  function flushLongMem(btn) {
    if (!window.LongMem) return;
    var st = $("ltm-state");
    if (st) st.textContent = T("ltm.consolidating", "整理中…");
    var us = $("ultra-state");
    if (us) us.textContent = T("ltm.consolidating", "整理中…");
    if (btn) btn.disabled = true;
    LongMem.flushNow().then(function() {
      if (btn) btn.disabled = false;
      renderLongMem();
      try {
        renderArchiveList();
      } catch (e) {
      }
    }).catch(function() {
      if (btn) btn.disabled = false;
      if (st) st.textContent = T("ltm.failed", "整理失败，已保留原记忆");
      if (us) us.textContent = T("ltm.failed", "整理失败，已保留原记忆");
    });
  }
  var _todoWired = false, _todoClearArm = 0;
  var _todoOriginId = "btn-todo";
  function todoMs(name, dflt) {
    try {
      var v = String(getComputedStyle(document.documentElement).getPropertyValue(name) || "");
      var n = parseFloat(v);
      if (!n) return dflt;
      return v.indexOf("ms") >= 0 ? n : n * 1e3;
    } catch (e) {
      return dflt;
    }
  }
  function todoEase(name, dflt) {
    try {
      var v = String(getComputedStyle(document.documentElement).getPropertyValue(name) || "").trim();
      return v || (dflt || "cubic-bezier(.2,.8,.25,1)");
    } catch (e) {
      return dflt || "cubic-bezier(.2,.8,.25,1)";
    }
  }
  function todoState(text) {
    var el = $("todo-state");
    if (el) el.textContent = text || "";
  }
  function todoStateUndo(text, undoText, fn) {
    var el = $("todo-state");
    if (!el) return;
    el.innerHTML = "";
    el.appendChild(document.createTextNode(text));
    var b = document.createElement("button");
    b.type = "button";
    b.className = "mini-btn";
    b.textContent = undoText;
    b.addEventListener("click", function() {
      fn();
    }, { once: true });
    el.appendChild(b);
  }
  function todoOrigin(origin) {
    if (origin && origin.id) return origin.id;
    return "btn-todo";
  }
  function openTodo(origin) {
    closeOtherCards("todo");
    var box = $("todo");
    if (!box) return;
    _todoOriginId = todoOrigin(origin);
    morphCardFor("todo", _todoOriginId);
    showCardAfterLayout("todo");
    _todoDraft = false;
    renderTodo();
    updateTodoIcon();
    todoState(T("todo.hint", "向左滑动一条可以删除"));
  }
  function closeTodo() {
    var b = $("todo");
    if (b) {
      morphCardFor("todo", _todoOriginId);
      hideCardNow("todo");
    }
  }
  function todoRow(it) {
    var row = document.createElement("div");
    row.className = "todo-row" + (it.done ? " done" : "");
    row.setAttribute("data-id", it.id);
    var cb = document.createElement("button");
    cb.type = "button";
    cb.className = "todo-check";
    cb.setAttribute("aria-label", T("todo.toggle", "勾选"));
    cb.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.6L10 17.4L19 7.4"></path></svg>';
    cb.addEventListener("click", function(ev) {
      ev.stopPropagation();
      Todo.toggle(it.id);
    });
    var tx = document.createElement("span");
    tx.className = "todo-text";
    tx.textContent = it.text;
    tx.title = T("todo.editTip", "点一下修改");
    tx.addEventListener("click", function(ev) {
      ev.stopPropagation();
      todoEditRow(row, it);
    });
    row.appendChild(cb);
    row.appendChild(tx);
    todoSwipe(row, it);
    return row;
  }
  function todoEditRow(row, it) {
    if (!row || row.querySelector("input.todo-edit")) return;
    var tx = row.querySelector(".todo-text");
    if (!tx) return;
    var inp = document.createElement("input");
    inp.type = "text";
    inp.className = "todo-edit";
    inp.maxLength = 120;
    inp.value = it.text;
    var finished = false;
    var back = function() {
      if (finished) return;
      finished = true;
      renderTodo();
    };
    var save = function() {
      if (finished) return;
      finished = true;
      var v = String(inp.value == null ? "" : inp.value).trim();
      if (!v || v === it.text) {
        renderTodo();
        return;
      }
      Todo.edit(it.id, v);
      todoState(T("todo.edited", "已修改"));
    };
    inp.addEventListener("keydown", function(ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        save();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        back();
      }
    });
    inp.addEventListener("blur", save);
    tx.parentNode.replaceChild(inp, tx);
    try {
      inp.focus();
      inp.select();
    } catch (e) {
    }
  }
  function todoReleaseLayer(row, delayMs) {
    if (!row) return;
    setTimeout(function() {
      try {
        row.style.willChange = "";
        if (!row.style.transform) row.style.transition = "";
      } catch (e) {
      }
    }, Math.max(0, delayMs || 0));
  }
  function todoExitMs(v) {
    var base = todoMs("--dur-4", 220);
    var speed = Math.abs(v || 0);
    if (speed > 1.2) return Math.max(140, base - 80);
    if (speed > 0.5) return Math.max(160, base - 40);
    return base;
  }
  function todoSwipe(row, it) {
    var pid = null, x0 = 0, y0 = 0, dx = 0, lock = "", moved = false, done = false, finalized = false;
    var lastT = 0, lastX = 0, vel = 0;
    var TH = 96, MAXPULL = 240, DAMP = 0.35;
    function paint(x, animate, ease) {
      row.style.transition = animate ? "transform " + todoMs("--dur-4", 220) + "ms " + ease + ", opacity " + todoMs("--dur-4", 220) + "ms " + ease : "none";
      row.style.transform = x ? "translateX(" + x + "px)" : "";
      row.style.opacity = x ? String(Math.max(0.4, 1 - Math.abs(x) / (MAXPULL * 2.2))) : "";
    }
    row.addEventListener("pointerdown", function(ev) {
      if (ev.button != null && ev.button !== 0) return;
      pid = ev.pointerId;
      x0 = ev.clientX;
      y0 = ev.clientY;
      dx = 0;
      lock = "";
      moved = false;
      done = false;
      lastT = performance.now();
      lastX = 0;
      vel = 0;
      row.style.willChange = "transform";
    });
    row.addEventListener("pointermove", function(ev) {
      if (pid === null || ev.pointerId !== pid || done) return;
      var mx = ev.clientX - x0, my = ev.clientY - y0;
      if (!lock) {
        if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
        lock = Math.abs(mx) > Math.abs(my) * 1.2 ? "x" : "y";
        if (lock === "y") {
          pid = null;
          return;
        }
        try {
          row.setPointerCapture(pid);
        } catch (e) {
        }
        row.classList.add("swiping");
      }
      if (lock !== "x") return;
      moved = true;
      var raw = Math.min(0, mx);
      dx = raw < -TH ? -TH - (Math.abs(raw) - TH) * DAMP : raw;
      if (dx < -MAXPULL) dx = -MAXPULL;
      var now = performance.now(), dt = now - lastT;
      if (dt > 8) {
        vel = (dx - lastX) / dt;
        lastX = dx;
        lastT = now;
      }
      paint(dx, false);
    });
    function end(ev, cancelled) {
      if (pid === null || done || ev && ev.pointerId !== pid) return;
      try {
        row.releasePointerCapture(pid);
      } catch (e) {
      }
      pid = null;
      row.classList.remove("swiping");
      if (cancelled) {
        if (moved) {
          paint(0, true, todoEase("--ease-enter"));
          todoReleaseLayer(row, todoMs("--dur-2", 180) + 80);
        } else {
          row.style.willChange = "";
        }
        dx = 0;
        moved = false;
        lock = "";
        return;
      }
      if (!moved) {
        return;
      }
      if (dx <= -TH) {
        done = true;
        var exit = todoExitMs(vel);
        var leave = todoEase("--ease-leave", "cubic-bezier(.75,0,.8,.2)");
        var finalize = function() {
          if (finalized) return;
          finalized = true;
          var r = Todo.remove(it.id);
          if (r) {
            todoStateUndo(T("todo.deleted", "已删除"), T("todo.undo", "撤销"), function() {
              Todo.restore(r.item, r.index);
              todoState(T("todo.undone", "已恢复"));
            });
          }
        };
        row.style.transition = "transform " + exit + "ms " + leave + ", opacity " + exit + "ms " + leave;
        void row.offsetWidth;
        row.style.transform = "translateX(" + -(row.offsetWidth + 32) + "px)";
        row.style.opacity = "0";
        row.addEventListener("transitionend", function(ev2) {
          if (ev2.propertyName === "transform") finalize();
        });
        setTimeout(finalize, exit + 80);
      } else {
        paint(0, true, todoEase("--ease-enter"));
        todoReleaseLayer(row, todoMs("--dur-2", 180) + 80);
      }
      dx = 0;
      moved = false;
      lock = "";
    }
    row.addEventListener("pointerup", function(ev) {
      end(ev, false);
    });
    row.addEventListener("pointercancel", function(ev) {
      end(ev, true);
    });
  }
  function updateTodoIcon() {
    var arc = document.querySelector("#btn-todo .todo-ring");
    if (!arc || !window.Todo) return;
    var st = Todo.stats();
    var C = 2 * Math.PI * 8.4;
    var frac = st.total ? st.done / st.total : 1;
    try {
      arc.setAttribute("stroke-dasharray", (C * frac).toFixed(2) + " " + C.toFixed(2));
      arc.setAttribute("stroke-opacity", st.total ? "1" : ".55");
    } catch (e) {
    }
  }
  function updateTodoHud() {
    var ring = $("todo-ring");
    if (!ring || !window.Todo) return;
    var st = Todo.stats();
    var arc = $("todo-hud-arc"), num = $("todo-hud-num");
    if (num) num.textContent = st.done + "/" + st.total;
    if (arc) {
      var C = 2 * Math.PI * 20;
      var frac = st.total ? st.done / st.total : 0;
      try {
        arc.setAttribute("stroke-dasharray", (C * frac).toFixed(2) + " " + C.toFixed(2));
      } catch (e) {
      }
    }
    ring.classList.toggle("hidden", st.open === 0);
  }
  var _todoDraft = false, _todoDraftBusy = false;
  function todoDraftStart() {
    var box = $("todo");
    if (box && box.classList.contains("hidden")) {
      openTodo($("btn-todo"));
      return;
    }
    _todoDraft = true;
    _todoDraftBusy = false;
    renderTodo();
  }
  function todoDraftCommit(val) {
    if (_todoDraftBusy) return;
    _todoDraftBusy = true;
    var it = Todo.add(val);
    _todoDraftBusy = false;
    if (!it) {
      todoState(T("todo.needText", "先写点什么再添加"));
      return;
    }
    todoState(T("todo.added", "已添加"));
    _todoDraft = true;
    renderTodo();
  }
  function todoDraftCancel() {
    _todoDraft = false;
    renderTodo();
  }
  function todoDraftRow() {
    var row = document.createElement("div");
    row.className = "todo-row draft";
    var cb = document.createElement("button");
    cb.type = "button";
    cb.className = "todo-check";
    cb.disabled = true;
    var inp = document.createElement("input");
    inp.type = "text";
    inp.className = "todo-edit";
    inp.maxLength = 120;
    inp.setAttribute("placeholder", T("todo.addPh", "写一条待办…"));
    inp.addEventListener("keydown", function(ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        todoDraftCommit(inp.value);
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        todoDraftCancel();
      }
    });
    inp.addEventListener("blur", function() {
      if (!inp.value.trim()) todoDraftCancel();
      else todoDraftCommit(inp.value);
    });
    row.appendChild(cb);
    row.appendChild(inp);
    setTimeout(function() {
      try {
        inp.focus();
      } catch (e) {
      }
    }, 0);
    return row;
  }
  function renderTodo() {
    var box = $("todo-list");
    if (!box || !window.Todo) return;
    var items = Todo.list();
    var prev = {};
    for (var i = 0; i < box.children.length; i++) {
      var old = box.children[i], k = old.getAttribute("data-id");
      if (k) prev[k] = old.getBoundingClientRect().top;
    }
    box.innerHTML = "";
    if (_todoDraft) box.appendChild(todoDraftRow());
    for (var j = 0; j < items.length; j++) box.appendChild(todoRow(items[j]));
    if (!items.length && !_todoDraft) {
      var empty = document.createElement("p");
      empty.className = "hint-sub todo-empty";
      empty.textContent = T("todo.empty", "还没有待办 —— 用右下角的 ＋ 加一条");
      box.appendChild(empty);
    }
    var _flip = [];
    for (var m = 0; m < box.children.length; m++) {
      var row = box.children[m], id = row.getAttribute("data-id");
      if (!id) continue;
      if (prev[id] == null) {
        _flip.push({ row, fresh: true, d: 0 });
        continue;
      }
      _flip.push({ row, fresh: false, d: prev[id] - row.getBoundingClientRect().top });
    }
    for (var n = 0; n < _flip.length; n++) {
      var frow = _flip[n].row;
      if (_flip[n].fresh) {
        try {
          var ain = frow.animate(
            [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }],
            { duration: todoMs("--dur-3", 200), easing: todoEase("--ease-enter"), fill: "backwards" }
          );
          ain.addEventListener("finish", function() {
            try {
              ain.cancel();
            } catch (e) {
            }
          });
        } catch (e) {
        }
        continue;
      }
      if (Math.abs(_flip[n].d) > 0.5 && frow.animate) {
        try {
          frow.animate(
            [{ transform: "translateY(" + _flip[n].d + "px)" }, { transform: "none" }],
            { duration: todoMs("--dur-3", 200), easing: todoEase("--ease-move", "cubic-bezier(.4,0,.6,1)") }
          );
        } catch (e) {
        }
      }
    }
    var st = Todo.stats(), c = $("todo-count");
    if (c) c.textContent = T("todo.count", "已完成 {d} / {t}").replace("{d}", st.done).replace("{t}", st.total);
  }
  function todoWire() {
    if (_todoWired) return;
    _todoWired = true;
    var btn = $("btn-todo");
    if (btn) btn.onclick = function() {
      openTodo(btn);
    };
    var back = $("btn-todo-back");
    if (back) back.onclick = closeTodo;
    var add = $("btn-todo-add");
    if (add) add.onclick = todoDraftStart;
    var ring = $("todo-ring");
    if (ring) ring.onclick = function() {
      openTodo(ring);
    };
    var clr = $("btn-todo-clear");
    if (clr) clr.onclick = function() {
      var now = Date.now();
      if (now - _todoClearArm > 4e3) {
        _todoClearArm = now;
        todoState(T("todo.clearAsk", "再点一次确认清空"));
        return;
      }
      _todoClearArm = 0;
      var snap = Todo.snapshot();
      var list = $("todo-list");
      var fin = function() {
        _todoDraft = false;
        Todo.clear();
        todoStateUndo(T("todo.cleared", "已清空"), T("todo.undo", "撤销"), function() {
          Todo.replaceWith(snap);
          todoState(T("todo.undone", "已恢复"));
        });
      };
      if (list) {
        list.classList.add("clearing");
        setTimeout(function() {
          list.classList.remove("clearing");
          fin();
        }, todoMs("--dur-3", 200));
      } else fin();
    };
    if (window.Todo && Todo.onChange) {
      Todo.onChange(function() {
        updateTodoIcon();
        updateTodoHud();
        var box = $("todo");
        if (box && !box.classList.contains("hidden")) renderTodo();
      });
    }
    updateTodoIcon();
    updateTodoHud();
  }
  todoWire();
  var _pomoWired = false, _pomoTimer = 0, _pomoOriginId = "btn-pomo", _pomoAsk = "", _pomoAwayWired = false;
  function pomoStateMsg(t) {
    var el = $("pomo-state");
    if (el) el.textContent = t || "";
  }
  function pomoFmt(ms) {
    var s = Math.max(0, Math.round((ms || 0) / 1e3));
    var m = Math.floor(s / 60);
    s = s % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }
  function pomoPhase(mode) {
    return mode === "focus" ? T("pomo.phase.focus", "专注") : T("pomo.phase.break", "休息");
  }
  function pomoOrigin(origin) {
    return origin && origin.id ? origin.id : "btn-pomo";
  }
  function openPomo(origin) {
    closeOtherCards("pomo");
    var box = $("pomo");
    if (!box) return;
    _pomoOriginId = pomoOrigin(origin);
    morphCardFor("pomo", _pomoOriginId);
    showCardAfterLayout("pomo");
    renderPomo();
    pomoStateMsg("");
    pomoEnsureTimer();
    try {
      pomoCustomRestore(true);
    } catch (e) {
    }
  }
  function closePomo() {
    var b = $("pomo");
    if (b) {
      morphCardFor("pomo", _pomoOriginId);
      hideCardNow("pomo");
    }
  }
  function pomoEnsureTimer() {
    var running = Pomo.state().running;
    if (running && !_pomoTimer) _pomoTimer = setInterval(pomoTick, 1e3);
    else if (!running && _pomoTimer) {
      clearInterval(_pomoTimer);
      _pomoTimer = 0;
    }
  }
  function pomoTick() {
    var r = Pomo.tick();
    if (r && r.finished) pomoFinished(r);
    renderPomo();
    updatePomoHud();
    pomoEnsureTimer();
  }
  function pomoFinished(r) {
    var n = r && r.n || 0;
    var line;
    if (r.finished === "focus") {
      line = T("pomo.say.focus", "第 {n} 个番茄完成啦，休息一下吧", { n });
      if (n > 0 && n % Pomo.get().every === 0) line = T("pomo.say.round", "{n} 个番茄到手，今天很稳", { n });
    } else {
      line = T("pomo.say.break", "休息结束，要接着来吗？");
    }
    try {
      if (typeof addMsg === "function") addMsg("ai", line);
    } catch (e) {
    }
    try {
      var st = Pomo.state();
      if (st.bind && r.finished === "focus") {
        _pomoAsk = st.bind;
        renderPomo();
      }
    } catch (e) {
    }
    try {
      if (voiceReadOn() && typeof speak === "function") speak(line);
    } catch (e) {
    }
    try {
      if (PomoAudio.cfg().follow) {
        var actF = PomoAudio.active() || {};
        if (actF.playing) {
          var stF = Pomo.state();
          if (stF && stF.mode === "idle") {
            PomoAudio.stop();
            _pomoSndPausedByPomo = false;
            _pomoFollowClear();
          } else {
            PomoAudio.pause();
            _pomoSndPausedByPomo = true;
            _pomoFollowSave({ pausedByPomo: true, chan: actF.which || _pomoSndTab });
          }
        }
      }
    } catch (e) {
    }
  }
  function pomoSetText(el, txt) {
    if (!el) return;
    var v = txt == null ? "" : String(txt);
    if (el.textContent !== v) el.textContent = v;
  }
  function renderPomo() {
    var st = Pomo.state(), cfg2 = Pomo.get(), stats = Pomo.stats();
    pomoSetText($("pomo-clock"), pomoFmt(st.totalMs ? st.leftMs : cfg2.focus * 6e4));
    pomoSetText($("pomo-phase"), st.mode === "idle" ? "" : pomoPhase(st.mode));
    pomoSetText($("pomo-note"), st.mode === "idle" ? T("pomo.note.idle", "选好时长，点「开始」就行") : st.paused ? T("pomo.note.pending", "待命中 —— 点「开始」继续") : st.mode === "focus" ? T("pomo.note.focus", "专注中，别切走哦") : T("pomo.note.break", "休息一下，抬头看看远处"));
    pomoSetText($("pomo-stats"), T(
      "pomo.stats",
      "今天 {n} 个 · 本周 {w} 个 · {m} 分钟",
      { n: stats.today.n, w: stats.week.n, m: stats.today.min }
    ));
    pomoSetText($("btn-pomo-main"), st.mode === "idle" ? T("pomo.start", "开始") : st.paused ? T("pomo.go", "开始") : T("pomo.pause", "暂停"));
    [
      [$("s-pomo-focus"), cfg2.focus],
      [$("s-pomo-short"), cfg2.short],
      [$("s-pomo-long"), cfg2.long],
      [$("s-pomo-every"), cfg2.every],
      [$("s-pomo-plan"), cfg2.plan]
    ].forEach(function(p) {
      if (p[0] && document.activeElement !== p[0]) p[0].value = String(p[1]);
    });
    pomoFillBind(st.bind);
    var cf = $("pomo-confirm");
    if (cf) cf.classList.toggle("hidden", !_pomoAsk);
    updatePomoHud();
  }
  function pomoFillBind(cur) {
    var sel = $("s-pomo-bind");
    if (!sel || !window.Todo) return;
    var items = [];
    try {
      items = Todo.list().filter(function(x) {
        return !x.done;
      });
    } catch (e) {
      items = [];
    }
    var want = String(cur || "");
    var html = '<option value="">' + T("pomo.bindNone", "不绑定（纯倒计时）") + "</option>";
    var found = false;
    items.forEach(function(x) {
      if (x.id === want) found = true;
      html += '<option value="' + x.id + '">' + String(x.text || "").replace(/[<>&]/g, "") + "</option>";
    });
    if (want && !found) html += '<option value="' + want + '">(已完成的待办)</option>';
    if (sel.dataset.sig !== html) {
      sel.dataset.sig = html;
      sel.innerHTML = html;
    }
    sel.value = want;
  }
  function updatePomoHud() {
    var ring = $("pomo-ring"), arc = $("pomo-hud-arc"), num = $("pomo-hud-num"), lab = $("pomo-hud-label");
    if (!ring) return;
    var st = Pomo.state();
    ring.classList.toggle("hidden", st.mode === "idle");
    if (st.mode === "idle") return;
    if (arc) arc.setAttribute("stroke-dasharray", (125.66 * st.frac).toFixed(1) + " 125.66");
    if (num) num.textContent = pomoFmt(st.leftMs);
    if (lab) lab.textContent = pomoPhase(st.mode);
    ring.setAttribute("title", pomoPhase(st.mode) + " " + pomoFmt(st.leftMs));
  }
  function pomoApplyCfg() {
    Pomo.set({
      focus: ($("s-pomo-focus") || {}).value,
      short: ($("s-pomo-short") || {}).value,
      long: ($("s-pomo-long") || {}).value,
      every: ($("s-pomo-every") || {}).value,
      plan: ($("s-pomo-plan") || {}).value
    });
    renderPomo();
  }
  function pomoFlushStorage() {
    try {
      var s = window.tsumuShell;
      if (!s || !s.saveWebStorageSync) return;
      var o = {}, i, k;
      for (i = 0; i < localStorage.length; i++) {
        k = localStorage.key(i);
        if (k) o[k] = localStorage.getItem(k);
      }
      s.saveWebStorageSync(o);
    } catch (e) {
    }
  }
  function pomoAwayWire() {
    if (_pomoAwayWired) return;
    _pomoAwayWired = true;
    try {
      document.addEventListener("visibilitychange", function() {
        try {
          if (document.hidden) {
            Pomo.markAway();
            pomoFlushStorage();
          } else {
            Pomo.clearAway();
            pomoFlushStorage();
          }
        } catch (e) {
        }
      });
      window.addEventListener("pagehide", function() {
        try {
          Pomo.markAway();
          pomoFlushStorage();
        } catch (e) {
        }
      });
    } catch (e) {
    }
  }
  function pomoWire() {
    if (_pomoWired) return;
    _pomoWired = true;
    var btn = $("btn-pomo");
    if (btn) btn.onclick = function() {
      openPomo(btn);
    };
    var ring = $("pomo-ring");
    if (ring) ring.onclick = function() {
      openPomo(ring);
    };
    var back = $("btn-pomo-back");
    if (back) back.onclick = closePomo;
    var main = $("btn-pomo-main");
    if (main) main.onclick = function() {
      var st = Pomo.state();
      if (st.mode === "idle") {
        var bind2 = ($("s-pomo-bind") || {}).value || "";
        _pomoAsk = "";
        Pomo.start("focus", { resetIdx: true, bind: bind2 });
      } else if (st.paused) {
        Pomo.resume();
      } else {
        Pomo.pause();
      }
      pomoStateMsg("");
      renderPomo();
      pomoEnsureTimer();
    };
    var stop = $("btn-pomo-stop");
    if (stop) stop.onclick = function() {
      Pomo.stop();
      _pomoAsk = "";
      pomoStateMsg(T("pomo.reset.done", "已重置"));
      renderPomo();
      pomoEnsureTimer();
    };
    ["s-pomo-focus", "s-pomo-short", "s-pomo-long", "s-pomo-every", "s-pomo-plan"].forEach(function(id) {
      var el = $(id);
      if (el) el.onchange = pomoApplyCfg;
    });
    var bind = $("s-pomo-bind");
    if (bind) bind.onchange = function() {
      var v = String(bind.value || "");
      try {
        Pomo.start(Pomo.state().mode === "idle" ? "focus" : Pomo.state().mode, { bind: v });
      } catch (e) {
      }
      renderPomo();
    };
    var yes = $("btn-pomo-done");
    if (yes) yes.onclick = function() {
      var id = _pomoAsk;
      _pomoAsk = "";
      try {
        if (id && window.Todo && Todo.toggle) Todo.toggle(id);
      } catch (e) {
      }
      pomoStateMsg(T("pomo.doneYes", "完成了"));
      renderPomo();
    };
    var no = $("btn-pomo-notyet");
    if (no) no.onclick = function() {
      _pomoAsk = "";
      pomoStateMsg(T("pomo.doneNo", "还没"));
      renderPomo();
    };
    if (window.Pomo && Pomo.onChange) Pomo.onChange(function() {
      renderPomo();
      updatePomoHud();
    });
    try {
      Pomo.reconcileAway();
    } catch (e) {
    }
    pomoAwayWire();
    try {
      Pomo.reconcile();
    } catch (e) {
    }
    renderPomo();
    pomoEnsureTimer();
  }
  pomoWire();
  var _pomoSndWired = false, _pomoSndTab = "lofi", _pomoSndOpen = true, _pomoSndRevObs = null;
  var _pomoSndPausedByPomo = false;
  var _POMO_FOLLOW_KEY = "tsumu.pomo.snd.follow";
  function _pomoFollowSave(o) {
    try {
      localStorage.setItem(_POMO_FOLLOW_KEY, JSON.stringify(o || {}));
    } catch (e) {
    }
  }
  function _pomoFollowLoad() {
    try {
      return JSON.parse(localStorage.getItem(_POMO_FOLLOW_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  }
  function _pomoFollowClear() {
    try {
      localStorage.removeItem(_POMO_FOLLOW_KEY);
    } catch (e) {
    }
  }
  var _pomoSndInitTab = "lofi";
  try {
    _pomoSndInitTab = window.PomoAudio && PomoAudio.cfg().tab || "lofi";
    _pomoSndTab = _pomoSndInitTab;
  } catch (e) {
  }
  function pomoSndName(it) {
    return it && it.name ? String(it.name).replace(/\.[a-z0-9]+$/i, "") : "";
  }
  function pomoSndTabName() {
    return _pomoSndTab === "amb" ? T("pomo.snd.amb", "环境音") : _pomoSndTab === "custom" ? T("pomo.snd.custom", "自定义") : T("pomo.snd.lofi", "Lofi");
  }
  function pomoSndVol(cfg2) {
    return _pomoSndTab === "amb" ? cfg2.volAmb : _pomoSndTab === "custom" ? cfg2.volCustom : cfg2.volLofi;
  }
  function pomoSndVolPatch(v) {
    return _pomoSndTab === "amb" ? { volAmb: v } : _pomoSndTab === "custom" ? { volCustom: v } : { volLofi: v };
  }
  var _pomoCustomAsked = false;
  function pomoCustomRestore(ask) {
    if (!window.PomoAudio || !PomoAudio.restoreCustom) return;
    if (PomoAudio.hasCustom && PomoAudio.hasCustom()) return;
    if (ask && _pomoCustomAsked) return;
    if (ask) _pomoCustomAsked = true;
    PomoAudio.restoreCustom(!!ask).then(function(st) {
      if (st === "ok") {
        if (ask) pomoStateMsg(T("pomo.snd.customRestored", "已恢复自定义文件夹（{n} 首）", { n: PomoAudio.customCount() }));
        renderPomoSound();
      } else if (st === "prompt") {
        if (ask) pomoStateMsg(T("pomo.snd.customNeedAuth", "自定义文件夹要重新授权：再点一次「自选文件夹」"));
      } else if (st === "none" && _pomoSndTab === "custom") {
        _pomoSndTab = "lofi";
        renderPomoSound();
      }
    }).catch(function() {
    });
  }
  function pomoSndDurText(sec) {
    if (!sec || !isFinite(sec) || sec <= 0) return "0:00";
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }
  function pomoSndSrcName() {
    if (_pomoSndTab === "custom") {
      var lab = PomoAudio.customLabel && PomoAudio.customLabel() || "";
      return T("pomo.snd.custom", "自定义") + (lab ? " · " + lab : "");
    }
    return _pomoSndTab === "amb" ? T("pomo.snd.amb", "环境音") : T("pomo.snd.lofi", "Lofi");
  }
  function pomoSndProgress() {
    if (!window.PomoAudio || !PomoAudio.time) return;
    var t = PomoAudio.time();
    var bar = $("pomo-sound-fill"), cur = $("pomo-sound-cur"), dur = $("pomo-sound-dur");
    var known = t.dur > 0 && isFinite(t.dur);
    if (bar) bar.style.width = known ? Math.max(0, Math.min(100, t.cur / t.dur * 100)).toFixed(2) + "%" : "0%";
    if (cur) cur.textContent = pomoSndDurText(t.cur);
    var sk = document.querySelector("#pomo-sound .pomo-np-seek");
    if (sk) sk.classList.toggle("noseek", !known);
    if (dur) dur.textContent = known ? pomoSndDurText(t.dur) : "--:--";
  }
  function renderPomoSound() {
    var box = $("pomo-sound");
    if (!box || !window.PomoAudio) return;
    var cfg2 = PomoAudio.cfg(), act = PomoAudio.active(), list = PomoAudio.list(_pomoSndTab);
    var it = act.which === _pomoSndTab && act.index >= 0 ? list[act.index] : null;
    var title = $("pomo-sound-title");
    if (title) title.textContent = it ? pomoSndName(it) : list.length ? pomoSndTabName() : T("pomo.snd.empty", "还没有音乐…");
    var sub = $("pomo-sound-sub");
    if (sub) sub.textContent = act.which === _pomoSndTab && act.index >= 0 && list.length ? pomoSndSrcName() + " · " + T("pomo.snd.idxOf", "第 {i} 首 / 共 {n} 首", { i: act.index + 1, n: list.length }) : list.length ? pomoSndSrcName() + " · " + T("pomo.snd.count", "共 {n} 首", { n: list.length }) : "";
    var pl = $("btn-pomo-snd-play");
    if (pl) pl.classList.toggle("playing", !!act.playing);
    var mp = $("btn-pomo-snd-mode");
    if (mp) {
      mp.setAttribute("data-mode", cfg2.mode === "seq" ? "seq" : cfg2.mode === "shuffle" ? "shuffle" : "one");
      mp.title = T("pomo.snd.modeNow", "播放模式", { m: T("pomo.snd.mode." + (cfg2.mode === "seq" ? "seq" : cfg2.mode === "shuffle" ? "shuffle" : "one"), "") });
    }
    var tl = $("btn-pomo-snd-tab-lofi"), ta = $("btn-pomo-snd-tab-amb"), tc = $("btn-pomo-snd-tab-custom");
    if (tl) tl.classList.toggle("on", _pomoSndTab === "lofi");
    if (ta) ta.classList.toggle("on", _pomoSndTab === "amb");
    if (tc) tc.classList.toggle("on", _pomoSndTab === "custom");
    var vl = $("s-pomo-vol");
    if (vl && document.activeElement !== vl) vl.value = String(Math.round(pomoSndVol(cfg2) * 100));
    var gl = $("s-pomo-gain"), gv = $("pomo-gain-val");
    if (gl && document.activeElement !== gl) gl.value = String(Math.round(cfg2.gainDb));
    if (gv) gv.textContent = (Math.round(cfg2.gainDb) > 0 ? "+" : "") + Math.round(cfg2.gainDb) + "dB";
    var fo = $("s-pomo-follow");
    if (fo) fo.checked = !!cfg2.follow;
    pomoSndProgress();
    var lb = $("pomo-sound-list");
    if (lb) {
      lb.classList.toggle("hidden", !_pomoSndOpen);
      if (_pomoSndOpen) {
        var dsum = 0;
        list.forEach(function(x) {
          dsum += x && isFinite(x.dur) && x.dur > 0 ? x.dur : 0;
        });
        var sig = _pomoSndTab + "|" + list.length + "|" + act.index + "|" + (act.playing ? 1 : 0) + "|" + Math.round(dsum);
        if (lb.dataset.sig !== sig) {
          lb.dataset.sig = sig;
          lb.innerHTML = list.map(function(x, i) {
            var on = i === act.index && act.which === _pomoSndTab;
            var d = x && isFinite(x.dur) && x.dur > 0 ? pomoSndDurText(x.dur) : "";
            return '<button type="button" class="pomo-snd-row' + (on ? " on" : "") + '" data-i="' + i + '"><span class="n">' + (i < 9 ? "0" : "") + (i + 1) + '</span><span class="nm">' + String(pomoSndName(x)).replace(/[<>&"]/g, "") + "</span>" + (on ? '<span class="eq"><i></i><i></i><i></i></span>' : "") + (d ? '<span class="d">' + d + "</span>" : "") + "</button>";
          }).join("");
        }
      }
    }
  }
  function pomoFollowChan() {
    var c = "lofi";
    try {
      c = PomoAudio.cfg().tab || "lofi";
    } catch (e) {
    }
    if (c !== "lofi" && c !== "amb" && c !== "custom") c = "lofi";
    var n = 0;
    try {
      n = PomoAudio.list(c).length;
    } catch (e) {
    }
    return n > 0 ? c : "lofi";
  }
  function pomoSoundFollow(state, wasRunning) {
    if (!window.PomoAudio) return;
    var cfg2 = PomoAudio.cfg();
    if (!cfg2.follow) return;
    if (state.mode === "idle") {
      if (wasRunning) PomoAudio.stop();
      return;
    }
    if (!wasRunning) {
      PomoAudio.notifySessionStart();
      PomoAudio.start(pomoFollowChan());
      _pomoSndPausedByPomo = false;
      _pomoFollowClear();
    }
  }
  function pomoSoundWire() {
    if (_pomoSndWired) return;
    _pomoSndWired = true;
    var box = $("pomo-sound");
    if (!box || !window.PomoAudio) return;
    PomoAudio.onChange(renderPomoSound);
    if (PomoAudio.onTick) PomoAudio.onTick(pomoSndProgress);
    var main = $("btn-pomo-main");
    if (main) {
      var om = main.onclick;
      main.onclick = function(ev) {
        var st0 = Pomo.state();
        var w = st0.mode !== "idle";
        var wasPaused = st0.paused;
        om.call(this, ev);
        var st = Pomo.state();
        if (st.mode !== "idle" && st.paused) {
          var actP = PomoAudio.active() || {};
          var hadMusic = !!(actP && actP.playing);
          PomoAudio.pause();
          _pomoSndPausedByPomo = hadMusic;
          try {
            if (hadMusic) _pomoFollowSave({ pausedByPomo: true, chan: actP.which || _pomoSndTab });
            else _pomoFollowClear();
          } catch (e) {
          }
        } else if (wasPaused && (_pomoSndPausedByPomo || _pomoFollowLoad().pausedByPomo)) {
          _pomoSndPausedByPomo = false;
          var savedF = _pomoFollowLoad();
          _pomoFollowClear();
          var actR = PomoAudio.active();
          if (actR && actR.which) {
            PomoAudio.resume(actR.which);
          } else {
            PomoAudio.start(savedF.chan || pomoFollowChan());
          }
        }
        if (!w) pomoSoundFollow(st, w);
      };
    }
    var stp = $("btn-pomo-stop");
    if (stp) {
      var os = stp.onclick;
      stp.onclick = function(ev) {
        os.call(this, ev);
        PomoAudio.stop();
        _pomoSndPausedByPomo = false;
        _pomoFollowClear();
      };
    }
    var clock = $("pomo-clock");
    if (clock && window.MutationObserver) {
      if (_pomoSndRevObs) {
        try {
          _pomoSndRevObs.disconnect();
        } catch (e) {
        }
      }
      _pomoSndRevObs = new MutationObserver(function() {
        try {
          var P = window.TsumuPlayer;
          if (P && P.state && P.state().playing && PomoAudio.active().playing) PomoAudio.yieldToMainPlayer();
          if (typeof pomoSleepSync === "function") pomoSleepSync();
          if (typeof pomoBubbleTick === "function") pomoBubbleTick();
        } catch (e) {
        }
      });
      _pomoSndRevObs.observe(clock, { childList: true, characterData: true, subtree: true });
    }
    PomoAudio.onMainPlayerShouldPause(function() {
      try {
        var P = window.TsumuPlayer;
        if (P && P.state && P.state().playing && P.toggle) P.toggle();
        pomoStateMsg(T("pomo.snd.pausedMusic", "音乐先暂停了"));
      } catch (e) {
      }
    });
    if (typeof speak === "function") {
      var _sp = speak;
      speak = function() {
        try {
          PomoAudio.duck(true);
        } catch (e) {
        }
        var clear = function() {
          try {
            PomoAudio.duck(false);
          } catch (e) {
          }
        };
        var t = setTimeout(clear, 6e4);
        try {
          if (typeof audioEl !== "undefined" && audioEl.addEventListener) audioEl.addEventListener("ended", function() {
            clearTimeout(t);
            clear();
          }, { once: true });
        } catch (e) {
        }
        return _sp.apply(null, arguments);
      };
    }
    var tl = $("btn-pomo-snd-tab-lofi");
    if (tl) tl.onclick = function() {
      _pomoSndTab = "lofi";
      renderPomoSound();
    };
    var ta = $("btn-pomo-snd-tab-amb");
    if (ta) ta.onclick = function() {
      _pomoSndTab = "amb";
      renderPomoSound();
    };
    var tc = $("btn-pomo-snd-tab-custom");
    if (tc) tc.onclick = function() {
      _pomoSndTab = "custom";
      pomoCustomRestore(true);
      renderPomoSound();
    };
    var ex = $("btn-pomo-sound-expand");
    if (ex) ex.onclick = function() {
      _pomoSndOpen = !_pomoSndOpen;
      ex.setAttribute("aria-expanded", _pomoSndOpen ? "true" : "false");
      renderPomoSound();
    };
    var pp = $("btn-pomo-snd-play");
    if (pp) pp.onclick = function() {
      PomoAudio.toggle(_pomoSndTab);
      renderPomoSound();
    };
    if (pp) {
      var _origPpClick = pp.onclick;
      pp.onclick = function(ev) {
        var wasPlaying = false;
        try {
          var a0 = PomoAudio.active();
          wasPlaying = !!(a0 && a0.playing);
        } catch (e) {
        }
        var _r = _origPpClick.apply(this, arguments);
        try {
          var a1 = PomoAudio.active();
          if (wasPlaying && !(a1 && a1.playing)) {
            _pomoSndPausedByPomo = false;
            _pomoFollowClear();
          }
        } catch (e) {
        }
        return _r;
      };
    }
    var nx = $("btn-pomo-snd-next");
    if (nx) nx.onclick = function() {
      PomoAudio.next(_pomoSndTab);
      renderPomoSound();
    };
    var pv = $("btn-pomo-snd-prev");
    if (pv) pv.onclick = function() {
      PomoAudio.prev(_pomoSndTab);
      renderPomoSound();
    };
    var md = $("btn-pomo-snd-mode");
    if (md) md.onclick = function() {
      var m = PomoAudio.cfg().mode;
      PomoAudio.set({ mode: m === "one" ? "seq" : m === "seq" ? "shuffle" : "one" });
      renderPomoSound();
    };
    var vl = $("s-pomo-vol");
    if (vl) vl.oninput = function() {
      var v = Number(vl.value) / 100;
      PomoAudio.set(pomoSndVolPatch(v));
    };
    var gl = $("s-pomo-gain");
    if (gl) gl.oninput = function() {
      PomoAudio.set({ gainDb: Number(gl.value) });
      var g2 = $("pomo-gain-val");
      if (g2) g2.textContent = (Number(gl.value) > 0 ? "+" : "") + Math.round(Number(gl.value)) + "dB";
    };
    var fo = $("s-pomo-follow");
    if (fo) fo.onchange = function() {
      PomoAudio.set({ follow: !!fo.checked });
    };
    var fb = $("btn-pomo-snd-folder"), fi = $("s-pomo-folder-input");
    if (fb) fb.onclick = function() {
      if (!window.PomoAudio || !PomoAudio.pickCustom) {
        if (fi) fi.click();
        return;
      }
      PomoAudio.pickCustom().then(function(r) {
        if (r && r.count > 0) {
          _pomoSndTab = "custom";
          pomoStateMsg(T("pomo.snd.customSaved", "已记住这个文件夹（{n} 首）", { n: r.count }));
        } else if (r && r.error) {
          pomoStateMsg(T("pomo.snd.customFail", "打不开这个文件夹，换一个试试"));
        }
        renderPomoSound();
      }).catch(function() {
        if (fi) fi.click();
      });
    };
    if (fi) fi.onchange = function() {
      var fs = Array.prototype.slice.call(fi.files || []);
      var audio = fs.filter(function(f) {
        return /\.(mp3|m4a|m4b|aac|flac|wav|ogg|oga|opus|weba)$/i.test(f.name || "");
      });
      try {
        fi.value = "";
      } catch (e) {
      }
      if (!audio.length) {
        pomoStateMsg(T("pomo.snd.empty", "没有找到音频文件"));
        return;
      }
      PomoAudio.setFolderFiles("custom", audio);
      _pomoSndTab = "custom";
      pomoStateMsg(T("pomo.snd.customNoPersist", "这次导入只在本次运行有效（重启后要重新选）"));
      renderPomoSound();
    };
    var lb = $("pomo-sound-list");
    var seekBar = document.querySelector("#pomo-sound .pomo-np-seek");
    if (seekBar && !seekBar.dataset.wired) {
      seekBar.dataset.wired = "1";
      var _seeking = false;
      var _seekTo = function(ev) {
        var r = seekBar.getBoundingClientRect();
        if (!r.width) return;
        if (window.PomoAudio && PomoAudio.seek) PomoAudio.seek((ev.clientX - r.left) / r.width);
      };
      seekBar.addEventListener("pointerdown", function(ev) {
        _seeking = true;
        try {
          seekBar.setPointerCapture(ev.pointerId);
        } catch (e) {
        }
        _seekTo(ev);
        ev.preventDefault();
      });
      seekBar.addEventListener("pointermove", function(ev) {
        if (_seeking) _seekTo(ev);
      });
      seekBar.addEventListener("pointerup", function() {
        _seeking = false;
      });
      seekBar.addEventListener("pointercancel", function() {
        _seeking = false;
      });
    }
    if (lb) lb.onclick = function(ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest(".pomo-snd-row") : null;
      if (!b) return;
      PomoAudio.playAt(_pomoSndTab, Number(b.dataset.i));
      renderPomoSound();
    };
    try {
      if (window.fetch) fetch("audio/pomo/manifest.json").then(function(r) {
        return r.ok ? r.json() : null;
      }).then(function(j) {
        if (j && (j.lofi || j.ambient)) {
          var mk = function(arr, dir) {
            return (arr || []).map(function(n) {
              return { name: n, url: "audio/pomo/" + dir + "/" + encodeURIComponent(n), dur: 0 };
            });
          };
          PomoAudio.setBuiltin(mk(j.lofi, "lofi"), mk(j.ambient, "ambient"));
          renderPomoSound();
        }
      }).catch(function() {
      });
    } catch (e) {
    }
    box.classList.remove("hidden");
    renderPomoSound();
    pomoCustomRestore(false);
  }
  pomoSoundWire();
  var _pomoSleepOn = false, _pomoWakeTimer = 0;
  function pomoSleepOk() {
    return !!(window.TsumuL2d && window.TsumuL2d.model);
  }
  var _pomoEmoSave = null, _pomoNeutralName = "";
  function pomoNeutralEmotion() {
    try {
      var m = window.TsumuL2d && window.TsumuL2d.model;
      if (!m || !m.emotionNames) return "";
      var names = m.emotionNames() || [];
      var re = /(无表情|無表情|素颜|素顏|通常|普通|平静|平靜|normal|neutral|default|none|blank)/i;
      for (var i = 0; i < names.length; i++) {
        if (re.test(String(names[i]))) return String(names[i]);
      }
    } catch (e) {
    }
    return "";
  }
  function pomoDoSleep() {
    if (_pomoSleepOn || !pomoSleepOk()) return;
    _pomoSleepOn = true;
    var L = window.TsumuL2d;
    try {
      _pomoEmoSave = L.model.activeEmotion && L.model.activeEmotion() || "";
    } catch (e) {
      _pomoEmoSave = "";
    }
    try {
      L.model.playMotion("sleep", 0);
    } catch (e) {
    }
    if (!_pomoNeutralName) _pomoNeutralName = pomoNeutralEmotion();
    try {
      if (_pomoNeutralName && _pomoEmoSave && L.model.setEmotion) L.model.setEmotion(_pomoNeutralName);
      if (L.syncExprPanel) L.syncExprPanel();
    } catch (e) {
    }
    try {
      L.holdLook = true;
    } catch (e) {
    }
  }
  function pomoBubbleClearNow() {
    if (!window.PomoBubble) return;
    try {
      PomoBubble.setPaused(true);
      PomoBubble.tick(Date.now(), { awake: true, ttl: 2e4 });
    } catch (e) {
    }
    try {
      if (typeof pomoBubbleSweep === "function") pomoBubbleSweep();
    } catch (e) {
    }
  }
  function pomoDoWake(ms) {
    if (_pomoWakeTimer) {
      clearTimeout(_pomoWakeTimer);
      _pomoWakeTimer = 0;
    }
    if (_pomoSleepOn) {
      _pomoSleepOn = false;
      var Lw = window.TsumuL2d;
      try {
        if (Lw.model.stopAdHocMotion) Lw.model.stopAdHocMotion();
      } catch (e) {
      }
      try {
        if (_pomoEmoSave && Lw.model.setEmotion) Lw.model.setEmotion(_pomoEmoSave);
        if (Lw.syncExprPanel) Lw.syncExprPanel();
      } catch (e) {
      }
      _pomoEmoSave = null;
    }
    pomoBubbleClearNow();
    try {
      window.TsumuL2d.holdLook = false;
    } catch (e) {
    }
    if (ms) {
      _pomoWakeTimer = setTimeout(function() {
        _pomoWakeTimer = 0;
        var st = Pomo.state();
        if (st.mode === "focus" && !st.paused) pomoDoSleep();
      }, ms);
    }
  }
  function pomoSleepSync() {
    var st = Pomo.state(), music = false;
    try {
      var P = window.TsumuPlayer;
      music = !!(P && P.state && P.state().playing);
    } catch (e) {
    }
    if (st.mode === "focus" && !st.paused && !music && !_pomoWakeTimer) pomoDoSleep();
    else if (st.mode !== "focus" || music) pomoDoWake(0);
  }
  function pomoSleepWire() {
    if (typeof send === "function") {
      var _sd = send;
      send = function() {
        try {
          pomoDoWake(2e4);
        } catch (e) {
        }
        return _sd.apply(null, arguments);
      };
    }
    var main = $("btn-pomo-main");
    if (main) {
      var om2 = main.onclick;
      main.onclick = function(ev) {
        om2.call(this, ev);
        var st = Pomo.state();
        if (st.mode === "focus" && !st.paused) pomoSleepSync();
        else pomoDoWake(0);
      };
    }
    var stp = $("btn-pomo-stop");
    if (stp) {
      var os2 = stp.onclick;
      stp.onclick = function(ev) {
        os2.call(this, ev);
        pomoDoWake(0);
      };
    }
    pomoSleepSync();
  }
  pomoSleepWire();
  var _pomoBubEls = {};
  var _pomoBubblePruneT = 0;
  function pomoBubbleAnchors(geo) {
    var l = document.getElementById("l2d");
    var r = geo && geo.l2d ? geo.l2d : l ? l.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    var W = geo && geo.W || innerWidth, H = geo && geo.H || innerHeight;
    var BOXW = 176, PAD = 24;
    return [
      { x: Math.max(8, r.left + r.width * 0.02), y: r.top + r.height * 0.2, tail: "tail-l" },
      { x: Math.max(8, r.left + r.width * 0), y: r.top + r.height * 0.36, tail: "tail-l" },
      { x: Math.max(8, r.left + r.width * 0.06), y: r.top + r.height * 0.02, tail: "tail-tl" },
      { x: Math.min(W - (BOXW + PAD - 10), r.left + r.width * 0.72), y: r.top + r.height * 0.2, tail: "tail-r" },
      { x: Math.min(W - (BOXW + PAD - 10), r.left + r.width * 0.78), y: r.top + r.height * 0.36, tail: "tail-r" },
      { x: Math.min(W - (BOXW + PAD - 10), r.left + r.width * 0.66), y: r.top + r.height * 0.02, tail: "tail-tr" }
    ];
  }
  function pomoBubbleGeom(zones) {
    var W = innerWidth, H = innerHeight;
    var l = document.getElementById("l2d");
    var r = l ? l.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    var wideTop = 0;
    for (var i = 0; i < (zones || []).length; i++) {
      var z = zones[i];
      if (z.right - z.left < W * 0.55) continue;
      if (z.top <= 46) continue;
      if (!wideTop || z.top < wideTop) wideTop = z.top;
    }
    return { W, H, l2d: r, bottomTop: wideTop };
  }
  function pomoBubbleZones() {
    var zones = [];
    var add = function(el) {
      if (!el) return;
      var r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return;
      zones.push(r);
    };
    add(document.getElementById("input"));
    add(document.getElementById("fn"));
    add(document.getElementById("chat"));
    add(document.getElementById("player-cover"));
    add(document.getElementById("player-lyric"));
    add(document.getElementById("player-flow"));
    add(document.getElementById("player-card"));
    add(document.getElementById("todo-ring"));
    add(document.getElementById("pomo-ring"));
    zones.push({ left: 0, top: 0, right: innerWidth, bottom: 42 });
    return zones;
  }
  function pomoBubbleBlocked(rc, zones) {
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i];
      if (rc.x < z.right + 14 && rc.x + rc.w > z.left - 14 && rc.y < z.bottom + 14 && rc.y + rc.h > z.top - 14) return true;
    }
    return false;
  }
  function pomoBubbleSpots(w, h, geo) {
    var W = geo.W, H = geo.H, m = 8;
    var xMax = Math.max(m, W - w - m);
    var span = xMax - m;
    var band = Math.max(1, Math.min(span, span * 0.4));
    var lLo = m, lHi = Math.min(xMax, m + band);
    var rLo = Math.max(m, xMax - band), rHi = xMax;
    var top = 46;
    var yMax = Math.min(H * 0.72, geo.bottomTop ? geo.bottomTop - h - 12 : H);
    yMax = Math.max(top, Math.min(yMax, H - h - m));
    var out = [];
    for (var i = 0; i < 24; i++) {
      var isLeft = i % 2 === 0;
      var lo = isLeft ? lLo : rLo, hi = isLeft ? lHi : rHi;
      out.push({
        x: lo + Math.random() * Math.max(0, hi - lo),
        y: top + Math.random() * Math.max(0, yMax - top),
        tail: isLeft ? "tail-l" : "tail-r"
      });
    }
    for (var r2 = 0; r2 < 12; r2++) {
      var yy = top + (yMax - top) * (r2 / 11);
      var xs = [lLo, lHi, rLo, rHi];
      for (var x2 = 0; x2 < xs.length; x2++) {
        out.push({ x: xs[x2], y: yy, tail: x2 < 2 ? "tail-l" : "tail-r" });
      }
    }
    return out.concat(pomoBubbleAnchors(geo));
  }
  function pomoBubbleMake(b) {
    var el = document.createElement("div");
    var demure = false;
    try {
      demure = !!PomoBubble.cfg().blur;
    } catch (e) {
    }
    el.className = "pomo-bubble" + (demure ? " demure" : "");
    if (demure) {
      var t = document.createElement("div");
      t.className = "bub-tease";
      t.textContent = String(b.tease || "");
      var bd = document.createElement("div");
      bd.className = "bub-body";
      bd.textContent = b.text;
      el.appendChild(t);
      el.appendChild(bd);
      el.setAttribute("title", b.text);
    } else {
      el.textContent = b.text;
    }
    return el;
  }
  function pomoBubbleRender(fresh) {
    var layer = document.getElementById("bubble-layer");
    if (!layer) return;
    var zones = pomoBubbleZones(), geo = pomoBubbleGeom(zones);
    var lv = 1;
    for (var i = 0; i < fresh.length; i++) {
      var b = fresh[i];
      if (_pomoBubEls[b.key]) continue;
      var el = pomoBubbleMake(b);
      layer.appendChild(el);
      var w = el.offsetWidth, h = el.offsetHeight;
      var spots = pomoBubbleSpots(w, h, geo);
      var placed = false;
      for (var c = 0; c < spots.length; c++) {
        var a = spots[c];
        var jx = (Math.random() - 0.5) * 34;
        var jy = (Math.random() - 0.5) * 46;
        var yLimit = geo.bottomTop ? geo.bottomTop - h - 12 : innerHeight - h - 6;
        var px2 = Math.max(6, Math.min(innerWidth - w - 6, a.x + jx));
        var py2 = Math.max(6, Math.min(Math.min(innerHeight - h - 6, yLimit), a.y + jy));
        var rc = { x: px2, y: py2, w, h };
        if (pomoBubbleBlocked(rc, zones)) continue;
        var clash = false;
        for (var k in _pomoBubEls) {
          var o = _pomoBubEls[k];
          if (!o || !o.__rc) continue;
          var orc = o.__rc;
          if (rc.x < orc.x + orc.w + 24 && rc.x + rc.w + 24 > orc.x && rc.y < orc.y + orc.h + 24 && rc.y + rc.h + 24 > orc.y) {
            clash = true;
            break;
          }
        }
        if (clash) continue;
        el.style.left = Math.round(px2) + "px";
        el.style.top = Math.round(py2) + "px";
        el.classList.add(a.tail);
        el.__rc = rc;
        placed = true;
        break;
      }
      if (!placed) {
        var a2 = spots[24] || spots[0];
        el.style.left = Math.round(a2.x + (lv - 1) * 10) + "px";
        var yLimit = geo.bottomTop ? geo.bottomTop - h - 12 : geo.H - h - 8;
        el.style.top = Math.round(Math.max(46, Math.min(yLimit, a2.y + (lv - 1) * 26))) + "px";
        el.classList.add(a2.tail);
        el.__rc = { x: a2.x, y: a2.y, w, h };
      }
      el.classList.add("lv" + Math.min(3, lv));
      lv++;
      el.dataset.key = b.key;
      _pomoBubEls[b.key] = el;
      (function(node) {
        setTimeout(function() {
          try {
            node.classList.add("on");
          } catch (e) {
          }
        }, 20);
      })(el);
    }
  }
  function pomoBubbleSweep() {
    var layer = document.getElementById("bubble-layer");
    if (!layer || !window.PomoBubble) return;
    var alive = {};
    try {
      PomoBubble.alive().forEach(function(b) {
        alive[b.key] = 1;
      });
    } catch (e) {
      return;
    }
    var kids = layer.children, doomed = [];
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      var k = el.dataset && el.dataset.key ? el.dataset.key : "";
      if (!k || !alive[k]) doomed.push(el);
    }
    for (var j = 0; j < doomed.length; j++) {
      var d = doomed[j];
      if (d.__dying) continue;
      d.__dying = 1;
      try {
        d.classList.remove("on");
        d.classList.add("off");
        (function(node) {
          setTimeout(function() {
            try {
              if (node.parentNode) node.parentNode.removeChild(node);
            } catch (e) {
            }
          }, 900);
        })(d);
      } catch (e) {
      }
    }
    _pomoBubEls = {};
    for (var m = 0; m < kids.length; m++) {
      var e2 = kids[m];
      if (e2.__dying) continue;
      var k2 = e2.dataset && e2.dataset.key ? e2.dataset.key : "";
      if (k2) _pomoBubEls[k2] = e2;
    }
  }
  function pomoBubblePruneToZones() {
    if (!window.PomoBubble) return 0;
    var layer = document.getElementById("bubble-layer");
    if (!layer || !layer.children || !layer.children.length) return 0;
    var zones;
    try {
      zones = pomoBubbleZones();
    } catch (e) {
      return 0;
    }
    var doomed = [], i;
    for (i = 0; i < layer.children.length; i++) {
      var el = layer.children[i];
      if (!el || el.__dying) continue;
      if (el.classList && !el.classList.contains("on")) continue;
      var k = el.dataset && el.dataset.key ? el.dataset.key : "";
      if (!k) continue;
      var rc = el.__rc;
      if (!rc) {
        try {
          var r = el.getBoundingClientRect();
          rc = { x: r.left, y: r.top, w: r.width, h: r.height };
        } catch (e2) {
          continue;
        }
      }
      if (pomoBubbleBlocked(rc, zones)) doomed.push(k);
    }
    if (!doomed.length) return 0;
    var n = 0;
    try {
      n = PomoBubble.dropKeys(doomed);
    } catch (e) {
    }
    if (n) {
      try {
        pomoBubbleSweep();
      } catch (e) {
      }
    }
    return n;
  }
  function pomoBubbleTick() {
    if (!window.PomoBubble) return;
    try {
      try {
        pomoBubbleRefreshEntries(Date.now(), false);
      } catch (e) {
      }
      var card = $("pomo");
      var open = !!(card && !card.classList.contains("hidden"));
      var inp = $("input");
      var typing = !!(inp && String(inp.value || "").trim());
      PomoBubble.setPaused(open || typing);
      var st = Pomo.state();
      var awake = !(_pomoSleepOn && st.mode === "focus");
      var out = PomoBubble.tick(Date.now(), { awake, ttl: 2e4, rand: Math.random }) || [];
      if (out.length) pomoBubbleRender(out);
      pomoBubblePruneToZones();
      pomoBubbleSweep();
    } catch (e) {
    }
  }
  var _pomoBubArchSig = "", _pomoBubArchAt = 0;
  function pomoBubbleRefreshEntries(now, force) {
    var t = Number(now) || Date.now();
    if (!force && t - _pomoBubArchAt < 6e4) return false;
    _pomoBubArchAt = t;
    var arr = null;
    try {
      arr = window.LongMem && LongMem.archive ? LongMem.archive() || [] : null;
    } catch (e2) {
      return false;
    }
    if (!arr) return false;
    var sig = "";
    try {
      var parts = [];
      for (var i = 0; i < arr.length; i++) {
        var e = arr[i] || {};
        var id = e.id != null ? e.id : e.seq != null ? e.seq : "";
        var txt = String(e.summary != null ? e.summary : e.text != null ? e.text : "").slice(0, 24);
        parts.push(id + ":" + txt);
      }
      sig = arr.length + "|" + parts.join(",");
    } catch (e2) {
      sig = "n" + arr.length;
    }
    if (sig === _pomoBubArchSig) return false;
    try {
      PomoBubble.setEntries(arr);
    } catch (e3) {
      return false;
    }
    _pomoBubArchSig = sig;
    return true;
  }
  try {
    window.TsumuPomoBubbleRefresh = pomoBubbleRefreshEntries;
  } catch (e) {
  }
  function pomoBubbleWire() {
    if (!window.PomoBubble || !window.LongMem) return;
    try {
      pomoBubbleRefreshEntries(Date.now(), true);
    } catch (e) {
    }
    try {
      var d = PomoBubble.cfg();
      PomoBubble.setEnabled(d.enabled !== false);
    } catch (e) {
    }
    try {
      if (window.MutationObserver) {
        var obs = new MutationObserver(function() {
          try {
            pomoBubblePruneToZones();
          } catch (e) {
          }
          try {
            if (_pomoBubblePruneT) clearTimeout(_pomoBubblePruneT);
            _pomoBubblePruneT = setTimeout(function() {
              _pomoBubblePruneT = 0;
              try {
                pomoBubblePruneToZones();
              } catch (e) {
              }
            }, 420);
          } catch (e) {
          }
        });
        ["chat", "fn"].forEach(function(id) {
          var el = $(id);
          if (el) obs.observe(el, { attributes: true, attributeFilter: ["class"] });
        });
      }
    } catch (e) {
    }
  }
  pomoBubbleWire();
  var memQuery = "", memFavOnly = false, _memClearArm = 0;
  function memState(t) {
    var el = $("mem-state");
    if (el) el.textContent = t || "";
  }
  function openMemory() {
    closeOtherCards("memory");
    var box = $("memory");
    if (!box) return;
    morphCardFor("memory", "btn-memory");
    showCardAfterLayout("memory");
    var s = $("mem-search");
    if (s) s.value = memQuery;
    var f = $("btn-mem-fav");
    if (f) f.classList.toggle("on", memFavOnly);
    renderMemory();
  }
  function closeMemory() {
    var b = $("memory");
    if (b) {
      morphCardFor("memory", "btn-memory");
      hideCardNow("memory");
    }
  }
  var _memImgUrls = [];
  function revokeMemImgs() {
    for (var i = 0; i < _memImgUrls.length; i++) {
      try {
        URL.revokeObjectURL(_memImgUrls[i]);
      } catch (e) {
      }
    }
    _memImgUrls = [];
  }
  function showBigImage(url) {
    var box = $("player-lightbox"), im = $("player-lightbox-img");
    if (!box || !im || !url) return;
    im.src = url;
    box.classList.remove("off");
  }
  function wireBigImage() {
    var box = $("player-lightbox");
    if (box && !box.dataset.wiredImg) {
      box.dataset.wiredImg = "1";
      box.addEventListener("click", function() {
        box.classList.add("off");
        var im = $("player-lightbox-img");
        if (im) {
          try {
            im.removeAttribute("src");
          } catch (e) {
          }
        }
      });
    }
  }
  function fillMemImages() {
    var box = $("mem-list");
    if (!box || !window.ImgStore || !ImgStore.url) return;
    var slots = box.querySelectorAll("[data-img]");
    for (var i = 0; i < slots.length; i++) {
      (function(el) {
        var key = el.getAttribute("data-img");
        if (!key) return;
        Promise.resolve(ImgStore.url(key)).then(function(u) {
          if (u) {
            _memImgUrls.push(u);
            var im = document.createElement("img");
            im.src = u;
            im.alt = "";
            im.title = T("tip.memImg", "点一下看大图");
            el.appendChild(im);
          } else {
            el.textContent = T("mem.imgGone", "[图片]");
            el.className = "mimg gone";
          }
        }).catch(function() {
          el.textContent = T("mem.imgGone", "[图片]");
          el.className = "mimg gone";
        });
      })(slots[i]);
    }
  }
  function renderMemory() {
    var list = $("mem-list");
    if (!list) return;
    revokeMemImgs();
    var all = window.DialogLog ? DialogLog.list({ q: "", favOnly: false }) : [];
    var cards = window.DialogLog ? DialogLog.list({ q: memQuery, favOnly: memFavOnly }) : [];
    if (!cards.length) {
      list.innerHTML = '<div class="mem-empty">' + esc(all.length ? T("search.none", "没有找到符合的内容") : T("memory.empty", "还没有回忆。和织音多聊几句吧。")) + "</div>";
    } else {
      list.innerHTML = cards.map(function(c) {
        return '<div class="mem-card' + (c.fav ? " fav" : "") + '" data-id="' + esc(c.id) + '"><div class="meta"><span>' + esc(stamp(c.at)) + '</span><span class="sp"></span>' + (c.clip ? playIcon(c.clip) : "") + '<button type="button" class="icon' + (c.fav ? " on" : "") + '" data-act="fav" title="' + esc(c.fav ? T("tip.favOff", "取消收藏") : T("tip.favOn", "收藏这一句")) + '">♥</button><button type="button" class="icon" data-act="del" title="' + esc(T("memory.del", "删除")) + '">✕</button></div>' + (c.user ? '<div class="u">' + esc(c.user) + "</div>" : "") +
        (c.img ? '<div class="mimg" data-img="' + esc(c.img) + '"></div>' : "") + (c.reply ? '<div class="a">' + esc(c.reply) + "</div>" : "") + "</div>";
      }).join("");
      fillMemImages();
    }
    if (window.DialogLog) {
      var extra = memFavOnly || memQuery ? " · " + T("search.count", "共 {n} 条", { n: cards.length }) : "";
      memState(T("search.count", "共 {n} 条", { n: DialogLog.count() }) + extra);
    }
  }
  function wireMemory() {
    wireBigImage();
    var list = $("mem-list");
    if (list && !list.dataset.wired) {
      list.dataset.wired = "1";
      list.addEventListener("click", function(e) {
        var b = e.target && e.target.closest ? e.target.closest("[data-act]") : e.target;
        if (b && b.tagName === "IMG" && b.parentNode && String(b.parentNode.className || "").indexOf("mimg") === 0) {
          showBigImage(b.src);
          return;
        }
        if (!b || !b.dataset || !b.dataset.act) return;
        var cardEl = b.closest ? b.closest(".mem-card") : null;
        var id = cardEl && cardEl.dataset ? cardEl.dataset.id : "";
        if (!id || !window.DialogLog) return;
        if (b.dataset.act === "fav") {
          DialogLog.toggleFav(id);
          renderMemory();
        } else if (b.dataset.act === "del") {
          DialogLog.remove(id);
          memState(T("memory.deleted", "已删除这条回忆"));
          renderMemory();
        } else if (b.dataset.act === "play") {
          try {
            var c = DialogLog.get(id);
            if (!c || !c.clip) {
              memState(T("memPlay.noClip2", "这条回忆没有保存语音。"));
              return;
            }
            var key = String(c.clip);
            var isThis = !!(audioEl.src && lastClipUrl && String(audioEl.src) === String(lastClipUrl));
            if (isThis && curClipKey === key && !audioEl.paused) {
              try {
                audioEl.pause();
              } catch (e2) {
              }
            } else if (isThis && curClipKey === key && audioEl.paused) {
              audioEl.play().catch(function(e2) {
                memState(T("memPlay.fail", "这段语音没能播放出来（{e}）", { e: String(e2 && e2.message || e2) }));
              });
            } else {
              playClip(key);
            }
          } catch (err) {
            memState(T("memPlay.fail", "这段语音没能播放出来（{e}）", { e: String(err && err.message || err) }));
          }
        }
      });
    }
    var s = $("mem-search");
    if (s && !s.dataset.wired) {
      s.dataset.wired = "1";
      s.addEventListener("input", function() {
        memQuery = s.value || "";
        renderMemory();
      });
    }
    var f = $("btn-mem-fav");
    if (f && !f.dataset.wired) {
      f.dataset.wired = "1";
      f.addEventListener("click", function() {
        memFavOnly = !memFavOnly;
        f.classList.toggle("on", memFavOnly);
        renderMemory();
      });
    }
    var clr = $("btn-mem-clear");
    if (clr && !clr.dataset.wired) {
      clr.dataset.wired = "1";
      clr.addEventListener("click", function() {
        var now = Date.now();
        if (now - _memClearArm < 3e3) {
          if (window.DialogLog) DialogLog.clear();
          _memClearArm = 0;
          memState(T("toast.logCleared", "已清空近期对白（长期记忆保留）"));
          renderMemory();
        } else {
          _memClearArm = now;
          memState(T("memory.clearLogAsk", "只清空近期对白记录，长期记忆卡片会留下。确定？"));
        }
      });
    }
    var bk = $("btn-mem-back");
    if (bk && !bk.dataset.wired) {
      bk.dataset.wired = "1";
      bk.addEventListener("click", closeMemory);
    }
  }
  var _diaryClearArm = 0;
  function diaryState(t) {
    var el = $("diary-state");
    if (el) el.textContent = t || "";
  }
  function isDiaryCardOpen() {
    var b = $("diary");
    return !!(b && !b.classList.contains("hidden"));
  }
  var _diaryDate = "";
  function diaryDates() {
    var es = [];
    try {
      es = window.Diary && Diary.entries() || [];
    } catch (e) {
      es = [];
    }
    return es.map(function(e) {
      return e.date;
    }).sort();
  }
  function diaryToday() {
    try {
      return window.Diary ? Diary.dateOnly( new Date()) : "";
    } catch (e) {
      return "";
    }
  }
  function renderDiary() {
    var page = $("diary-page");
    if (!page) return;
    var dates = diaryDates();
    var today = diaryToday();
    if (!_diaryDate || _diaryDate !== today && dates.indexOf(_diaryDate) < 0) {
      _diaryDate = dates.length ? dates[dates.length - 1] : today || "";
    }
    var e = null;
    try {
      e = window.Diary ? Diary.get(_diaryDate) : null;
    } catch (x) {
      e = null;
    }
    var di = $("diary-date");
    if (di && di.value !== _diaryDate) di.value = _diaryDate;
    var pd = $("diary-page-date");
    if (pd) pd.textContent = _diaryDate || "";
    var pt = $("diary-page-text");
    if (pt) pt.textContent = e ? e.text : T("diary.noneDay", "这天没有日记。");
    var pn = $("diary-page-note");
    if (pn) {
      pn.dataset.date = _diaryDate;
      pn.value = e && e.note || "";
      pn.disabled = !e;
      pn.placeholder = T("diary.notePh", "在这里写点你的话（织音的日记不能修改）");
    }
    var i = dates.indexOf(_diaryDate);
    var pv = $("btn-diary-prev"), nx = $("btn-diary-next");
    if (pv) pv.disabled = !(i > 0);
    if (nx) nx.disabled = !(i >= 0 && i < dates.length - 1);
    var pend = 0;
    try {
      pend = window.Diary && Diary.pendingCount() || 0;
    } catch (x) {
      pend = 0;
    }
    var parts = [T("diary.count", "共 {n} 篇", { n: dates.length })];
    if (pend) parts.push(T("diary.pending", "还有 {n} 轮没整理", { n: pend }));
    if (!isDiary()) parts.push(T("diary.offHint", "日记模式没开（在顶栏的「日记」）"));
    diaryState(parts.join(" · "));
  }
  function diaryStep(d) {
    var dates = diaryDates();
    if (!dates.length) return;
    var i = dates.indexOf(_diaryDate);
    if (i < 0) i = dates.length - 1;
    var n = i + d;
    if (n < 0 || n >= dates.length) return;
    _diaryDate = dates[n];
    renderDiary();
  }
  function openDiary() {
    var box = $("diary");
    if (!box) return;
    closeOtherCards("diary");
    morphCardFor("diary", "btn-diary-card");
    showCardAfterLayout("diary");
    renderDiary();
  }
  function closeDiary() {
    var b = $("diary");
    if (b) {
      morphCardFor("diary", "btn-diary-card");
      hideCardNow("diary");
    }
  }
  function flushDiary(btn) {
    if (!window.Diary) return;
    var n = Diary.pendingCount();
    var needDigest = Diary.needsDigest ? Diary.needsDigest() : false;
    if (!n && !needDigest) {
      diaryState(T("diary.nothing", "这段时间没聊什么，日记没变化"));
      return;
    }
    if (btn) btn.disabled = true;
    diaryState(needDigest && !n ? T("diary.digesting", "正在把过去那几天浓缩成日记…") : T("diary.consolidating", "整理中…"));
    Diary.flushNow().then(function(ok) {
      if (btn) btn.disabled = false;
      _diaryDate = diaryToday();
      renderDiary();
      if (!ok) diaryState(T("diary.kept", "日记整理失败，已保留待整理的内容（下次会再试）"));
    }).catch(function() {
      if (btn) btn.disabled = false;
      diaryState(T("diary.kept", "日记整理失败，已保留待整理的内容（下次会再试）"));
    });
  }
  function wireDiary() {
    var card = $("btn-diary-card");
    if (card && !card.dataset.wired) {
      card.dataset.wired = "1";
      card.onclick = function() {
        var box = $("diary");
        if (!box) return;
        if (box.classList.contains("hidden")) openDiary();
        else closeDiary();
      };
    }
    [$("btn-diary-back")].forEach(function(b) {
      if (b && !b.dataset.wired) {
        b.dataset.wired = "1";
        b.addEventListener("click", closeDiary);
      }
    });
    var fl = $("btn-diary-flush");
    if (fl && !fl.dataset.wired) {
      fl.dataset.wired = "1";
      fl.addEventListener("click", function() {
        flushDiary(fl);
      });
    }
    var clr = $("btn-diary-clear");
    if (clr && !clr.dataset.wired) {
      clr.dataset.wired = "1";
      clr.addEventListener("click", function() {
        var now = Date.now();
        if (now - _diaryClearArm < 3e3) {
          _diaryClearArm = 0;
          if (window.Diary) Diary.clear();
          renderDiary();
          diaryState(T("diary.cleared", "日记已清空"));
        } else {
          _diaryClearArm = now;
          diaryState(T("diary.clearAsk", "清空全部日记？3 秒内再点一次确认（不可撤销）"));
        }
      });
    }
    var pn = $("diary-page-note");
    if (pn && !pn.dataset.wiredNote) {
      pn.dataset.wiredNote = "1";
      pn.addEventListener("input", function() {
        if (!pn.dataset.date) return;
        if (window.Diary) Diary.setNote(pn.dataset.date, pn.value);
      });
    }
    var pv = $("btn-diary-prev"), nx = $("btn-diary-next");
    var td = $("btn-diary-today"), di = $("diary-date");
    if (pv && !pv.dataset.wired) {
      pv.dataset.wired = "1";
      pv.addEventListener("click", function() {
        diaryStep(-1);
      });
    }
    if (nx && !nx.dataset.wired) {
      nx.dataset.wired = "1";
      nx.addEventListener("click", function() {
        diaryStep(1);
      });
    }
    if (td && !td.dataset.wired) {
      td.dataset.wired = "1";
      td.addEventListener("click", function() {
        _diaryDate = diaryToday();
        renderDiary();
      });
    }
    if (di && !di.dataset.wired) {
      di.dataset.wired = "1";
      di.addEventListener("change", function() {
        if (!di.value) return;
        _diaryDate = di.value;
        renderDiary();
      });
    }
  }
  function playIcon(key) {
    var k = String(key);
    var isThis = !!(audioEl.src && lastClipUrl && String(audioEl.src) === String(lastClipUrl) && curClipKey === k);
    var playing = isThis && !audioEl.paused;
    var glyph = playing ? MEM_PAUSE : MEM_PLAY;
    var tip = playing ? T("tip.memPause", "暂停") : T("tip.memPlay", "回放这一句");
    return '<button type="button" class="icon" data-act="play" title="' + esc(tip) + '"><span class="icon-glyph ' + (playing ? "paused" : "play") + '">' + glyph + "</span></button>";
  }
  function bindMemPlayEvents() {
    if (bindMemPlayEvents._done) return;
    bindMemPlayEvents._done = true;
    ["play", "pause", "ended"].forEach(function(ev) {
      audioEl.addEventListener(ev, function() {
        try {
          renderMemory();
        } catch (e) {
        }
      });
    });
  }
  function playClip(key) {
    if (!window.VoiceCache) return;
    VoiceCache.get(key).then(function(blob) {
      if (!blob) {
        memState(T("memPlay.noClip", "这条语音已经不在缓存里了（可能被清理掉了）。"));
        return;
      }
      if (lastClipUrl) {
        try {
          URL.revokeObjectURL(lastClipUrl);
        } catch (e) {
        }
      }
      lastClipUrl = URL.createObjectURL(blob);
      curClipKey = String(key);
      audioEl.src = lastClipUrl;
      audioEl.play().catch(function(e) {
        memState(T("memPlay.fail", "这段语音没能播放出来（{e}）", { e: String(e && e.message || e) }));
      });
      renderMemory();
    }).catch(function(e) {
      memState(T("memPlay.fail", "这段语音没能播放出来（{e}）", { e: String(e && e.message || e) }));
    });
  }
  function cacheClip(url, cardId) {
    if (!window.VoiceCache || !url) return;
    var key = cardId || String(Date.now());
    try {
      fetch(url).then(function(r) {
        return r.ok ? r.blob() : null;
      }).then(function(b) {
        return b ? VoiceCache.put(key, b) : null;
      }).then(function(ok) {
        if (ok && cardId && window.DialogLog) DialogLog.setClip(cardId, key);
      }).catch(function() {
      });
    } catch (e) {
    }
  }
  var SLOT_COUNT = 3, _slotPick = 0;
  function slotStore() {
    try {
      var a = JSON.parse(localStorage.getItem("tsumu.saves.v1") || "[]");
      return Array.isArray(a) ? a : [];
    } catch (e) {
      return [];
    }
  }
  function slotWrite(i, entry) {
    var slots = slotStore();
    while (slots.length <= i) slots.push(null);
    slots[i] = entry;
    put("tsumu.saves.v1", JSON.stringify(slots));
  }
  function currentSlot() {
    var g = function(k) {
      try {
        return localStorage.getItem(k) || "";
      } catch (e) {
        return "";
      }
    };
    var last = "";
    try {
      var cards = window.DialogLog ? DialogLog.list({}) : [];
      if (cards.length) last = String(cards[0].user || cards[0].reply || "").slice(0, 40);
    } catch (e) {
    }
    var settings = g("tsumu.settings.v1");
    try {
      if (window.Config && Config.exportJSONSafe) settings = Config.exportJSONSafe();
    } catch (e) {
    }
    return {
      at: Date.now(),
      label: last,
      settings,
      dialog: g("tsumu.dialog.v1"),
      longterm: g("tsumu.longterm.v1"),
      alarms: g("tsumu.alarms.v1")
    };
  }
  function setPath(obj, path, value) {
    var parts = String(path).split(".");
    var o = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!o[parts[i]] || typeof o[parts[i]] !== "object") o[parts[i]] = {};
      o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = value;
    return obj;
  }
  function renderSlots() {
    var box = $("slot-list"), st = $("slot-state"), sel = $("s-slot");
    if (!box) return;
    if (sel && !sel.options.length) {
      for (var i = 0; i < SLOT_COUNT; i++) {
        var o = document.createElement("option");
        o.value = String(i);
        o.textContent = T("slot.title", "存档槽") + " " + (i + 1);
        sel.appendChild(o);
      }
      sel.value = String(_slotPick);
    }
    var slots = slotStore();
    var html = "";
    for (var k = 0; k < SLOT_COUNT; k++) {
      var s = slots[k];
      html += '<div class="slot-row' + (k === _slotPick ? " sel" : "") + '" data-slot="' + k + '"><b>' + esc(T("slot.title", "存档槽") + " " + (k + 1)) + "</b> " + (s ? "<span>" + esc(stamp(s.at)) + (s.label ? " · " + esc(s.label) : "") + "</span>" : "<span>" + esc(T("slot.empty", "空槽")) + "</span>") + (s ? ' <button type="button" class="mini-btn" data-slotdel="' + k + '">' + esc(T("slot.delete", "删除")) + "</button>" : "") + "</div>";
    }
    box.innerHTML = html;
    if (st) {
      st.textContent = T("slot.emptyHint", "点左侧「保存」存入当前进度");
      if (window.SaveData && SaveData.hasBackup && SaveData.hasBackup()) {
        var bi = SaveData.backupInfo ? SaveData.backupInfo() : null;
        st.textContent = T("settings.undoImport", "撤销导入") + ": " + (bi ? stamp(bi.at) : "");
      }
    }
    var undoBtn = $("btn-undo-import");
    if (undoBtn) undoBtn.disabled = !(window.SaveData && SaveData.hasBackup && SaveData.hasBackup());
    var loadBtn = $("btn-slot-load");
    if (loadBtn) loadBtn.disabled = !slotStore()[_slotPick];
  }
  function download(name, text) {
    try {
      var blob = new Blob([text], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function() {
        try {
          a.remove();
          URL.revokeObjectURL(url);
        } catch (e) {
        }
      }, 1e3);
      return true;
    } catch (e) {
      return false;
    }
  }
  function reloadSoon(ms) {
    setTimeout(function() {
      try {
        location.reload();
      } catch (e) {
      }
    }, ms || 400);
  }
  function wireSaveData() {
    var ex = $("btn-export"), im = $("btn-import"), fi = $("file-import"), un = $("btn-undo-import");
    var sv = $("btn-slot-save"), ld = $("btn-slot-load"), sel = $("s-slot"), box = $("slot-list");
    if (ex && !ex.dataset.wired) {
      ex.dataset.wired = "1";
      ex.onclick = function() {
        if (!window.SaveData) return;
        var ok = download(SaveData.fileName(), SaveData.pack());
        hint(ok ? T("settings.exportDone", "已导出（浏览器会把它存到下载目录）") : T("slot.exportFail", "导出失败：") + "download", !ok);
        renderSlots();
      };
    }
    if (im && !im.dataset.wired) {
      im.dataset.wired = "1";
      im.onclick = function() {
        if (fi) fi.click();
      };
    }
    if (fi && !fi.dataset.wired) {
      fi.dataset.wired = "1";
      fi.onchange = function() {
        var f = fi.files && fi.files[0];
        fi.value = "";
        if (!f || !window.SaveData) return;
        var r = new FileReader();
        r.onload = function() {
          var text = String(r.result || "");
          var meta = null;
          try {
            meta = (JSON.parse(text) || {}).meta || null;
          } catch (e) {
            meta = null;
          }
          if (!meta || meta.fmt !== SaveData.FMT) {
            hint(T("settings.importFail", "配置解析失败：") + "NOT_SAVE", true);
            return;
          }
          if (meta.scope === "slot") {
            var p;
            try {
              p = SaveData.unpackSlot(text);
            } catch (e) {
              hint(T("slot.importFail", "导入失败：") + (e && e.message || e), true);
              return;
            }
            try {
              SaveData.applySlot(_slotPick, p, { restoreExtra: true });
              hint(T("slot.imported", "已导入到第 {n} 档，正在重载…", { n: _slotPick + 1 }));
              loadSlot(_slotPick);
            } catch (e) {
              hint(T("slot.importFail", "导入失败：") + (e && e.message || e), true);
            }
            return;
          }
          var parsed;
          try {
            parsed = SaveData.unpack(text);
          } catch (e) {
            hint(T("settings.importFail", "配置解析失败：") + (e && e.message || e), true);
            return;
          }
          var desc = SaveData.describe(parsed).map(function(d) {
            return d.label;
          }).join(" · ");
          if (!window.confirm(T("settings.importAsk", "导入会覆盖当前进度（会自动备份，可撤销）。继续？") + "\n" + desc)) return;
          try {
            SaveData.apply(parsed);
            hint(T("slot.imported", "已导入到第 {n} 档，正在重载…", { n: 1 }));
            reloadSoon(500);
          } catch (e) {
            hint(T("settings.importFail", "配置解析失败：") + (e && e.message || e), true);
          }
        };
        try {
          r.readAsText(f);
        } catch (e) {
          hint(T("settings.importFail", "配置解析失败：") + "READ", true);
        }
      };
    }
    if (un && !un.dataset.wired) {
      un.dataset.wired = "1";
      un.onclick = function() {
        if (!window.SaveData || !SaveData.hasBackup()) {
          hint(T("settings.noBackup", "没有可撤销的导入"), true);
          return;
        }
        var n = SaveData.undo();
        hint(T("settings.undoOk", "已撤销（恢复了 {n} 项）", { n }));
        reloadSoon(500);
      };
    }
    if (sel && !sel.dataset.wired) {
      sel.dataset.wired = "1";
      sel.onchange = function() {
        _slotPick = Number(sel.value) || 0;
        renderSlots();
      };
    }
    if (sv && !sv.dataset.wired) {
      sv.dataset.wired = "1";
      sv.onclick = function() {
        try {
          slotWrite(_slotPick, currentSlot());
          hint(T("slot.saved", "已保存到第 {n} 档", { n: _slotPick + 1 }));
          renderSlots();
        } catch (e) {
          hint(T("slot.importFail", "导入失败：") + (e && e.message || e), true);
        }
      };
    }
    if (ld && !ld.dataset.wired) {
      ld.dataset.wired = "1";
      ld.onclick = function() {
        loadSlot(_slotPick);
      };
    }
    if (box && !box.dataset.wired) {
      box.dataset.wired = "1";
      box.addEventListener("click", function(e) {
        var b = e.target;
        if (!b || !b.dataset) return;
        if (b.dataset.slotdel !== void 0) {
          var i = Number(b.dataset.slotdel);
          var slots = slotStore();
          slots[i] = null;
          put("tsumu.saves.v1", JSON.stringify(slots));
          hint(T("slot.deleted", "已删除第 {n} 档", { n: i + 1 }));
          renderSlots();
        } else if (b.dataset.slot !== void 0) {
          _slotPick = Number(b.dataset.slot) || 0;
          if (sel) sel.value = String(_slotPick);
          renderSlots();
        }
      });
    }
  }
  function loadSlot(i) {
    var slots = slotStore();
    var s = slots[i];
    if (!s) {
      hint(T("slot.emptyNoExport", "这个槽是空的，先保存一次"), true);
      return;
    }
    if (!window.confirm(T("slot.confirmLoad", "读取第 {n} 档？会覆盖当前进度（读取前自动备份，可撤销）。", { n: i + 1 }))) return;
    try {
      if (window.SaveData && SaveData.backup) SaveData.backup();
    } catch (e) {
    }
    try {
      if (s.settings) {
        var raw = s.settings;
        try {
          var secrets = window.Config && Config.getSecrets ? Config.getSecrets() : null;
          if (secrets) {
            var j = JSON.parse(raw);
            Object.keys(secrets).forEach(function(path) {
              setPath(j, path, secrets[path]);
            });
            raw = JSON.stringify(j);
          }
        } catch (e) {
        }
        put("tsumu.settings.v1", raw);
      }
      if (s.dialog != null) put("tsumu.dialog.v1", s.dialog);
      if (s.longterm != null) put("tsumu.longterm.v1", s.longterm);
      if (s.alarms != null) put("tsumu.alarms.v1", s.alarms);
      hint(T("slot.loaded", "已读取第 {n} 档，正在重载…", { n: i + 1 }));
      reloadSoon(500);
    } catch (e) {
      hint(T("slot.importFail", "导入失败：") + (e && e.message || e), true);
    }
  }
  function refreshFeatureTexts() {
    renderPromptState();
    renderLongMem();
    renderSlots();
    renderMemory();
  }
  function wireFeatures() {
    wireMemory();
    bindMemPlayEvents();
    wireDiary();
    wireSaveData();
    var on = $("s-ltm-on");
    if (on && !on.dataset.wired) {
      on.dataset.wired = "1";
      on.onchange = function() {
        try {
          Config.set("longterm.enabled", !!on.checked);
          if (Config.save) Config.save();
        } catch (e) {
        }
        renderLongMem();
      };
    }
    var now = $("btn-ltm-now");
    if (now && !now.dataset.wired) {
      now.dataset.wired = "1";
      now.onclick = function() {
        flushLongMem(now);
      };
    }
    var lv = $("btn-ltm-view");
    if (lv && !lv.dataset.wired) {
      lv.dataset.wired = "1";
      lv.onclick = function() {
        toggleLtmView();
      };
    }
    var av = $("btn-archive-view");
    if (av && !av.dataset.wired) {
      av.dataset.wired = "1";
      av.onclick = function() {
        toggleArchiveView();
      };
    }
    var an = $("btn-archive-now");
    if (an && !an.dataset.wired) {
      an.dataset.wired = "1";
      an.onclick = function() {
        flushLongMem(an);
      };
    }
    var ac = $("btn-archive-clear");
    if (ac && !ac.dataset.wired) {
      ac.dataset.wired = "1";
      ac.onclick = function() {
        if (!window.LongMem || !LongMem.clearArchive) return;
        var n = 0;
        try {
          n = LongMem.archive().length;
        } catch (e) {
        }
        if (!n) {
          renderArchiveList(T("settings.archiveIsEmpty", "本来就是空的"));
          return;
        }
        if (Date.now() - _archiveArm < 4e3) {
          _archiveArm = 0;
          if (_archiveTimer) {
            clearTimeout(_archiveTimer);
            _archiveTimer = null;
          }
          LongMem.clearArchive();
          hint(T("settings.archiveDeleted", "已清空重要回忆"));
          renderArchiveList();
          return;
        }
        _archiveArm = Date.now();
        var lbl = $("btn-archive-clear");
        if (lbl) lbl.textContent = T("settings.archiveDeleteAsk", "再点一次确认删除");
        renderArchiveList(T("settings.archiveDeleteWarn", "⚠️ 4 秒内再点一次才会真的删（共 {n} 条）", { n }));
        if (_archiveTimer) clearTimeout(_archiveTimer);
        _archiveTimer = setTimeout(function() {
          _archiveArm = 0;
          _archiveTimer = null;
          var b = $("btn-archive-clear");
          if (b) b.textContent = T("settings.archiveDelete", "清空重要回忆");
          renderArchiveList();
        }, 4e3);
      };
    }
    var ab = $("archive-box");
    if (ab && ab.style.display !== "none") renderArchiveList();
    var tst = $("btn-ltm-test");
    if (tst && !tst.dataset.wired) {
      tst.dataset.wired = "1";
      tst.onclick = function() {
        testModelFit(tst);
      };
    }
    var clr = $("btn-ltm-clear");
    if (clr && !clr.dataset.wired) {
      clr.dataset.wired = "1";
      clr.onclick = function() {
        if (!window.LongMem) return;
        if (!window.confirm(T("memory.clearLogAsk", "只清空近期对白记录，长期记忆卡片会留下。确定？"))) return;
        LongMem.clear();
        if (window.DialogLog) DialogLog.clear();
        hint(T("ltm.cleared", "已清空"));
        renderLongMem();
        renderMemory();
      };
    }
    var rc = $("btn-prompt-reset-chara"), rw = $("btn-prompt-reset-world");
    if (rc && !rc.dataset.wired) {
      rc.dataset.wired = "1";
      rc.onclick = function() {
        if (window.Prompts) Prompts.resetChara();
        var el = $("s-prompt-chara");
        if (el) el.value = window.Prompts ? Prompts.DEFAULT_CHARA || "" : "";
        renderPromptState();
        hint(T("prompt.resetDone", "已恢复内置默认文本"));
      };
    }
    if (rw && !rw.dataset.wired) {
      rw.dataset.wired = "1";
      rw.onclick = function() {
        if (window.Prompts) Prompts.resetWorld();
        var el = $("s-prompt-world");
        if (el) el.value = window.Prompts ? Prompts.DEFAULT_WORLD || "" : "";
        renderPromptState();
        hint(T("prompt.resetDone", "已恢复内置默认文本"));
      };
    }
    var mb = $("btn-memory");
    if (mb && !mb.dataset.wired) {
      mb.dataset.wired = "1";
      mb.onclick = function() {
        var box = $("memory");
        if (!box) return;
        if (box.classList.contains("hidden")) openMemory();
        else closeMemory();
      };
    }
    if (window.VoiceCache && VoiceCache.setProtected && window.DialogLog) {
      VoiceCache.setProtected(function(key) {
        try {
          var cards = DialogLog.list({ favOnly: true });
          for (var i = 0; i < cards.length; i++) if (cards[i].clip === key) return true;
        } catch (e) {
        }
        return false;
      });
    }
  }
  var _dual = false;
  function buildMessage() {
    var narrEl = $("input-narr");
    var n = _dual && narrEl ? String(narrEl.value || "").trim() : "";
    var d = String(($("input") || {}).value || "").trim();
    return n ? "旁白：" + n + (d ? "\n\n" + d : "") : d;
  }
  function syncNarrCfg() {
    var n = $("input-narr");
    if (!n) return;
    var want = _dual && !!String(n.value || "").trim();
    var cur = false;
    try {
      cur = !!Config.section("state").narration;
    } catch (e) {
    }
    if (want === cur) return;
    try {
      Config.set("state.narration", want);
    } catch (e) {
    }
    var cb = $("s-narr-on");
    if (cb) cb.checked = want;
    if (want) hint(T("ui.narrAutoOn", "已打开「额外旁白」：她会在回复里多写一行「旁白：」。可在设置里关掉。"));
  }
  function setDual(on) {
    var narrEl = $("input-narr");
    var input = $("input");
    var btn = $("btn-dual");
    if (!narrEl || !input || !btn) return;
    on = !!on;
    if (on === _dual) {
      narrEl.classList.toggle("hidden", !on);
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      syncNarrCfg();
      autogrow();
      return;
    }
    if (!on) {
      var nv = String(narrEl.value || "").trim();
      var dv = String(input.value || "").trim();
      if (nv) input.value = "旁白：" + nv + (dv ? "\n\n" + dv : "");
      narrEl.value = "";
    }
    _dual = on;
    narrEl.classList.toggle("hidden", !on);
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    autogrow();
    try {
      requestAnimationFrame(autogrow);
    } catch (e) {
    }
    try {
      (on ? narrEl : input).focus();
    } catch (e) {
    }
    syncNarrCfg();
  }
  function growOne(el) {
    if (!el) return;
    el.style.height = "auto";
    var by = 0, cap = 0;
    try {
      var cs = getComputedStyle(el);
      by = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
      cap = parseFloat(cs.maxHeight) || 0;
    } catch (e) {
    }
    if (!(cap > 0)) cap = 120;
    var need = Math.ceil(el.scrollHeight + by) + 1;
    el.style.height = Math.min(cap, need) + "px";
    el.style.overflowY = need > cap ? "auto" : "hidden";
  }
  function autogrow() {
    growOne($("input"));
    var n = $("input-narr");
    if (n && !n.classList.contains("hidden")) growOne(n);
  }
  var chatUnread = false;
  var chatBooted = false;
  function chatIsCollapsed() {
    var el = $("chat");
    return !!(el && el.classList.contains("collapsed"));
  }
  function paintChatToggle() {
    var t = $("btn-chat-toggle"), b = $("chat-badge");
    if (t) t.setAttribute("aria-expanded", chatIsCollapsed() ? "false" : "true");
    if (b) b.classList.toggle("hidden", !(chatUnread && chatIsCollapsed()));
  }
  function setChatOpen(open) {
    var el = $("chat");
    if (!el) return;
    var fnLift = open ? fnLiftFor(measureExpandedChatH()) : 0;
    el.classList.toggle("collapsed", !open);
    setFnLift(fnLift);
    fnAnimating = true;
    setTimeout(function() {
      fnAnimating = false;
    }, 520);
    var i = $("input");
    if (open) {
      chatUnread = false;
      requestAnimationFrame(function() {
        scrollBottom();
      });
      setTimeout(function() {
        scrollBottom();
        autogrow();
        syncFnLift();
      }, 360);
      if (i) {
        try {
          i.focus();
        } catch (e) {
        }
      }
    } else if (i) {
      try {
        i.blur();
      } catch (e) {
      }
    }
    paintChatToggle();
  }
  function wireChatToggle() {
    var t = $("btn-chat-toggle");
    if (t) t.addEventListener("click", function() {
      setChatOpen(chatIsCollapsed());
    });
    paintChatToggle();
  }
  var FN_LIFT_GAP = 10;
  var fnAnimating = false;
  function fnLiftFor(chatH) {
    return Math.round(chatH) + FN_LIFT_GAP;
  }
  function setFnLift(px) {
    var fn = $("fn");
    if (fn) fn.style.setProperty("--fn-lift", (px > 0 ? px : 0) + "px");
  }
  function measureExpandedChatH() {
    var el = $("chat");
    if (!el) return 0;
    var c = el.cloneNode(true);
    c.className = "";
    c.style.cssText = "position:fixed;left:-9999px;top:0;right:auto;bottom:auto;margin:0;visibility:hidden;pointer-events:none";
    document.body.appendChild(c);
    var h = c.getBoundingClientRect().height;
    document.body.removeChild(c);
    return h;
  }
  function syncFnLift() {
    var el = $("chat");
    if (!el) return;
    if (chatIsCollapsed()) {
      setFnLift(0);
      return;
    }
    setFnLift(fnLiftFor(el.getBoundingClientRect().height));
  }
  function fnIsOpen() {
    var el = $("fn");
    return !!(el && !el.classList.contains("collapsed"));
  }
  function paintFnDock() {
    var t = $("btn-fn-toggle"), el = $("fn");
    if (t) t.setAttribute("aria-expanded", fnIsOpen() ? "true" : "false");
    if (el) {
      var list = $("fn-list");
      if (list) el.style.setProperty("--fn-n", String(list.children.length || 1));
    }
  }
  function setFnOpen(open) {
    var el = $("fn");
    if (!el) return;
    el.classList.toggle("collapsed", !open);
    paintFnDock();
  }
  function wireFnDock() {
    var el = $("fn"), t = $("btn-fn-toggle");
    if (t && !t.dataset.wired) {
      t.dataset.wired = "1";
      t.addEventListener("click", function() {
        setFnOpen(!fnIsOpen());
      });
    }
    if (el && !el.dataset.wiredItems) {
      el.dataset.wiredItems = "1";
      el.addEventListener("click", function(e) {
        var b = e.target && e.target.closest ? e.target.closest(".fn-btn") : null;
        if (b) setFnOpen(false);
      });
    }
    var chatEl = $("chat");
    if (chatEl && window.ResizeObserver && !chatEl.dataset.wiredLift) {
      chatEl.dataset.wiredLift = "1";
      try {
        new ResizeObserver(function() {
          if (!fnAnimating) syncFnLift();
        }).observe(chatEl);
      } catch (e) {
      }
    }
    paintFnDock();
  }
  function boot() {
    try {
      console.error("[Tsumu] boot ok · page=" + (location.pathname || "/") + " · Config=" + typeof Config + " · Api=" + typeof Api + " · I18n=" + typeof I18n);
    } catch (e) {
    }
    try {
      if (Config.hydrate) Config.hydrate();
    } catch (e) {
    }
    try {
      var st = Config.section("state") || {};
      if (!st.mode) Config.set("state.mode", "chat");
      if (!st.style) Config.set("state.style", "voice");
    } catch (e) {
    }
    fillLangSelects();
    applyLang();
    try {
      $("s-tts-on").checked = (Config.section("tts") || {}).mode !== "off";
    } catch (e) {
    }
    function replyFormatMatchesSwitch(raw) {
      try {
        var t2 = String(raw == null ? "" : raw);
        if (!t2) return false;
        var lines = t2.split("\n"), tsumu = "";
        for (var i = 0; i < lines.length; i++) {
          if (/^\s*织音\s*[：:]/.test(lines[i])) {
            tsumu = lines[i];
            break;
          }
        }
        return !/[\u3040-\u309f\u30a0-\u30ff]/.test(tsumu);
      } catch (e) {
        return false;
      }
    }
    try {
      if (window.DialogLog && window.DialogLog.list) {
        var turns = Math.max(1, (Config.section("llm") || {}).historyTurns || 12);
        var recent = DialogLog.list({}).slice(0, turns).reverse();
        var skipped = 0;
        recent.forEach(function(c) {
          if (!c || !c.raw) return;
          if (!replyFormatMatchesSwitch(c.raw)) {
            skipped++;
            return;
          }
          if (c.user) history.push({ role: "user", content: c.user });
          history.push({ role: "assistant", content: c.raw });
        });
        if (history.length) console.error("[Tsumu] 已回填 " + Math.round(history.length / 2) + " 轮上下文");
        if (skipped) console.error("[Tsumu] 跳过 " + skipped + " 轮格式不符的上下文（语言基准反转）");
      }
    } catch (e) {
    }
    addMsg("ai", T("ui.greeting"));
    if (cfg().llm.apiKey) setStatus(isAsmr() ? "ui.modeAsmr" : "status.ready");
    else setStatus("status.unconfigured", true);
    syncAsmrBtn();
    syncDiaryBtn();
    $("btn-send").onclick = send;
    $("btn-settings").onclick = openSettings;
    [["settings", closeSettings], ["memory", closeMemory], ["diary", closeDiary], ["todo", closeTodo], ["pomo", closePomo]].forEach(function(p) {
      var box = $(p[0]);
      if (!box || box.dataset.wiredBackdrop) return;
      box.dataset.wiredBackdrop = "1";
      box.addEventListener("click", function(e) {
        if (e.target === box) {
          try {
            p[1]();
          } catch (err) {
          }
        }
      });
    });
    (function() {
      var sp = $("settings");
      if (!sp || sp.dataset.wiredAuto) return;
      sp.dataset.wiredAuto = "1";
      sp.addEventListener("change", function() {
        try {
          saveSettings({ silent: true });
        } catch (e) {
        }
      });
    })();
    $("btn-asmr").onclick = toggleAsmr;
    $("btn-diary").onclick = toggleDiary;
    var t = $("input");
    t.addEventListener("input", autogrow);
    var dualBtn = $("btn-dual");
    if (dualBtn) dualBtn.addEventListener("click", function() {
      setDual(!_dual);
    });
    var narr = $("input-narr");
    if (narr) {
      narr.addEventListener("input", function() {
        autogrow();
        syncNarrCfg();
      });
      narr.addEventListener("keydown", function(e) {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          send();
        }
      });
    }
    t.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        send();
      }
    });
    var narrSw = $("s-narr-on");
    if (narrSw) {
      narrSw.checked = !!(Config.section("state") || {}).narration;
      narrSw.addEventListener("change", function() {
        try {
          Config.set("state.narration", !!narrSw.checked);
        } catch (e) {
        }
      });
    }
    var ttsLangSel = $("s-tts-lang");
    if (ttsLangSel) {
      ttsLangSel.value = ttsLang();
      ttsLangSel.addEventListener("change", function() {
        try {
          var vl = String(ttsLangSel.value || "zh");
          if (vl !== "ja" && vl !== "en") vl = "zh";
          Config.set("llm.lang", "zh");
          Config.set("translate.lang", voiceReadOn() ? vl : "zh");
          Config.set("tts.lang", vl);
          if (Config.save) Config.save();
          try {
            history = [];
          } catch (e2) {
          }
        } catch (e) {
        }
      });
    }
    var wcity = $("s-web-city"), wprov = $("s-web-provider"), wkey = $("s-web-key");
    if (wprov && window.WebSrc && WebSrc.providers) {
      try {
        wprov.innerHTML = "";
        WebSrc.providers().forEach(function(p) {
          var o = document.createElement("option");
          o.value = p.id;
          o.textContent = p.label;
          wprov.appendChild(o);
        });
      } catch (e) {
      }
    }
    try {
      var wcur = Config.section("web") || {};
      if (wcity) wcity.value = wcur.city || "";
      if (wprov && wcur.searchProvider) wprov.value = wcur.searchProvider;
      if (wkey) wkey.value = wcur.searchKey || "";
    } catch (e) {
    }
    function saveWeb() {
      try {
        Config.set("web.city", wcity ? wcity.value.trim() : "");
        Config.set("web.searchProvider", wprov ? wprov.value : "tavily");
        Config.set("web.searchKey", wkey ? wkey.value.trim() : "");
        if (Config.save) Config.save();
      } catch (e) {
      }
      try {
        if (window.Weather) Weather.reset();
      } catch (e) {
      }
      try {
        if (window.WebSrc) WebSrc.reset();
      } catch (e) {
      }
      _webTestMsg = "";
      renderWebStatus();
      try {
        syncWebKeyPh();
      } catch (e) {
      }
      hint(T("toast.saved", "已保存"));
    }
    var webTimer = 0;
    function saveWebSoon() {
      if (webTimer) clearTimeout(webTimer);
      webTimer = setTimeout(saveWeb, 400);
    }
    [wcity, wprov, wkey].forEach(function(elx) {
      if (!elx) return;
      elx.addEventListener("input", saveWebSoon);
      elx.addEventListener("change", saveWeb);
      elx.addEventListener("blur", saveWeb);
    });
    wireImgSettings();
    wireImgProtect();
    try {
      if (window.TsumuL2d) {
        window.TsumuL2d.onSwitchModel = function(ref) {
          try {
            Config.set("avatar.model", ref);
            if (Config.save) Config.save();
          } catch (e) {
          }
          try {
            syncTexTierRow();
          } catch (e) {
          }
        };
      }
    } catch (e) {
    }
    wireModelList();
    wireNoModelGuide();
    wireImage();
    wireStoreWarn();
    var wtest = $("s-web-test");
    if (wtest) {
      wtest.addEventListener("click", function() {
        if (!window.WebSrc) return;
        wtest.disabled = true;
        hint(T("web.testing", "正在测试…"));
        WebSrc.probe("今天有什么新闻").then(function(r) {
          wtest.disabled = false;
          if (r && r.ok && r.count > 0) {
            _webTestMsg = T("web.testOk", "✅ 通了：返回 {n} 条结果", { n: r.count });
          } else if (r && r.ok) {
            _webTestMsg = T(
              "web.testEmpty",
              "⚠️ 接口通了，但没解析出结果 · 顶层键：{k} · 片段：{s}",
              { k: r.keys || "?", s: String(r.sample || "").slice(0, 160) }
            );
          } else if (r && r.error === "no-key") {
            _webTestMsg = T("web.testNoKey", "❌ 还没填 API Key");
          } else if (r && r.error === "no-balance") {
            _webTestMsg = T("web.testBalance", "❌ 余额不足：这个账号没有可用额度（HTTP 402）");
          } else if (r && r.error === "http") {
            _webTestMsg = T("web.testHttp", "❌ HTTP {s}：key 无效 / 未开通该服务 / 权限不足", { s: r.status });
          } else if (r && r.error === "body") {
            _webTestMsg = T("web.testBody", "❌ 接口返回了错误：{m}", { m: String(r.detail || "").slice(0, 160) }) + (r.tried ? "（试过：" + r.tried + "）" : "");
          } else if (r && r.error === "timeout") {
            _webTestMsg = T("web.testTimeout", "❌ 超时：网络不通，或这个服务访问不到") + (r.model ? "（model: " + r.model + "）" : "");
          } else {
            _webTestMsg = T("web.testFail", "❌ 失败：{e}", { e: r && r.error || "?" });
          }
          renderWebStatus();
          hint(_webTestMsg, !(r && r.ok));
        }).catch(function(e) {
          wtest.disabled = false;
          _webTestMsg = T("web.testFail", "❌ 失败：{e}", { e: String(e && e.message || e) });
          renderWebStatus();
          hint(_webTestMsg, true);
        });
      });
    }
    var ehs = $("s-expr-hold");
    if (ehs) {
      try {
        var ecur = (Config.section("app") || {}).exprHold;
        ehs.value = String(ecur == null ? 20 : ecur);
      } catch (e) {
      }
      ehs.addEventListener("change", function() {
        var v = Number(ehs.value);
        if (!isFinite(v) || v < 0) v = 20;
        try {
          Config.set("app.exprHold", v);
          if (Config.save) Config.save();
        } catch (e) {
        }
        if (!v) cancelEmoTimer();
        else if (_emoPreset) armEmoTimer(_emoPreset);
        hint(T("toast.saved", "已保存"));
      });
    }
    $("s-tts-provider").addEventListener("change", syncTtsFields);
    $("s-lang-ui").addEventListener("change", function() {
      try {
        Config.set("app.lang", $("s-lang-ui").value || "zh");
        if (Config.save) Config.save();
      } catch (e) {
      }
      applyLang();
      hint(T("toast.saved", "已保存"));
    });
    var tierSel = $("s-tex-tier");
    if (tierSel) {
      tierSel.addEventListener("change", function() {
        var v = tierSel.value;
        var label = tierSel.options && tierSel.selectedIndex >= 0 && tierSel.options[tierSel.selectedIndex] ? tierSel.options[tierSel.selectedIndex].textContent : v;
        try {
          Config.set("avatar.texTier", v);
          if (Config.save) Config.save();
        } catch (e) {
        }
        if (!(window.TsumuL2d && window.TsumuL2d.setTexTier)) {
          hint(T("toast.saved", "已保存"));
          return;
        }
        hint(T("toast.texSwitching", "正在切换立绘模式…"));
        window.TsumuL2d.setTexTier(v).then(function(ok) {
          hint(
            T(
              ok ? "toast.texSwitched" : "toast.texSwitchFail",
              ok ? "已切换到{v}（立绘已重新加载）" : "立绘模式切换失败，已保留原来的立绘",
              { v: label }
            ),
            !ok
          );
        });
      });
    }
    wireFeatures();
    refreshFeatureTexts();
    var back = $("btn-back");
    if (back) back.onclick = closeSettings;
    document.addEventListener("keydown", function(e) {
      if (e.key !== "Escape") return;
      var mem = $("memory");
      if (mem && !mem.classList.contains("hidden")) {
        closeMemory();
        return;
      }
      var st2 = $("settings");
      if (st2 && !st2.classList.contains("hidden")) {
        closeSettings();
        return;
      }
      if (fnIsOpen()) {
        setFnOpen(false);
        return;
      }
      if (!chatIsCollapsed()) setChatOpen(false);
    });
    wireChatToggle();
    wireFnDock();
    if (!chatIsCollapsed()) t.focus();
    chatBooted = true;
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else boot();
})();
