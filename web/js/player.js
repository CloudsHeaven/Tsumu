(function(global) {
  "use strict";
  function T(key, fb, map) {
    try {
      if (global.I18n && I18n.tf && key) return I18n.tf(key, fb === void 0 ? key : fb, map);
    } catch (e) {
    }
    var s = fb === void 0 ? key : fb;
    if (map) Object.keys(map).forEach(function(k) {
      s = s.split("{" + k + "}").join(map[k]);
    });
    return s;
  }
  function $(id) {
    return document.getElementById(id);
  }
  var el = {};
  var audio = null;
  var pendingSeek = -1;
  var viewBeforeChat = null;
  var openedWhileExpanded = false;
  var compactClearT = 0;
  var cardMorphT = 0, cardClosingT = 0;
  var lastMorph = null;
  var morphNeedsRematch = false;
  var inCardOpen = false;
  var actx = null, gain = null, analyser = null, srcNode = null, wave = null;
  var tracks = [], nowTrack = null, nowLib = null, lines = null, lineIdx = -2;
  var activeLib = "asmr";
  var filterDir = { asmr: "", music: "" };
  var folderMode = false, folderScrollT = 0;
  var filterOpen = { asmr: false, music: false };
  var rafId = 0, playing = false, liveLevel = 0, route = "idle";
  var envData = null;
  var userVol = 0.9, ducking = false;
  var restoreState = { asmr: "none", music: "none" };
  var noteTimer = 0;
  var CFG = {
    spacing: 46,

    maxRot: 60,

    rotK: 0.55,

    depth: 70,

    scaleK: 0.16,

    persp: 600,

    zBase: 100,

    win: 4,

    maxD: 7,

    dragTrack: 1
  };
  var flowView = "list";
  var flowPos = 0;
  var flowItems = [];
  var flowV = 0;
  var _activeDesc = null;
  var flowTarget = null;
  var flowRaf = 0, flowSyncRaf = 0;
  var flowReduced = null;
  var flowDown = null;
  var POSE_BY_LIB = { music: "麦克风", asmr: "提裙子" };
  var _pose = null;
  function applyPose() {
    var want = playing && nowLib && POSE_BY_LIB[nowLib] ? POSE_BY_LIB[nowLib] : null;
    if (want === _pose) return;
    var S = global.TsumuL2d;
    if (_pose && S && S.releaseBorrowedExpr) {
      try {
        S.releaseBorrowedExpr();
      } catch (e) {
      }
    }
    _pose = null;
    if (want && S && S.borrowExpr) {
      var ok = false;
      try {
        ok = !!S.borrowExpr(want);
      } catch (e) {
      }
      if (ok) {
        var owns = null;
        try {
          owns = S.borrowedExpr ? S.borrowedExpr() : want;
        } catch (e) {
        }
        if (owns === want) _pose = want;
      }
    }
  }
  global.TsumuMouthLive = {

    active: function() {
      if (!playing || !audio || audio.paused) return false;
      return route === "live" || !!envData;
    },
    level: function() {
      return liveLevel;
    },
    route: function() {
      return route;
    },
    env: function() {
      return !!envData;
    }

  };
  function fmt(sec) {
    sec = Number(sec);
    if (!isFinite(sec) || sec < 0) sec = 0;
    var s = Math.floor(sec % 60), m = Math.floor(sec / 60) % 60, h = Math.floor(sec / 3600);
    var mm = h ? m < 10 ? "0" + m : m : m;
    return (h ? h + ":" + mm : mm) + ":" + (s < 10 ? "0" + s : s);
  }
  function note(msg, bad, sticky) {
    var n = el.note;
    if (!n) return;
    n.textContent = msg || "";
    n.classList.toggle("bad", !!bad);
    n.classList.toggle("hidden", !msg);
    var noNote = !msg || n.classList.contains("hidden");
    if (el.card) {
      el.card.classList.toggle("no-note", noNote);
      el.card.style.display = noNote && flowView === "cover" ? "none" : "";
    }
    if (noteTimer) {
      clearTimeout(noteTimer);
      noteTimer = 0;
    }
    if (msg && !sticky) noteTimer = setTimeout(function() {
      n.classList.add("hidden");
      if (el.card) el.card.classList.add("no-note");
    }, 6e3);
  }
  var emptyHintMsg = "";
  function pickedKey(lib) {
    return "tsumu.audio.picked." + lib;
  }
  function rememberPicked(lib) {
    try {
      localStorage.setItem(pickedKey(lib), "1");
    } catch (e) {
    }
  }
  function wasPicked(lib) {
    try {
      return localStorage.getItem(pickedKey(lib)) === "1";
    } catch (e) {
      return false;
    }
  }
  function hintKind(lib) {
    var st = restoreState[lib];
    if (st === "lost") return "lost";
    if (st === "prompt" && wasPicked(lib)) return "prompt";
    return "none";
  }
  function emptyHintOn() {
    var kindH = hintKind(activeLib);
    emptyHintMsg = kindH === "lost" ? T("audio.flowLostHint", "上次的文件夹已失效，请切换列表模式重新选择") : kindH === "prompt" ? T("audio.folderGone", "上次的文件夹要重新授权 —— 点一下界面任意处即可继续") : T("audio.flowEmptyHint", "请切换到列表模式，选择本地 ASMR / 音乐所在文件夹");
    note(emptyHintMsg, false, true);
  }
  function emptyHintOff() {
    if (emptyHintMsg && el.note && el.note.textContent === emptyHintMsg) note("");
    emptyHintMsg = "";
  }
  function cardOpen() {
    return !!(el.card && !el.card.classList.contains("collapsed"));
  }
  function paintBarVisibility() {
    var chatEl = $("chat");
    var chatCollapsed = !chatEl || chatEl.classList.contains("collapsed");
    var vk2 = $("pl-view");
    if (vk2) vk2.style.display = "";
    var fn0 = $("fn");
    if (fn0) fn0.style.zIndex = "7";
    if (el.lyric) el.lyric.style.zIndex = "8";
    if (el.lyric) el.lyric.classList.toggle("hidden", !nowTrack && !cardOpen());
    var sk = $("player-seek");
    if (sk) {
      if (chatCollapsed) {
        sk.style.display = "block";
        sk.style.position = "absolute";
        sk.style.left = "26px";
        sk.style.right = "26px";
        sk.style.bottom = "-7px";
        sk.style.height = "4px";
        sk.style.padding = "6px 0";
        sk.style.boxSizing = "content-box";
        sk.style.backgroundColor = "rgba(255, 255, 255, .20)";
        sk.style.borderRadius = "2px";
        sk.style.backgroundClip = "content-box";
        sk.style.touchAction = "none";
      } else {
        sk.style.display = "";
        sk.style.position = "";
        sk.style.left = "";
        sk.style.right = "";
        sk.style.bottom = "";
        sk.style.height = "";
        sk.style.padding = "";
        sk.style.boxSizing = "";
        sk.style.backgroundClip = "";
        sk.style.borderRadius = "";
        sk.style.backgroundColor = "";
        sk.style.touchAction = "";
      }
    }
    if (el.card) {
      if (!chatCollapsed && cardOpen()) {
        clearTimeout(compactClearT);
        var pr3 = el.lyric ? el.lyric.getBoundingClientRect() : null;
        var covEl = $("player-cover");
        var covR = covEl ? covEl.getBoundingClientRect() : null;
        var vh = global.innerHeight || 862, vw = global.innerWidth || 420;
        var h3 = covR && covR.height > 40 ? Math.round(covR.height) : 160;
        var w3 = covR && covR.width > 40 ? Math.round(covR.width) : h3;
        var gapR = pr3 ? Math.max(0, Math.round(vw - pr3.right)) : 12;
        var bottomY = pr3 ? Math.round(pr3.top - 10) : Math.round(vh * 0.62);
        el.card.style.right = "auto";
        el.card.style.left = Math.round(vw - gapR - w3) + "px";
        el.card.style.width = w3 + "px";
        el.card.style.top = "auto";
        el.card.style.bottom = Math.max(0, Math.round(vh - bottomY)) + "px";
        el.card.style.height = h3 + "px";
        el.card.style.maxHeight = h3 + "px";
        el.card.style.overflowY = "auto";
      } else {
        clearTimeout(compactClearT);
        var clearCompact = function() {
          el.card.style.left = "";
          el.card.style.right = "";
          el.card.style.top = "";
          el.card.style.bottom = "";
          el.card.style.height = "";
          el.card.style.width = "";
          el.card.style.maxHeight = "";
          el.card.style.overflowY = "";
        };
        if (cardOpen()) clearCompact();
        else compactClearT = setTimeout(function() {
          if (!cardOpen()) clearCompact();
        }, 260);
      }
    }
    if (el.card) {
      var compactOn = !chatCollapsed && cardOpen();
      var libBtn = $("pc-lib");
      if (!libBtn) {
        libBtn = document.createElement("button");
        libBtn.type = "button";
        libBtn.id = "pc-lib";
        libBtn.className = "pl-lib";
        libBtn.style.cssText = "align-self:flex-start;margin:8px 0 0 12px;font:inherit;cursor:pointer";
        libBtn.addEventListener("click", function() {
          setActiveLib(activeLib === "asmr" ? "music" : "asmr");
        });
        el.card.insertBefore(libBtn, el.card.firstChild);
      }
      libBtn.textContent = activeLib === "asmr" ? "ASMR ⇄" : "音乐 ⇄";
      libBtn.title = T("audio.switchLib", "切换歌单（ASMR / 音乐）");
      libBtn.style.display = compactOn ? "inline-flex" : "none";
      var fBtn = $("pc-folders");
      if (!fBtn) {
        fBtn = document.createElement("button");
        fBtn.type = "button";
        fBtn.id = "pc-folders";
        fBtn.className = "pl-btn pl-close";
        fBtn.style.cssText = "position:absolute;top:10px;right:10px;display:none";
        fBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.4 7.2h6.1l1.7 2h9.4v8.6H3.4z"></path><path d="M3.4 7.2V5.4h6.1l1.7 1.8"></path></svg>';
        fBtn.addEventListener("click", function() {
          toggleFolderMode();
        });
        el.card.appendChild(fBtn);
      }
      var canFolders = compactOn && dirGroups().length >= 2;
      fBtn.style.display = canFolders ? "inline-flex" : "none";
      fBtn.title = T("audio.filterBtn", "按作品筛选");
      fBtn.setAttribute("aria-label", T("audio.filterBtn", "按作品筛选"));
      fBtn.setAttribute("aria-pressed", folderMode ? "true" : "false");
      if (!canFolders && folderMode) {
        folderMode = false;
        requestAnimationFrame(function() {
          renderList();
        });
      }
      if (!document.getElementById("pc-compact-css")) {
        var st = document.createElement("style");
        st.id = "pc-compact-css";
        st.textContent = "#player-card.compact .pl-dir{display:none}#player-card.compact .pl-item{padding-left:10px}#player-card.compact .pc-head{display:none}";
        (document.head || document.documentElement).appendChild(st);
      }
      el.card.classList.toggle("compact", !!compactOn);
      var hideInCompact = function(sel, hide) {
        var n = $(sel);
        if (n) n.style.display = compactOn && hide ? "none" : "";
      };
      hideInCompact("player-filter", true);
      hideInCompact("player-pick", true);
      hideInCompact("player-title", true);
      hideInCompact("player-stat", true);
    }
    if (el.card) {
      el.card.style.boxShadow = flowView === "cover" ? "0 0 0 1px var(--stroke-dark), var(--glass-rise)" : "";
      var nEl = el.note;
      var noNote = !nEl || !nEl.textContent || nEl.classList.contains("hidden");
      el.card.classList.toggle("no-note", !!noNote);
      el.card.style.display = noNote && flowView === "cover" ? "none" : "";
    }
  }
  var thumbCache = {}, thumbPending = {};
  var thumbQueue = [], thumbQueued = {}, thumbTimer = null;
  function thumbEnqueueIdle(track) {
    if (!track || !track.coverUrl) return;
    var ckv = track.coverKey || track.id;
    if (thumbCache[ckv] || thumbQueued[ckv] || thumbPending[ckv]) return;
    thumbQueued[ckv] = true;
    thumbQueue.push(track);
    var wait = thumbQueue.length <= 8 ? 0 : 1200;
    if (!thumbTimer) thumbTimer = setTimeout(thumbPumpIdle, wait);
  }
  function thumbPumpIdle() {
    thumbTimer = null;
    var t2 = thumbQueue.shift();
    if (t2) {
      try {
        thumbOf(t2);
      } catch (e) {
      }
    }
    if (thumbQueue.length) thumbTimer = setTimeout(thumbPumpIdle, 120);
  }
  function thumbEnqueueAll() {
    for (var ti = 0; ti < tracks.length; ti++) thumbEnqueueIdle(tracks[ti]);
  }
  function coverDiskKey(ck) {
    return "cover:" + ck;
  }
  function thumbDiskPut(ck, blob) {
    try {
      if (global.ImgStore && global.ImgStore.put) global.ImgStore.put(coverDiskKey(ck), blob);
    } catch (e) {
    }
  }
  function thumbDiskGet(ck) {
    try {
      if (global.ImgStore && global.ImgStore.get) return global.ImgStore.get(coverDiskKey(ck));
    } catch (e) {
    }
    return Promise.resolve(null);
  }
  function thumbSwapIn(ck, track, url) {
    var nodes = document.querySelectorAll('img[data-cover-key="' + ck + '"], img[data-cover-id="' + track.id + '"]');
    for (var i = 0; i < nodes.length; i++) nodes[i].src = url;
  }
  function thumbDecode(track, ck) {
    if (global.createImageBitmap && global.fetch) {
      fetch(track.coverUrl).then(function(r) {
        return r.blob();
      }).then(function(b) {
        return createImageBitmap(b);
      }).then(function(bmp) {
        thumbStore(bmp, ck, track);
      }).catch(function() {
        thumbFallbackImage(track, ck);
      });
    } else {
      thumbFallbackImage(track, ck);
    }
  }
  function thumbStore(src, ck, track) {
    try {
      var w = src.naturalWidth || src.width || 0, h = src.naturalHeight || src.height || 0;
      if (!w || !h) {
        delete thumbPending[ck];
        return;
      }
      var side = 360, sc = Math.min(1, side / Math.max(w, h));
      var c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(w * sc));
      c.height = Math.max(1, Math.round(h * sc));
      c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
      if (src.close) {
        try {
          src.close();
        } catch (e2) {
        }
      }
      c.toBlob(function(b) {
        if (!b) {
          delete thumbPending[ck];
          return;
        }
        thumbCache[ck] = URL.createObjectURL(b);
        thumbDiskPut(ck, b);
        thumbSwapIn(ck, track, thumbCache[ck]);
      }, "image/jpeg", 0.82);
    } catch (e) {
      delete thumbPending[ck];
    }
  }
  function thumbFallbackImage(track, ck) {
    var im = new Image();
    im.decoding = "async";
    im.onload = function() {
      thumbStore(im, ck, track);
    };
    im.onerror = function() {
      delete thumbPending[ck];
    };
    im.src = track.coverUrl;
  }
  function thumbOf(track) {
    if (!track || !track.coverUrl) return null;
    var ck = track.coverKey || track.id;
    if (thumbCache[ck]) return thumbCache[ck];
    if (!thumbPending[ck]) {
      thumbPending[ck] = true;
      thumbDiskGet(ck).then(function(rec) {
        if (rec && rec.blob && rec.blob.size) {
          try {
            thumbCache[ck] = URL.createObjectURL(rec.blob);
            delete thumbPending[ck];
            thumbSwapIn(ck, track, thumbCache[ck]);
            return;
          } catch (e) {
          }
        }
        thumbDecode(track, ck);
      }).catch(function() {
        thumbDecode(track, ck);
      });
    }
    return thumbCache[ck] || null;
  }
  function morphNode(node, src) {
    if (!node) return;
    var b = src && src.getBoundingClientRect ? src.getBoundingClientRect() : null;
    if (!b || !b.width || !b.height) b = null;
    var savedT = node.style.transition;
    var saved = node.style.transform;
    node.style.transition = "none";
    node.style.transform = "none";
    var r = node.getBoundingClientRect();
    node.style.transform = saved;
    node.style.transition = savedT;
    if (!r.width || !r.height) {
      node.style.setProperty("--morph-dx", "0px");
      node.style.setProperty("--morph-dy", "0px");
      node.style.transformOrigin = "50% 50%";
      morphNeedsRematch = true;
      return;
    }
    if (!b) {
      node.style.setProperty("--morph-dx", "0px");
      node.style.setProperty("--morph-dy", "0px");
      node.style.transformOrigin = "50% 50%";
      return;
    }
    var bx = b.left + b.width / 2, by = b.top + b.height / 2;
    node.style.setProperty("--morph-dx", Math.round(bx - (r.left + r.width / 2)) + "px");
    node.style.setProperty("--morph-dy", Math.round(by - (r.top + r.height / 2)) + "px");
    node.style.transformOrigin = Math.round((bx - r.left) / r.width * 100) + "% " + Math.round((by - r.top) / r.height * 100) + "%";
  }
  function morphFrom(src) {
    if (!el.card) return;
    morphNeedsRematch = false;
    var b = src && src.getBoundingClientRect ? src.getBoundingClientRect() : null;
    if (!b || !b.width || !b.height) b = null;
    var bx = b ? b.left + b.width / 2 : 0;
    var by = b ? b.top + b.height / 2 : 0;
    morphNode(el.card, src);
    morphNode(el.flow, src);
    try {
      lastMorph = {
        src: b ? [Math.round(bx), Math.round(by)] : null,
        cardBox: (function() {
          var r = el.card.getBoundingClientRect();
          return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
        })(),
        dx: el.card.style.getPropertyValue("--morph-dx"),
        dy: el.card.style.getPropertyValue("--morph-dy"),
        origin: el.card.style.transformOrigin,
        cardClass: el.card.className,
        cardDisplay: getComputedStyle(el.card).display
      };
    } catch (e) {
    }
  }
  function revealCoverflow(flow, opts) {
    if (!flow) return false;
    opts = opts || {};
    flow.style.transition = "none";
    flow.classList.add("collapsed");
    if (typeof opts.beforeReflow === "function") {
      try {
        opts.beforeReflow();
      } catch (e) {
      }
    }
    void flow.offsetWidth;
    var done = false;
    var finish = function() {
      if (done) return;
      done = true;
      if (typeof opts.keep === "function" && !opts.keep()) return;
      flow.style.transition = "";
      flow.classList.remove("collapsed");
      if (typeof opts.after === "function") {
        try {
          opts.after();
        } catch (e) {
        }
      }
    };
    requestAnimationFrame(function() {
      requestAnimationFrame(finish);
    });
    if (opts.fallbackMs) setTimeout(finish, opts.fallbackMs);
    return true;
  }
  function setCardOpen(on, src, keepMem) {
    if (!el.card) return;
    morphFrom(src || el.btn);
    inCardOpen = true;
    if (on) {
      var chT = $("chat");
      var chatOpenT = chT && !chT.classList.contains("collapsed");
      if (chatOpenT) setFlowView("list");
      else if (flowView !== "cover" && !viewBeforeChat) setFlowView("cover");
    }
    if (on) {
      void (el.flow || el.card).offsetWidth;
      if (morphNeedsRematch) {
        morphNeedsRematch = false;
        try {
          morphFrom(src || el.btn);
        } catch (e) {
        }
      }
      [el.card, el.flow].forEach(function(n) {
        if (!n || !n.getAnimations) return;
        n.getAnimations().forEach(function(a) {
          if (a.transitionProperty === "transform") a.cancel();
        });
      });
    }
    if (on) {
      var chOpenNow = $("chat");
      if (chOpenNow && !chOpenNow.classList.contains("collapsed")) openedWhileExpanded = true;
    }
    el.card.classList.toggle("collapsed", !on);
    clearTimeout(cardMorphT);
    clearTimeout(cardClosingT);
    if (on) {
      folderMode = false;
      el.card.classList.remove("closing");
      el.card.classList.add("card-morphing");
      cardMorphT = setTimeout(
        function() {
          el.card.classList.remove("card-morphing");
        },
        Math.round(durMs("--dur-4", 220) * 0.6)
      );
    } else {
      folderMode = false;
      el.card.classList.remove("card-morphing");
      el.card.classList.add("closing");
      cardClosingT = setTimeout(function() {
        el.card.classList.remove("closing");
      }, 420);
    }
    if (!on) {
      var chClose = $("chat");
      if (chClose && !chClose.classList.contains("collapsed") && !keepMem) viewBeforeChat = null;
    }
    if (el.flow) el.flow.classList.toggle("collapsed", !on);
    if (on) {
      renderList();
      if (flowView === "cover") renderFlow();
    }
    paintBarVisibility();
    inCardOpen = false;
  }
  function dirGroups() {
    var seen = {}, out = [];
    for (var i = 0; i < tracks.length; i++) {
      var g = (tracks[i].dir || "").split("/")[0];
      if (!Object.prototype.hasOwnProperty.call(seen, g)) {
        seen[g] = 0;
        out.push(g);
      }
      seen[g]++;
    }
    out.sort();
    return out.map(function(g2) {
      return { key: g2, n: seen[g2] };
    });
  }
  function filterLabelText() {
    var cur = filterDir[activeLib] || "";
    if (!cur) return T("audio.filterAll", "全部") + "（" + tracks.length + "）";
    var n = 0;
    for (var i = 0; i < tracks.length; i++) if ((tracks[i].dir || "").split("/")[0] === cur) n++;
    return cur + "（" + n + "）";
  }
  function renderFilterList() {
    if (!el.filterList) return;
    var q = el.filterSearch ? String(el.filterSearch.value || "").trim().toLowerCase() : "";
    var cur = filterDir[activeLib] || "";
    var opts = [{ key: "", n: tracks.length }].concat(dirGroups());
    el.filterList.innerHTML = "";
    var shown = 0;
    for (var i = 0; i < opts.length; i++) {
      (function(g) {
        var label = g.key || T("audio.filterAll", "全部");
        if (q && label.toLowerCase().indexOf(q) < 0) return;
        shown++;
        var b = document.createElement("button");
        b.type = "button";
        b.className = "pc-fopt" + (g.key === cur ? " on" : "");
        b.textContent = label + "（" + g.n + "）";
        b.title = label;
        b.addEventListener("click", function() {
          filterDir[activeLib] = g.key;
          filterOpen[activeLib] = false;
          renderList();
        });
        el.filterList.appendChild(b);
      })(opts[i]);
    }
    if (!shown) {
      var d = document.createElement("div");
      d.className = "pc-fnone";
      d.textContent = T("audio.filterNone", "没有匹配的作品");
      el.filterList.appendChild(d);
    }
  }
  function setFilterOpen(on) {
    filterOpen[activeLib] = !!on;
    if (!on && el.filterSearch) el.filterSearch.value = "";
    renderFilter();
  }
  function toggleFolderMode() {
    var box = el.list;
    if (!folderMode && box) folderScrollT = box.scrollTop || 0;
    folderMode = !folderMode;
    renderList();
    if (!folderMode && box) box.scrollTop = folderScrollT;
  }
  function renderFilter() {
    if (!el.filter) return;
    var groups = dirGroups();
    if (groups.length < 2) {
      el.filter.classList.add("hidden");
      filterDir[activeLib] = "";
      filterOpen[activeLib] = false;
      return;
    }
    var open = !!filterOpen[activeLib];
    el.filter.classList.remove("hidden");
    el.filter.classList.toggle("open", open);
    if (el.filterLabel) el.filterLabel.textContent = T("audio.filterTitle", "作品：") + filterLabelText();
    if (el.filterSearch) el.filterSearch.setAttribute("placeholder", T("audio.filterSearch", "搜索作品…"));
    if (el.filterPanel) el.filterPanel.classList.toggle("hidden", !open);
    if (el.filterToggle) el.filterToggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) renderFilterList();
  }
  function shownTracks() {
    var cur = filterDir[activeLib] || "";
    var match = function(t) {
      return (t.dir || "").split("/")[0] === cur;
    };
    if (cur && !tracks.some(match)) cur = filterDir[activeLib] = "";
    var shown = cur ? tracks.filter(match) : tracks;
    return shown;
  }
  function renderList() {
    var box = el.list;
    if (!box) return;
    var lib = activeLib;
    box.innerHTML = "";
    var cur = filterDir[lib] || "";
    renderFilter();
    if (folderMode) {
      var fopts = [{ key: "", n: tracks.length }].concat(dirGroups());
      for (var fi = 0; fi < fopts.length; fi++) {
        (function(g) {
          var fb = document.createElement("button");
          fb.type = "button";
          fb.className = "pc-fopt" + (g.key === cur ? " on" : "");
          fb.textContent = (g.key || T("audio.filterAll", "全部")) + "（" + g.n + "）";
          fb.title = g.key || T("audio.filterAll", "全部");
          fb.addEventListener("click", function() {
            filterDir[lib] = g.key;
            folderMode = false;
            renderList();
          });
          box.appendChild(fb);
        })(fopts[fi]);
      }
      renderFlow();
      return;
    }
    var shown = shownTracks();
    if (!shown.length) {
      var d = document.createElement("div");
      d.className = "pl-empty";
      d.textContent = granting[lib] ? T("audio.loading", "正在读取文件夹…") : hintKind(lib) === "lost" ? T("audio.folderLost", "上次的文件夹已读不到（可能被移动 / 删除 / 盘未接）—— 请重新选择") : hintKind(lib) === "prompt" ? T("audio.folderGone", "上次的文件夹要重新授权 —— 点一下界面任意处即可继续") : T("audio.pickHint", "支持 mp3 / m4a / flac / wav / ogg；歌词读同名的 .lrc / .vtt");
      box.appendChild(d);
      renderFlow();
      return;
    }
    for (var i = 0; i < shown.length; i++) {
      (function(i2) {
        var t = shown[i2];
        var b = document.createElement("button");
        b.type = "button";
        b.className = "pl-item" + (nowTrack && t.id === nowTrack.id ? " on" : "") + (t.bad ? " bad" : "");
        b.title = (t.dir ? t.dir + "/" : "") + t.name;
        if (t.dir) {
          var d2 = document.createElement("span");
          d2.className = "pl-dir";
          d2.textContent = t.dir.split("/").pop();
          b.appendChild(d2);
        }
        var n = document.createElement("span");
        n.className = "pl-name";
        n.textContent = t.name.replace(/\.[^.]+$/, "");
        b.appendChild(n);
        if (t.lyricName) {
          var g = document.createElement("span");
          g.className = "pl-lyric";
          g.textContent = "词";
          b.appendChild(g);
        }
        b.addEventListener("click", function() {
          playTrack(t, lib);
        });
        box.appendChild(b);
      })(i);
    }
    renderFlow();
  }
  function flowReduce() {
    if (!flowReduced) {
      try {
        flowReduced = global.matchMedia("(prefers-reduced-motion: reduce)");
      } catch (e) {
        flowReduced = null;
      }
    }
    return !!(flowReduced && flowReduced.matches);
  }
  function flowSpacing() {
    var st = el.flowStage;
    var w = st && st.clientWidth || 400;
    var s = Math.round(CFG.spacing * w / 400);
    return Math.max(36, Math.min(60, s));
  }
  function flowCard(track, idx) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "cf-card";
    b.style.marginTop = "-11px";
    b.setAttribute("role", "option");
    b.setAttribute("aria-label", track.name.replace(/\.[^.]+$/, "") + (track.dir ? "（" + track.dir + "）" : ""));
    b.title = (track.dir ? track.dir + "/" : "") + track.name;
    if (track.coverUrl) {
      var img = document.createElement("img");
      img.alt = "";
      img.src = thumbOf(track) || "";
      img.setAttribute("data-cover-key", track.coverKey || track.id);
      thumbEnqueueIdle(track);
      img.setAttribute("data-cover-id", track.id);
      img.addEventListener("error", function() {
        b.classList.add("nocover");
        img.removeAttribute("src");
      });
      img.addEventListener("load", function() {
        b.classList.remove("nocover");
      });
      b.appendChild(img);
    }
    var sr = document.createElement("span");
    sr.className = "cf-sr";
    sr.textContent = track.name.replace(/\.[^.]+$/, "");
    b.appendChild(sr);
    b.addEventListener("click", function() {
      if (flowDown && flowDown.moved > 6) return;
      flowPlay(idx);
    });
    b.addEventListener("keydown", function(ev) {
      if (ev.key !== "Enter" && ev.key !== " " && ev.key !== "Spacebar") return;
      ev.preventDefault();
      flowPlay(idx);
    });
    return b;
  }
  function rebuildFlow(full) {
    thumbEnqueueAll();
    var track = el.flowTrack;
    if (!track) return;
    var incremental = full === false;
    var list = shownTracks();
    var n = list.length;
    if (!incremental) {
      flowItems = [];
      track.innerHTML = "";
    }
    if (!n) {
      flowItems = [];
      track.innerHTML = "";
      if (flowView === "cover") emptyHintOn();
      else emptyHintOff();
      applyFlow();
      return;
    }
    emptyHintOff();
    flowPos = Math.max(0, Math.min(n - 1, flowPos));
    var lo = Math.max(0, Math.floor(flowPos - CFG.win));
    var hi = Math.min(n - 1, Math.ceil(flowPos + CFG.win));
    var prevByIndex = {};
    for (var k = 0; k < flowItems.length; k++) prevByIndex[flowItems[k].i] = flowItems[k];
    for (var k2 = 0; k2 < flowItems.length; k2++) {
      var it2 = flowItems[k2];
      if (it2.i < lo || it2.i > hi) {
        if (it2.node.parentNode) it2.node.parentNode.removeChild(it2.node);
      }
    }
    for (var i = lo; i <= hi; i++) {
      var prev = prevByIndex[i];
      var same = !!(prev && prev.track && prev.track.id === list[i].id);
      var nd;
      if (same) {
        nd = prev.node;
      } else {
        if (prev && prev.node.parentNode) prev.node.parentNode.removeChild(prev.node);
        nd = flowCard(list[i], i);
      }
      track.appendChild(nd);
      flowItems.push({ i, node: nd, track: list[i] });
    }
    applyFlow();
  }
  function renderFlow() {
    if (flowView !== "cover" || !el.flowTrack) return;
    var list = shownTracks();
    if (!list.length) {
      flowPos = 0;
      flowTarget = null;
      rebuildFlow();
      return;
    }
    var i = -1;
    if (nowTrack) {
      for (var k = 0; k < list.length; k++) if (list[k].id === nowTrack.id) {
        i = k;
        break;
      }
    }
    if (i < 0) i = Math.max(0, Math.min(list.length - 1, Math.round(flowPos)));
    if (flowTarget === null) flowPos = i;
    rebuildFlow();
  }
  function applyFlow() {
    var sp = flowSpacing();
    for (var k = 0; k < flowItems.length; k++) {
      var item = flowItems[k];
      var d = item.i - flowPos;
      var ad = Math.abs(d);
      var dz = ad > CFG.maxD ? d < 0 ? -CFG.maxD : CFG.maxD : d;
      var rot = -(CFG.maxRot * Math.tanh(CFG.rotK * dz));
      var sc = 1 / (1 + CFG.scaleK * ad);
      var nd = item.node;
      var tf = "translateX(" + (d * sp).toFixed(2) + "px) translateY(-50%) rotateY(" + rot.toFixed(2) + "deg) translateZ(" + (-(CFG.depth * ad)).toFixed(1) + "px) scale(" + sc.toFixed(4) + ")";
      var vis = ad > CFG.win ? "hidden" : "visible";
      if (vis === "hidden") tf = "translateX(0) translateY(-50%) translateZ(-" + CFG.depth * CFG.maxD + "px)";
      var zNow = String(Math.round(CFG.zBase - ad));
      var cc = item._c || (item._c = {});
      if (cc.tf !== tf) {
        nd.style.transform = tf;
        cc.tf = tf;
      }
      if (cc.z !== zNow) {
        nd.style.zIndex = zNow;
        cc.z = zNow;
      }
      if (cc.vis !== vis) {
        nd.style.visibility = vis;
        cc.vis = vis;
      }
      var isC = ad < 0.5;
      if (cc.center !== isC) {
        nd.classList.toggle("is-center", isC);
        cc.center = isC;
      }
      var ariaSel = isC ? "true" : "false";
      if (cc.aria !== ariaSel) {
        nd.setAttribute("aria-selected", ariaSel);
        cc.aria = ariaSel;
      }
      var nocov = !item.track.coverUrl;
      if (nd.classList.contains("nocover") !== nocov) {
        nd.classList.toggle("nocover", nocov);
      }
    }
    flowCount();
    paintFlowPlay();
  }
  function flowCount() {
    if (el.flowStage && flowItems.length) {
      var ci = null;
      for (var k = 0; k < flowItems.length; k++) {
        if (Math.abs(flowItems[k].i - flowPos) < 0.5) {
          ci = flowItems[k];
          break;
        }
      }
      if (ci) {
        if (!ci.node.id) ci.node.id = "cf-card-" + ci.i;
        if (_activeDesc !== ci.node.id) {
          el.flowStage.setAttribute("aria-activedescendant", ci.node.id);
          _activeDesc = ci.node.id;
        }
      }
    }
  }
  function flowTick() {
    flowRaf = 0;
    if (flowDown) return;
    if (flowReduce()) {
      flowPos = Math.round(flowPos);
      flowV = 0;
      applyFlow();
      return;
    }
    if (flowV) {
      flowPos += flowV;
      flowV *= 0.9;
      if (Math.abs(flowV) < 4e-4) flowV = 0;
    }
    var target = flowTarget === null ? Math.round(flowPos) : flowTarget;
    var diff = target - flowPos;
    var n = shownTracks().length;
    if (Math.abs(diff) < 8e-4 && !flowV) {
      flowPos = Math.max(0, Math.min(n - 1, target));
      flowTarget = null;
      applyFlow();
      scheduleFlowSync();
      return;
    }
    flowPos += diff * 0.2;
    var lo = 0, hi = n - 1;
    if (flowPos < lo - 0.35) flowPos = lo - 0.35 + (flowPos - lo + 0.35) * 0.25;
    if (flowPos > hi + 0.35) flowPos = hi + 0.35 + (flowPos - hi - 0.35) * 0.25;
    applyFlow();
    if (flowView === "cover" && el.flowTrack && n) {
      var loWant = Math.max(0, Math.floor(flowPos - CFG.win));
      var hiWant = Math.min(n - 1, Math.ceil(flowPos + CFG.win));
      if (!flowItems.length || flowItems[0].i !== loWant || flowItems[flowItems.length - 1].i !== hiWant) {
        rebuildFlow(false);
      }
    }
    flowRaf = requestAnimationFrame(flowTick);
  }
  function startFlow() {
    if (!flowRaf) flowRaf = requestAnimationFrame(flowTick);
  }
  function scheduleFlowSync() {
    if (flowSyncRaf) return;
    flowSyncRaf = requestAnimationFrame(function() {
      flowSyncRaf = 0;
      var n = shownTracks().length;
      if (!n) return;
      var p = Math.max(0, Math.min(n - 1, Math.round(flowPos)));
      if (p !== flowPos) {
        flowPos = p;
      }
      if (flowView === "cover" && el.flowTrack) rebuildFlow(false);
    });
  }
  function flowPlay(idx, animate) {
    var list = shownTracks();
    if (idx < 0 || idx >= list.length) return;
    if (animate) {
      flowTarget = idx;
      flowV = 0;
      startFlow();
    } else {
      flowTarget = null;
      flowPos = idx;
      applyFlow();
    }
    var lib = activeLib;
    var wasCover = flowView === "cover";
    playTrack(list[idx], lib);
    var chKeep = $("chat");
    if (wasCover && (!chKeep || chKeep.classList.contains("collapsed"))) setCardOpen(true);
  }
  function flowMove(d) {
    var list = shownTracks();
    if (!list.length) return;
    var n = list.length;
    var i = Math.max(0, Math.min(n - 1, Math.round(flowPos)));
    flowPlay(((i + d) % n + n) % n, true);
  }
  function flowStepBy(d) {
    var list = shownTracks();
    if (!list.length) return;
    var n = list.length;
    if (flowReduce()) {
      flowV = 0;
      flowTarget = null;
      flowPos = Math.max(0, Math.min(n - 1, Math.round(flowPos) + d));
      applyFlow();
      return;
    }
    flowV = 0;
    flowTarget = Math.max(0, Math.min(n - 1, Math.round(flowPos) + d));
    startFlow();
  }
  function paintFlowPlay() {
    for (var k = 0; k < flowItems.length; k++) {
      var item = flowItems[k];
      var on = !!(nowTrack && item.track.id === nowTrack.id);
      var ci2 = item._c || (item._c = {});
      if (ci2.on !== on) {
        item.node.classList.toggle("on", on);
        ci2.on = on;
      }
    }
  }
  function onFlowWheel(ev) {
    if (!ev.deltaY && !ev.deltaX) return;
    if (Math.abs(ev.deltaY) <= Math.abs(ev.deltaX)) return;
    ev.preventDefault();
    flowV = 0;
    var discrete = ev.deltaMode === 1 || Math.abs(ev.deltaY) >= 60;
    var step1 = discrete ? Math.sign(ev.deltaY) * Math.max(1, Math.round(Math.abs(ev.deltaY) / 120)) : ev.deltaY / 120 * 0.35;
    var n = shownTracks().length;
    if (!n) return;
    if (discrete) {
      var base = flowTarget === null ? Math.round(flowPos) : flowTarget;
      flowTarget = Math.max(0, Math.min(n - 1, base + step1));
      startFlow();
    } else {
      flowTarget = null;
      flowPos = Math.max(0, Math.min(n - 1, flowPos + step1));
      applyFlow();
      startFlow();
    }
  }
  function onFlowKey(ev) {
    if (flowView !== "cover") return;
    var t = ev.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    var n = shownTracks().length;
    if (!n) return;
    if (ev.key === "ArrowRight") {
      ev.preventDefault();
      flowStepBy(1);
    } else if (ev.key === "ArrowLeft") {
      ev.preventDefault();
      flowStepBy(-1);
    } else if (ev.key === "Home") {
      ev.preventDefault();
      flowV = 0;
      flowTarget = null;
      flowPos = 0;
      startFlow();
    } else if (ev.key === "End") {
      ev.preventDefault();
      flowV = 0;
      flowTarget = null;
      flowPos = n - 1;
      startFlow();
    }
  }
  function onFlowDown(ev) {
    if (ev.button !== 0) return;
    flowV = 0;
    flowTarget = null;
    flowDown = { id: ev.pointerId, x0: ev.clientX, pos0: flowPos, moved: 0, lastT: performance.now() };
    if (el.flowStage) {
      el.flowStage.classList.add("is-dragging");
      try {
        el.flowStage.setPointerCapture(ev.pointerId);
      } catch (e) {
      }
    }
  }
  function onFlowMove(ev) {
    if (!flowDown || ev.pointerId !== flowDown.id) return;
    var dx = ev.clientX - flowDown.x0;
    if (Math.abs(dx) > flowDown.moved) flowDown.moved = Math.abs(dx);
    var n = shownTracks().length;
    if (!n) return;
    flowPos = flowDown.pos0 - dx * (CFG.dragTrack / flowSpacing());
    if (flowPos < -0.35) flowPos = -0.35 + (flowPos + 0.35) * 0.25;
    if (flowPos > n - 1 + 0.35) flowPos = n - 1 + 0.35 + (flowPos - n + 1 - 0.35) * 0.25;
    applyFlow();
  }
  function onFlowUp(ev) {
    if (!flowDown || ev && ev.pointerId !== flowDown.id) return;
    var moved = flowDown.moved;
    flowDown = null;
    if (el.flowStage) {
      el.flowStage.classList.remove("is-dragging");
      try {
        if (ev && el.flowStage.hasPointerCapture && el.flowStage.hasPointerCapture(ev.pointerId)) el.flowStage.releasePointerCapture(ev.pointerId);
      } catch (e) {
      }
    }
    if (moved > 6) {
      flowV = 0;
      startFlow();
    } else {
      applyFlow();
    }
  }
  function setFlowView(v) {
    var on = v === "cover";
    var chatEl0 = $("chat");
    if (chatEl0 && !chatEl0.classList.contains("collapsed")) on = false;
    flowView = on ? "cover" : "list";
    if (on && !cardOpen() && !inCardOpen) {
      var ch = $("chat");
      if (!ch || ch.classList.contains("collapsed")) setCardOpen(true, $("pl-view"));
    }
    if (el.card) el.card.classList.toggle("flow-view", on);
    if (el.flow) {
      el.flow.classList.toggle("hidden", !on);
      el.flow.classList.toggle("hide3d", !on);
    }
    var vk = $("pl-view");
    if (vk) {
      vk.setAttribute("aria-pressed", on ? "true" : "false");
      vk.title = on ? T("audio.viewList", "切到列表视图") : T("audio.viewCover", "切到封面视图");
    }
    if (on) {
      renderFlow();
      try {
        if (el.flowStage) el.flowStage.focus({ preventScroll: true });
      } catch (e) {
      }
    } else {
      emptyHintOff();
    }
    paintBarVisibility();
  }
  var viewMorphT = 0, viewMorphT2 = 0, viewMorphBusy = false, viewMorphTarget = null;
  function morphHide(node, hide) {
    if (node) node.classList.toggle("view-morph-hide", !!hide);
  }
  function morphHideFlowContent(hide) {
    var tr = $("player-flow-track");
    if (!tr) return;
    if (hide) {
      tr.style.transition = "none";
      tr.style.opacity = "0";
      return;
    }
    tr.style.transition = "none";
    tr.style.opacity = "";
    requestAnimationFrame(function() {
      tr.style.transition = "";
    });
  }
  function resetChildren(node) {
    if (!node || !node.children) return;
    Array.prototype.forEach.call(node.children, function(ch) {
      ch.style.visibility = "";
      ch.style.opacity = "";
      ch.style.transition = "";
    });
  }
  function finishViewMorph() {
    if (!viewMorphBusy) return;
    clearTimeout(viewMorphT);
    clearTimeout(viewMorphT2);
    viewMorphBusy = false;
    var card = el.card, flow = el.flow, t = viewMorphTarget;
    viewMorphTarget = null;
    if (!card || !flow) return;
    card.classList.remove("view-morph");
    flow.classList.remove("view-morph");
    card.style.height = "";
    flow.style.height = "";
    morphHide(card, false);
    morphHide(flow, false);
    if (t === "cover") {
      flow.style.visibility = "";
      setFlowView("cover");
    } else {
      setFlowView("list");
    }
    morphHideFlowContent(false);
    resetChildren(card);
    resetChildren(flow);
  }
  function morphViewSwitch(toCover) {
    var card = el.card, flow = el.flow, chatEl = $("chat");
    var chatCollapsed = !chatEl || chatEl.classList.contains("collapsed");
    if (!card || !flow || !cardOpen() || inCardOpen || !chatCollapsed) return false;
    if (viewMorphBusy) finishViewMorph();
    var dur = durMs("--dur-6", 300);
    clearTimeout(viewMorphT);
    var fromH = 0, toH = 0;
    if (toCover) {
      viewMorphTarget = "cover";
      viewMorphBusy = true;
      flowView = "cover";
      card.style.height = "";
      flow.classList.remove("hidden");
      flow.classList.remove("hide3d");
      revealCoverflow(flow, {
        beforeReflow: function() {
          try {
            morphFrom($("pl-view"));
          } catch (e) {
          }
        },
        after: function() {
          viewMorphT = setTimeout(finishViewMorph, durMs("--dur-4", 220) + 60);
        }
      });
      paintBarVisibility();
      return true;
    }
    fromH = Math.round(flow.getBoundingClientRect().height) || 0;
    flowView = "list";
    card.style.display = "";
    card.classList.remove("flow-view");
    morphHide(card, true);
    card.classList.add("view-morph");
    card.style.height = "";
    toH = Math.round(card.getBoundingClientRect().height) || 0;
    if (!fromH || !toH) {
      card.classList.remove("view-morph");
      morphHide(card, false);
      return false;
    }
    card.style.height = fromH + "px";
    flow.classList.add("hidden");
    flow.classList.add("hide3d");
    viewMorphTarget = "list";
    viewMorphBusy = true;
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        card.style.height = toH + "px";
        viewMorphT2 = setTimeout(function() {
          morphHide(card, false);
        }, Math.round(dur * 0.6));
        viewMorphT = setTimeout(finishViewMorph, dur + 40);
      });
    });
    return true;
  }
  function ensureRoute() {
    if (!audio) {
      audio = new Audio();
      audio.preload = "metadata";
      audio.volume = 1;
      audio.addEventListener("ended", function() {
        onEnded();
      });
      audio.addEventListener("loadedmetadata", function() {
        if (pendingSeek >= 0 && isFinite(audio.duration) && audio.duration) {
          try {
            audio.currentTime = pendingSeek * audio.duration;
          } catch (e) {
          }
          pendingSeek = -1;
        }
        paintProgress();
      });
      audio.addEventListener("error", function() {
        if (nowTrack) note(T("audio.playFail", "这首放不出来（格式可能不支持）"), true);
        playing = false;
        paintPlayBtn();
        stopLoop();
        applyPose();
      });
    }
    if (route !== "idle") return;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) {
      route = "plain";
      return;
    }
    route = "pending";
    try {
      actx = new AC();
    } catch (e) {
      actx = null;
      route = "plain";
      return;
    }
    var ready;
    if (actx.state === "running") ready = Promise.resolve(true);
    else if (actx.resume) ready = actx.resume().then(
      function() {
        return actx.state === "running";
      },
      function() {
        return false;
      }
    );
    else ready = Promise.resolve(false);
    ready.then(function(ok) {
      if (!ok) {
        try {
          if (actx && actx.close) actx.close();
        } catch (e) {
        }
        actx = null;
        route = "plain";
        return;
      }
      try {
        srcNode = actx.createMediaElementSource(audio);
        analyser = actx.createAnalyser();
        analyser.fftSize = 1024;
        wave = new Uint8Array(analyser.fftSize);
        gain = actx.createGain();
        gain.gain.value = userVol;
        srcNode.connect(analyser);
        analyser.connect(gain);
        gain.connect(actx.destination);
        route = "live";
      } catch (e) {
        try {
          if (srcNode) srcNode.disconnect();
        } catch (e2) {
        }
        analyser = null;
        gain = null;
        wave = null;
        route = "plain";
      }
      applyGain();
    });
  }
  function applyGain() {
    if (gain) gain.gain.value = userVol * (ducking ? 0.28 : 1);
    else if (audio) audio.volume = userVol * (ducking ? 0.28 : 1);
  }
  function sampleLevel() {
    if (envData) {
      liveLevel = !audio || audio.paused || !global.TsumuMouthEnv ? 0 : global.TsumuMouthEnv.levelAt(envData, audio.currentTime || 0);
      return;
    }
    if (!analyser || !wave) {
      liveLevel = 0;
      return;
    }
    analyser.getByteTimeDomainData(wave);
    var sum = 0;
    for (var i = 0; i < wave.length; i++) {
      var v = (wave[i] - 128) / 128;
      sum += v * v;
    }
    var rms = Math.sqrt(sum / wave.length);
    liveLevel = Math.min(1, Math.pow(Math.min(1, rms / 0.22), 0.7));
  }
  function paintPlayBtn() {
    if (el.toggleBtn) el.toggleBtn.classList.toggle("playing", !!playing);
    paintFlowPlay();
    try {
      document.documentElement.classList.toggle("music-playing", !!playing);
    } catch (e) {
    }
    if (!el.cover) return;
    el.cover.classList.toggle("playing", playing);
    el.cover.setAttribute("aria-label", T(playing ? "audio.pause" : "audio.play", playing ? "暂停" : "播放"));
  }
  function paintProgress() {
    var cur = audio ? audio.currentTime || 0 : 0;
    var dur = audio && isFinite(audio.duration) ? audio.duration : 0;
    if (el.time) el.time.textContent = fmt(cur) + " / " + fmt(dur);
    if (el.fill) el.fill.style.width = (dur ? Math.min(100, cur / dur * 100) : 0) + "%";
  }
  function paintLyric() {
    if (!el.lyricText) return;
    var name = nowTrack ? nowTrack.name.replace(/\.[^.]+$/, "") : "";
    if (!lines || !lines.length) {
      if (lineIdx !== -1) {
        lineIdx = -1;
        el.lyricText.textContent = name;
        el.lyricText.classList.add("nolyric");
      }
      return;
    }
    var t = audio ? audio.currentTime || 0 : 0, k = -1;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].t <= t + 0.05) k = i;
      else break;
    }
    if (k !== lineIdx) {
      lineIdx = k;
      el.lyricText.classList.toggle("nolyric", k < 0);
      el.lyricText.textContent = k >= 0 ? lines[k].text : name;
    }
  }
  function loop() {
    rafId = 0;
    if (!playing) return;
    sampleLevel();
    paintProgress();
    paintLyric();
    rafId = requestAnimationFrame(loop);
  }
  function startLoop() {
    if (!rafId) rafId = requestAnimationFrame(loop);
  }
  function stopLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    liveLevel = 0;
  }
  function loadLyrics(track) {
    lines = null;
    lineIdx = -2;
    if (!track) return;
    global.AudioLib.lyricLines(track.id).then(function(ls) {
      if (nowTrack && nowTrack.id === track.id) {
        lines = ls;
        paintLyric();
      }
    }).catch(function() {
    });
  }
  function loadMouthEnv(track) {
    envData = null;
    if (!track || !global.AudioLib || !global.AudioLib.readEnv) return;
    global.AudioLib.readEnv(track.id).then(function(env) {
      if (nowTrack && nowTrack.id === track.id) envData = env || null;
    }).catch(function() {
    });
  }
  function playTrack(t, lib) {
    if (!t) return;
    if (t.bad) {
      note(T("audio.playFail", "这首放不出来（格式可能不支持）"), true);
      return;
    }
    nowTrack = t;
    nowLib = lib || activeLib;
    ensureRoute();
    if (actx && actx.state === "suspended") {
      try {
        actx.resume();
      } catch (e) {
      }
    }
    if (audio.src !== t.url) {
      audio.src = t.url;
      loadLyrics(t);
      loadMouthEnv(t);
    }
    applyGain();
    var p = audio.play();
    if (p && p.catch) p.catch(function() {
      note(T("audio.playFail", "这首放不出来（格式可能不支持）"), true);
    });
    playing = true;
    paintPlayBtn();
    paintCover();
    startLoop();
    if (flowView !== "cover") setCardOpen(false, null, true);
    if (el.btn) el.btn.classList.remove("on");
    renderList();
    applyPose();
    if (!t.coverUrl && global.AudioLib && !AudioLib.hasImage(nowLib)) {
      showWarn(T("audio.noCover", "没找到封面图：把上一层的作品文件夹也选进来（会递归找），或在该文件夹里放一张 cover.jpg"));
    }
  }
  function toggle() {
    if (!nowTrack) {
      var first = tracks.filter(function(x) {
        return !x.bad;
      })[0];
      if (first) playTrack(first, activeLib);
      return;
    }
    if (playing) {
      try {
        audio.pause();
      } catch (e) {
      }
      playing = false;
      paintPlayBtn();
      stopLoop();
      applyPose();
    } else {
      ensureRoute();
      applyGain();
      var p = audio.play();
      if (p && p.catch) p.catch(function() {
      });
      playing = true;
      paintPlayBtn();
      startLoop();
      applyPose();
    }
  }
  function playListOf() {
    if (nowLib && global.AudioLib) return global.AudioLib.list(nowLib);
    return tracks;
  }
  function onEnded() {
    playing = false;
    stopLoop();
    paintPlayBtn();
    applyPose();
    var list = playListOf();
    var i = nowTrack ? list.findIndex(function(x) {
      return x.id === nowTrack.id;
    }) : -1;
    if (i >= 0 && i + 1 < list.length) playTrack(list[i + 1], nowLib || activeLib);
    else if (el.btn) el.btn.classList.remove("on");
  }
  function step(d) {
    var list = playListOf();
    if (!list.length) return;
    var i = nowTrack ? list.findIndex(function(x) {
      return x.id === nowTrack.id;
    }) : -1;
    var n = i + d;
    if (n < 0) n = list.length - 1;
    if (n >= list.length) n = 0;
    playTrack(list[n], nowLib || activeLib);
  }
  function closePlayer() {
    try {
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
      }
    } catch (e) {
    }
    playing = false;
    nowTrack = null;
    stopLoop();
    applyPose();
    paintPlayBtn();
    paintCover();
    paintProgress();
    setCardOpen(false);
    if (el.btn) el.btn.classList.remove("on");
  }
  function paintCover() {
    if (!el.cover) return;
    var t = nowTrack;
    var url = t ? thumbOf(t) : null;
    if (el.coverImg) {
      if (t) el.coverImg.setAttribute("data-cover-key", t.coverKey || t.id);
      if (url && el.coverImg.getAttribute("src") !== url) el.coverImg.src = url;
      el.coverImg.classList.toggle("hidden", !t || !url && !el.coverImg.getAttribute("src"));
    }
    el.cover.classList.toggle("hidden", !t);
    el.cover.classList.toggle("nocover", !t || !t.coverUrl);
    paintBarVisibility();
    if (el.lightboxImg) el.lightboxImg.src = url || "";
    if (!url) setLightbox(false);
  }
  function openCover() {
    var t = nowTrack;
    var url = t ? thumbOf(t) || t.coverUrl : null;
    if (!url) {
      showWarn(T("audio.noCover", "没找到封面图：把上一层的作品文件夹也选进来（会递归找），或在该文件夹里放一张 cover.jpg"));
      return;
    }
    setLightbox(true);
  }
  function setLightbox(on) {
    if (!el.lightbox) return;
    el.lightbox.classList.toggle("off", !on);
    try {
      document.documentElement.classList.toggle("lightbox-on", !!on);
    } catch (e) {
    }
  }
  var gCache = { chatTop: -1, fnBottom: -1, dock: null, barLeft: -1, barTop: -1, barH: -1, barBottom: -1 };
  function syncGeom(force) {
    var h = global.innerHeight;
    var changed = false;
    var c = $("chat"), f = $("fn"), ly = $("player-lyric");
    var cR = c ? c.getBoundingClientRect() : null;
    var fR = f ? f.getBoundingClientRect() : null;
    var lR = ly && !ly.classList.contains("hidden") ? ly.getBoundingClientRect() : null;
    function setVar(name, val, key) {
      if (force || gCache[key] !== val) {
        document.documentElement.style.setProperty(name, val + "px");
        if (gCache[key] !== val) {
          gCache[key] = val;
          changed = true;
        }
      }
    }
    if (cR) setVar("--chat-top", Math.max(0, Math.round(h - cR.top)), "chatTop");
    if (fR) {
      var fb = Math.max(0, Math.round(h - fR.bottom));
      setVar("--fn-bottom", fb, "fnBottom");
      var raised = fb > 20;
      if (force || gCache.dock !== raised) {
        document.documentElement.classList.toggle("dock-raised", raised);
        gCache.dock = raised;
        changed = true;
      }
    }
    if (lR) {
      var barH = Math.round(lR.height);
      var chatCollapsedNow = !!(c && c.classList.contains("collapsed"));
      setVar("--bar-left", Math.max(0, Math.round(lR.left)), "barLeft");
      setVar("--bar-h", barH, "barH");
      if (fR && !chatCollapsedNow) {
        setVar("--bar-top", Math.max(0, fb + barH), "barTop");
        setVar("--bar-bottom", fb, "barBottom");
      } else {
        setVar("--bar-top", Math.max(0, Math.round(h - lR.top)), "barTop");
        setVar("--bar-bottom", Math.max(0, Math.round(h - lR.bottom)), "barBottom");
      }
    }
    try {
      paintBarVisibility();
    } catch (e) {
    }
  }
  var followUntil = 0, followRaf = 0;
  function durMs(name, fallback) {
    try {
      var v = global.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      if (!v) return fallback;
      if (v.slice(-2) === "ms") return parseFloat(v);
      if (v.slice(-1) === "s") return parseFloat(v) * 1e3;
    } catch (e) {
    }
    return fallback;
  }
  function coverEnter() {
    var cv = el.cover;
    if (!cv) return;
    var d = durMs("--dur-3", 300);
    cv.style.transition = "opacity " + d + "ms var(--ease-move)";
    cv.style.setProperty("opacity", "0", "important");
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        cv.style.setProperty("opacity", "1", "important");
      });
    });
  }
  var chatTrans = 0;
  function followStart() {
    if (followRaf) return;
    followUntil = Infinity;
    followRaf = requestAnimationFrame(followStep);
  }
  function followEndSoon() {
    followUntil = performance.now();
  }
  function followGeom(ms) {
    var now = performance.now();
    if (now < followUntil) {
      if (!followRaf) followRaf = requestAnimationFrame(followStep);
      return;
    }
    followUntil = now + (ms || durMs("--dur-3", 300));
    if (!followRaf) followRaf = requestAnimationFrame(followStep);
  }
  var lastChatRect = null, settleFrames = 0;
  function followStep() {
    followRaf = 0;
    syncGeom();
    var ch = $("chat");
    var r = ch ? ch.getBoundingClientRect() : null;
    var sig = r ? Math.round(r.left) + "," + Math.round(r.top) + "," + Math.round(r.width) + "," + Math.round(r.height) : "";
    if (sig !== lastChatRect) {
      lastChatRect = sig;
      settleFrames = 0;
    } else {
      settleFrames++;
    }
    var stable = settleFrames >= 3;
    if (performance.now() < followUntil || !stable) {
      if (!stable) followUntil = performance.now() + 100;
      followRaf = requestAnimationFrame(followStep);
    }
  }
  function wireDuck() {
    var tts = global.TsumuAudio;
    if (!tts || !tts.addEventListener) return;
    tts.addEventListener("play", function() {
      ducking = true;
      applyGain();
    });
    function unduck() {
      ducking = false;
      applyGain();
    }
    tts.addEventListener("ended", unduck);
    tts.addEventListener("pause", unduck);
  }
  function init() {
    el.btn = $("btn-audio");
    el.card = $("player-card");
    el.list = $("player-list");
    el.filter = $("player-filter");
    el.filterToggle = $("player-filter-toggle");
    el.filterLabel = $("player-filter-label");
    el.filterPanel = $("player-filter-panel");
    el.filterList = $("player-filter-list");
    el.filterSearch = $("player-filter-search");
    el.note = $("player-note");
    el.cover = $("player-cover");
    el.coverImg = $("player-cover-img");
    el.lyric = $("player-lyric");
    el.lyricText = $("player-lyric-text");
    el.time = $("player-time");
    el.seek = $("player-seek");
    el.fill = $("player-seek-fill");
    el.stat = $("player-stat");
    el.warn = $("player-warn");
    el.toggleBtn = $("player-toggle");
    el.lightbox = $("player-lightbox");
    el.lightboxImg = $("player-lightbox-img");
    el.flow = $("player-flow");
    el.flowStage = $("player-flow-stage");
    el.flowTrack = $("player-flow-track");
    if (!el.btn || !el.card) return;
    try {
      var a = Config && Config.section && Config.section("audio");
      if (a && typeof a.music === "number") userVol = Math.min(1, Math.max(0, a.music));
    } catch (e) {
    }
    el.btn.addEventListener("click", function() {
      var open = !cardOpen();
      setCardOpen(open, el.btn);
      try {
        if (open && !tracks.length) {
          var stNow = restoreState[activeLib];
          if (stNow === "prompt" || stNow === void 0) {
            var pr = grantNow(activeLib);
            if (pr) pr.then(function(stx) {
              restoreState[activeLib] = stx;
              if (stx === "ok") {
                tracks = AudioLib.list(activeLib);
                paintCover();
                afterScan();
              }
              renderList();
              paintStat();
            });
          }
        }
      } catch (e) {
      }
    });
    if (el.cover) el.cover.addEventListener("click", function() {
      var tCov = nowTrack;
      if (tCov && tCov.coverUrl && el.lightbox) {
        if (el.lightboxImg) el.lightboxImg.src = tCov.coverUrl;
        setLightbox(true);
      } else {
        openCover();
      }
    });
    if (el.filterToggle) el.filterToggle.addEventListener("click", function() {
      setFilterOpen(!filterOpen[activeLib]);
    });
    if (el.filterSearch) el.filterSearch.addEventListener("input", function() {
      renderFilterList();
    });
    document.addEventListener("pointerdown", function(ev) {
      if (!filterOpen[activeLib]) return;
      if (el.filter && ev.target && el.filter.contains(ev.target)) return;
      setFilterOpen(false);
    }, true);
    document.addEventListener("keydown", function(ev) {
      if (ev.key === "Escape" && filterOpen[activeLib]) setFilterOpen(false);
      else if (ev.key === "Escape" && folderMode) toggleFolderMode();
    });
    var vkBtn = $("pl-view");
    if (vkBtn) vkBtn.addEventListener("click", function() {
      var chV = $("chat");
      var chatOpenV = chV && !chV.classList.contains("collapsed");
      if (chatOpenV) {
        if (cardOpen()) setCardOpen(false);
        else setCardOpen(true);
        return;
      }
      var showingCovers = flowView === "cover" && cardOpen();
      if (!morphViewSwitch(!showingCovers)) setFlowView(showingCovers ? "list" : "cover");
    });
    var libBtn = $("pl-lib");
    if (libBtn) libBtn.addEventListener("click", function() {
      setActiveLib(activeLib === "asmr" ? "music" : "asmr");
    });
    if (el.flowStage) {
      el.flowStage.addEventListener("wheel", onFlowWheel, { passive: false });
      el.flowStage.addEventListener("pointerdown", onFlowDown);
      el.flowStage.addEventListener("pointermove", onFlowMove);
      el.flowStage.addEventListener("pointerup", onFlowUp);
      el.flowStage.addEventListener("pointercancel", onFlowUp);
    }
    document.addEventListener("keydown", onFlowKey);
    global.addEventListener("resize", function() {
      if (flowView === "cover") applyFlow();
    });
    setFlowView("list");
    if (el.lightbox) {
      el.lightbox.addEventListener("click", function() {
        setLightbox(false);
      });
      document.addEventListener("keydown", function(ev) {
        if (ev.key === "Escape") setLightbox(false);
      });
    }
    var pickBtn = $("player-pick");
    if (pickBtn) pickBtn.addEventListener("click", function() {
      pick();
    });
    if (el.seek) {
      let seekTo = function(ev) {
        var r = el.seek.getBoundingClientRect();
        var u = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
        if (!audio || !isFinite(audio.duration) || !audio.duration) {
          if (!nowTrack) {
            var fl2 = shownTracks();
            if (fl2.length) {
              var fi2 = flowView === "cover" ? Math.max(0, Math.min(fl2.length - 1, Math.round(flowPos))) : 0;
              pendingSeek = u;
              flowPlay(fi2);
              return;
            }
          }
          return;
        }
        audio.currentTime = u * audio.duration;
        paintProgress();
      };
      var dragging = false;
      el.seek.addEventListener("pointerdown", function(ev) {
        dragging = true;
        try {
          el.seek.setPointerCapture(ev.pointerId);
        } catch (e) {
        }
        seekTo(ev);
        ev.preventDefault();
      });
      el.seek.addEventListener("pointermove", function(ev) {
        if (dragging) seekTo(ev);
      });
      el.seek.addEventListener("pointerup", function() {
        dragging = false;
      });
      el.seek.addEventListener("pointercancel", function() {
        dragging = false;
      });
    }
    var prev = $("player-prev"), next = $("player-next");
    if (prev) prev.addEventListener("click", function() {
      if (flowView === "cover") flowMove(-1);
      else step(-1);
    });
    if (next) next.addEventListener("click", function() {
      if (flowView === "cover") flowMove(1);
      else step(1);
    });
    if (el.toggleBtn) el.toggleBtn.addEventListener("click", function() {
      if (flowView === "cover") {
        var fl = shownTracks();
        var fi = Math.max(0, Math.min(fl.length - 1, Math.round(flowPos)));
        var ft = fl[fi];
        if (ft && (!nowTrack || nowTrack.id !== ft.id)) {
          flowPlay(fi);
          return;
        }
      }
      toggle();
    });
    var closeBtn = $("player-close");
    if (closeBtn) closeBtn.addEventListener("click", function() {
      closePlayer();
    });
    wireDuck();
    global.addEventListener("resize", function() {
      syncGeom(true);
    });
    var c = $("chat");
    if (c) {
      c.addEventListener("transitionrun", function() {
        chatTrans++;
        followStart();
        if (!c.classList.contains("collapsed")) coverEnter();
      });
      c.addEventListener("transitionend", function() {
        chatTrans = Math.max(0, chatTrans - 1);
        if (!chatTrans) followEndSoon();
      });
      c.addEventListener("transitioncancel", function() {
        chatTrans = Math.max(0, chatTrans - 1);
        if (!chatTrans) followEndSoon();
      });
      c.addEventListener("transitionend", function() {
        syncGeom(true);
      });
      try {
        new MutationObserver(function() {
          followGeom(durMs("--dur-3", 300));
          if (!c.classList.contains("collapsed")) coverEnter();
          try {
            var collapsedNow = c.classList.contains("collapsed");
            if (!collapsedNow) {
              if (cardOpen()) {
                setCardOpen(false);
                viewBeforeChat = flowView;
              } else viewBeforeChat = null;
              openedWhileExpanded = false;
            } else {
              var flowN2 = el.flow;
              if (viewBeforeChat || cardOpen() || openedWhileExpanded) {
                var flowWasOpenN = !!(flowN2 && !flowN2.classList.contains("collapsed"));
                var flowWasHiddenN = !!(flowN2 && flowN2.classList.contains("hidden"));
                setFlowView("cover");
                if (!cardOpen()) setCardOpen(true);
                if ((flowWasOpenN || flowWasHiddenN) && flowN2) {
                  revealCoverflow(flowN2, {
                    keep: function() {
                      var chNow = $("chat");
                      return !!(chNow && chNow.classList.contains("collapsed"));
                    },
                    fallbackMs: 400
                  });
                }
              }
              viewBeforeChat = null;
              openedWhileExpanded = false;
            }
          } catch (e) {
          }
          paintBarVisibility();
          try {
            syncGeom(true);
          } catch (e) {
          }
        }).observe(c, { attributes: true, attributeFilter: ["class"] });
      } catch (e) {
      }
    }
    var log = $("log");
    if (log) {
      try {
        new MutationObserver(function() {
          followGeom(durMs("--dur-1", 160));
        }).observe(log, { childList: true });
      } catch (e) {
      }
    }
    if (el.lyric && global.ResizeObserver) {
      try {
        new ResizeObserver(function() {
          followGeom(durMs("--dur-1", 160));
        }).observe(el.lyric);
      } catch (e) {
      }
    }
    syncGeom(true);
    if (global.AudioLib) {
      ["asmr", "music"].forEach(function(lib) {
        AudioLib.restore(lib, false).then(function(st) {
          if (st === "ok") rememberPicked(lib);
          else if (st === "none" && wasPicked(lib)) st = "lost";
          restoreState[lib] = st;
          if (lib === activeLib) {
            tracks = AudioLib.list(activeLib);
            renderList();
            paintStat();
            if (st === "ok") {
              paintCover();
              afterScan();
            }
          }
          if (st === "prompt") armAutoGrant(lib);
        }).catch(function() {
        });
      });
    }
    paintCover();
    refreshTexts();
  }
  var granting = {};
  function grantNow(lib) {
    if (granting[lib]) return null;
    granting[lib] = true;
    return AudioLib.restore(lib, true).then(function(st) {
      delete granting[lib];
      return st;
    }).catch(function() {
      delete granting[lib];
      return "none";
    });
  }
  function armAutoGrant(lib) {
    function off() {
      document.removeEventListener("pointerdown", fire, true);
      document.removeEventListener("keydown", fire, true);
    }
    function fire() {
      var st0 = restoreState[lib];
      if (st0 !== "prompt" && st0 !== void 0) {
        off();
        return;
      }
      if (st0 === void 0) return;
      var p = grantNow(lib);
      if (!p) return;
      p.then(function(st) {
        restoreState[lib] = st;
        if (st === "ok" && lib === activeLib) {
          tracks = AudioLib.list(activeLib);
          paintCover();
          afterScan();
        }
        if (lib === activeLib) {
          renderList();
          paintStat();
        }
        if (st === "ok") off();
      });
    }
    document.addEventListener("pointerdown", fire, true);
    document.addEventListener("keydown", fire, true);
  }
  function pick() {
    if (!global.AudioLib) {
      note(T("audio.pickHint", ""), true);
      return;
    }
    if (restoreState[activeLib] === "prompt") {
      var p = grantNow(activeLib);
      if (!p) return;
      restoreState[activeLib] = "none";
      p.then(function(st) {
        if (st === "ok") {
          tracks = AudioLib.list(activeLib);
          renderList();
          paintStat();
          note("");
        } else {
          doPick();
        }
      });
      return;
    }
    doPick();
  }
  function doPick() {
    note(T("audio.loading", "正在读取文件夹…"));
    var lib = activeLib;
    AudioLib.pick(lib).then(function(r) {
      if (r && r.cancelled) {
        note("");
        return;
      }
      tracks = AudioLib.list(lib);
      if (tracks.length) rememberPicked(lib);
      if (!tracks.length) note(T("audio.empty", "这个文件夹里没有能播放的音频"), true);
      else note("");
      renderList();
      paintStat();
      afterScan(true);
    }).catch(function() {
      note(T("audio.empty", "这个文件夹里没有能播放的音频"), true);
    });
  }
  function afterScan(autoOpen) {
    paintStat();
    if (tracks.length && global.AudioLib && !AudioLib.hasImage(activeLib)) {
      var msg = T("audio.noCover", "没找到封面图：把上一层的作品文件夹也选进来（会递归找），或在该文件夹里放一张 cover.jpg");
      note(msg);
      showWarn(msg);
      if (autoOpen) setCardOpen(true);
    }
  }
  var warnTimer = 0;
  function showWarn(msg) {
    if (!el.warn) return;
    el.warn.textContent = msg || "";
    el.warn.classList.toggle("hidden", !msg);
    if (warnTimer) {
      clearTimeout(warnTimer);
      warnTimer = 0;
    }
    if (msg) warnTimer = setTimeout(function() {
      el.warn.classList.add("hidden");
    }, 12e3);
  }
  function paintStat() {
    if (!el.stat) return;
    if (!tracks.length) {
      el.stat.textContent = "";
      return;
    }
    var parts = [];
    var folder = global.AudioLib ? AudioLib.folderName(activeLib) : "";
    if (folder) parts.push(folder);
    parts.push(T("audio.count", "{n} 首", { n: tracks.length }));
    parts.push(global.AudioLib && AudioLib.hasImage(activeLib) ? T("audio.coverYes", "有封面图") : T("audio.coverNo", "无封面图"));
    el.stat.textContent = parts.join(" · ");
  }
  function renderTabs() {
    var nm = $("pl-lib-name");
    if (nm) {
      nm.textContent = activeLib === "asmr" ? T("audio.libAsmr", "ASMR") : T("audio.libMusic", "音乐");
    }
  }
  function updatePickBtn() {
    var pb = $("player-pick");
    if (!pb) return;
    if (tracks.length) {
      pb.textContent = T("audio.rescan", "重新选择文件夹");
      return;
    }
    pb.textContent = activeLib === "asmr" ? T("audio.pickAsmr", "选择 ASMR 文件夹") : T("audio.pickMusic", "选择音乐文件夹");
  }
  function setActiveLib(lib) {
    if (lib !== "asmr" && lib !== "music") return;
    folderMode = false;
    if (lib !== activeLib && playing) {
      try {
        if (audio) audio.pause();
      } catch (e) {
      }
      playing = false;
      paintPlayBtn();
      stopLoop();
      applyPose();
    }
    activeLib = lib;
    if (global.AudioLib) {
      global.AudioLib.setActive(lib);
      tracks = global.AudioLib.list(lib);
    } else tracks = [];
    renderTabs();
    renderList();
    paintStat();
    updatePickBtn();
    if (flowView === "cover") renderFlow();
  }
  function refreshTexts() {
    if (el.btn) el.btn.title = T("audio.tip", "音乐 / ASMR 播放器");
    var t = $("player-title");
    if (t) t.textContent = T("audio.title", "音乐 / ASMR");
    if (el.lyricText && lineIdx === -1) {
      el.lyricText.textContent = nowTrack ? nowTrack.name.replace(/\.[^.]+$/, "") : "";
    }
    updatePickBtn();
    var lv = $("player-prev"), nx = $("player-next");
    if (lv) lv.title = T("audio.prev", "上一首");
    if (nx) nx.title = T("audio.next", "下一首");
    renderTabs();
    paintPlayBtn();
    paintStat();
    renderFlowTexts();
    renderList();
  }
  function renderFlowTexts() {
    var lib = $("pl-lib");
    if (lib) lib.title = T("audio.switchLib", "切换歌单（ASMR / 音乐）");
    if (el.flowStage) el.flowStage.setAttribute("aria-label", T("audio.flowAria", "封面轮播：左右方向键或滚轮切换"));
    paintFlowPlay();
  }
  var Player = {
    init,
    refreshTexts,

    play: function(i) {
      playTrack(tracks[i], activeLib);
    },
    playTrack,
    toggle,
    next: function() {
      step(1);
    },
    prev: function() {
      step(-1);
    },
    setLib: setActiveLib,
    activeLib: function() {
      return activeLib;
    },
    openCard: function() {
      setCardOpen(true);
    },

    clearCoverCache: function() {
      try {
        for (var k1 in thumbCache) if (thumbCache.hasOwnProperty(k1)) delete thumbCache[k1];
      } catch (e) {
      }
      try {
        for (var k2 in thumbPending) if (thumbPending.hasOwnProperty(k2)) delete thumbPending[k2];
      } catch (e) {
      }
      try {
        for (var k3 in thumbQueued) if (thumbQueued.hasOwnProperty(k3)) delete thumbQueued[k3];
      } catch (e) {
      }
      try {
        thumbQueue.length = 0;
      } catch (e) {
      }
      return true;
    },
    morphCard: function(node, src) {
      morphNode(node, src);
    },
    _lastMorph: function() {
      return lastMorph;
    },
    closeCard: function() {
      setCardOpen(false);
    },

    setFlowView,
    flowView: function() {
      return flowView;
    },

    flowState: function() {
      var out = {
        view: flowView,
        pos: Number(flowPos.toFixed(3)),
        count: shownTracks().length,
        spacing: flowSpacing(),
        win: CFG.win,
        cards: []
      };
      for (var k = 0; k < flowItems.length; k++) {
        var nd = flowItems[k];
        var cs = null;
        try {
          cs = global.getComputedStyle(nd.node);
        } catch (e) {
        }
        out.cards.push({
          i: nd.i,
          d: Number((nd.i - flowPos).toFixed(3)),
          name: nd.track.name,
          hasCover: !!nd.track.coverUrl,
          nocover: nd.node.classList.contains("nocover"),
          center: nd.node.classList.contains("is-center"),
          playing: nd.node.classList.contains("on"),
          visibility: nd.node.style.visibility,
          zIndex: nd.node.style.zIndex,
          transform: nd.node.style.transform,

          matrix: cs ? cs.transform : null
        });
      }
      var flatOf = function(n) {
        if (!n) return null;
        try {
          return global.getComputedStyle(n).transformStyle;
        } catch (e) {
          return null;
        }
      };
      out.style = {
        stage: flatOf(el.flowStage),
        track: flatOf(el.flowTrack),
        stagePerspective: el.flowStage ? global.getComputedStyle(el.flowStage).perspective : null,
        flowOverflow: el.flow ? global.getComputedStyle(el.flow).overflow : null,
        cardOverflow: el.card ? global.getComputedStyle(el.card).overflow : null
      };
      return out;
    },

    _loadFilesForTest: function(files, lib) {
      var L0 = lib || activeLib;
      var n = global.AudioLib._loadFiles(files, L0);
      if (L0 !== activeLib) setActiveLib(L0);
      else {
        tracks = global.AudioLib.list(L0);
        renderList();
      }
      restoreState[L0] = "ok";
      paintCover();
      refreshTexts();
      return n;
    },
    state: function() {
      return {
        route,
        playing,
        env: !!envData,

        envCount: global.AudioLib && global.AudioLib.envCount ? global.AudioLib.envCount(activeLib) : 0,
        lib: activeLib,
        playLib: nowLib,
        pose: _pose,
        level: Number(liveLevel.toFixed(3)),
        name: nowTrack ? nowTrack.name : null,
        count: tracks.length,
        cur: audio ? Number((audio.currentTime || 0).toFixed(2)) : -1,
        dur: audio && isFinite(audio.duration) ? Number(audio.duration.toFixed(2)) : -1,
        coverUrl: nowTrack ? !!nowTrack.coverUrl : false,
        time: el.time ? el.time.textContent : null,
        lyric: el.lyricText ? el.lyricText.textContent : null,

        cover: !!(el.coverImg && !el.coverImg.classList.contains("hidden") && el.cover && global.getComputedStyle(el.cover).display !== "none"),
        lightbox: !!(el.lightbox && !el.lightbox.classList.contains("off")),
        cardOpen: cardOpen(),

        flowView,
        flowVisible: !!(el.flow && !el.flow.classList.contains("hidden") && el.flow.getBoundingClientRect().height > 0),
        flowPos: Math.round(flowPos)
      };
    }
  };
  global.TsumuPlayer = Player;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window);
