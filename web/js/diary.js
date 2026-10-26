(function(global) {
  "use strict";
  var KEY = "tsumu.diary.v1";
  var PENDING_MAX = 60;
  var DIALOGUE_MAX = 4e3;
  var OUT_TOKENS = 1600;
  var OUT_MAX = 32e3;
  var TEXT_MAX = 2e4;
  var RAW_KEEP = 30;
  var SYS = "今から、あなた自身の**日記**を書きます（下の材料が材料です）。\nこの日記は「织音眼中的你」＝织音から見たあなたの記録として、あとで本人（あなた）が読みます。\n守ること：\n・**あなた（织音）の一人称・口調・性格は、上の設定のとおりに保つこと**（別人にならない）。\n・材料は下の「今日の会話」と「すでに書いた今日の日記」だけ。出来事や言葉を具体的に拾い、**憶測で作り話を足さない**。\n・**箇条書き・時刻の羅列にしない**。読み物として、自然な数段落の文章にする。\n・同じ出来事を二度書かない（自然につなげる）。\n・日付・見出し・タイトルは書かない（アプリ側で付ける）。本文だけを出力する。\n・★ 本文は必ず「{LANG}」で書くこと。\n・日付：{DATE}\n{MODE_RULES}";
  var MODE_APPEND = "・★★ 今日は**まだ終わっていない**（記録の途中）。すでに書いたことを**土台**にして、**新しい出来事だけを足して**書き直す。\n・★ 重複は**まとめてよい**（同じ抱擁・同じやり取りを何度も書き直さない）。事実と、あなたの言葉そのものは削らない。\n・★ **箇条書きの記録にしない**。一日の読み物として、**印象に残った数件を軸に**書く。毎ターンを律儀に全部並べない（それは記録であって日記ではない ✗）。\n・★ **元の文章より短くしてはいけない** ✗（長くなるのは歓迎 ✓）。";
  var MODE_DIGEST = "・★★ この日は**もう終わった**。一日ぶんを**読み物として整える**。\n・下の「すでに書いた今日の日記」が、その日の**全部の記録（長い下書き）**。\n・それを一日の日記として**読みやすく整える**（出来事の順序・気持ちの流れを大事に ✓）。\n・長さは **150〜400 字**。\n・★★ **絶対に残すもの**：① **初めてのこと** ② **約束・誓い** ③ **気持ちの转折** ④ **あなた自身や二人の関係を変えたこと**（例：「あなたに言われて話し方を変えた」）。\n・★ **削ってよいもの**：重複・枝葉・日常の雑談・毎ターンの律儀な流水・具体的な時刻。\n・★ 全部の話題を残そうとしない ✗（150〜400 字に収まらない）。**上の①〜④は必ず残し、それ以外は思い切って削る**（少ない件を深く書く方が、全部を薄く並べるより読み物として良い ✓）。\n・※ 削る前の長文は `raw` に残っているので、**失くしてはいない** ✓（安心して削ってよい）。";
  var state = blank();
  var busy = false;
  var _complete = null;
  function blank() {
    return { v: 1, entries: [], pending: [] };
  }
  function clip(s, n) {
    var t = String(s == null ? "" : s).replace(/\s+$/, "");
    return t.length > n ? t.slice(0, n) : t;
  }
  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }
  function dateOnly(d) {
    var x = d instanceof Date ? d : new Date(d == null ? Date.now() : d);
    if (isNaN(x.getTime())) x =  new Date();
    return x.getFullYear() + "-" + pad2(x.getMonth() + 1) + "-" + pad2(x.getDate());
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
      if (j && j.v === 1) {
        state = {
          v: 1,
          entries: Array.isArray(j.entries) ? j.entries.filter(function(e) {
            return e && typeof e.date === "string" && typeof e.text === "string";
          }) : [],
          pending: Array.isArray(j.pending) ? j.pending.filter(function(t) {
            return t && (t.u || t.a);
          }) : []
        };
        return;
      }
    } catch (e) {
    }
    state = blank();
  }
  function runQueue(fn) {
    if (busy) return busy.then(function() {
      return fn();
    });
    busy = Promise.resolve().then(fn).then(
      function(v) {
        busy = false;
        return v;
      },
      function(e) {
        busy = false;
        throw e;
      }
    );
    return busy;
  }
  function complete(sys, body, opts) {
    if (typeof _complete === "function") {
      try {
        return Promise.resolve(_complete(sys, body, opts));
      } catch (e) {
        return Promise.reject(e);
      }
    }
    if (global.Api && typeof Api.complete === "function") return Api.complete(sys, body, opts);
    return Promise.reject(new Error("NO_COMPLETE"));
  }
  function dialogueOf(list) {
    var s = list.map(function(t) {
      var line = "";
      if (t.u) line += "你：" + t.u + "\n";
      if (t.a) line += "织音：" + t.a;
      return line;
    }).join("\n");
    return s.length > DIALOGUE_MAX ? "…" + s.slice(s.length - DIALOGUE_MAX + 1) : s;
  }
  function langName() {
    try {
      if (global.Langs && Langs.name && Langs.translate) return Langs.name(Langs.translate());
    } catch (e) {
    }
    return "简体中文";
  }
  function personaText() {
    try {
      if (global.Api && typeof Api.personaText === "function") return Api.personaText() || "";
    } catch (e) {
    }
    return "";
  }
  function findEntry(date) {
    for (var i = 0; i < state.entries.length; i++) if (state.entries[i].date === date) return state.entries[i];
    return null;
  }
  function upsert(date, text, when, turns, raw, digested) {
    var e = findEntry(date);
    if (e) {
      e.text = text;
      e.at = when.getTime();
      e.turns = (e.turns || 0) + (turns || 0);
      if (raw !== void 0) e.raw = raw;
      if (digested !== void 0) e.digested = !!digested;
    } else {
      state.entries.push({
        date,
        text,
        at: when.getTime(),
        turns: turns || 0,
        note: "",
        raw: raw === void 0 ? "" : raw,
        digested: !!digested
      });
    }
    state.entries.sort(function(a, b) {
      return String(b.date).localeCompare(String(a.date));
    });
    trimRaw();
  }
  function trimRaw() {
    var seen = 0;
    for (var i = 0; i < state.entries.length; i++) {
      var e = state.entries[i];
      if (!e.raw) continue;
      seen++;
      if (seen > RAW_KEEP) e.raw = "";
    }
  }
  function outTokensFor(body, mode, existLen) {
    var n = String(body || "").length;
    var prev = Number(existLen) || 0;
    var want = Math.round(n * (mode === "digest" ? 0.7 : 1.7));
    var need = Math.round(prev * 1.7) + Math.max(600, Math.round((n - prev) * 1.2));
    var floor = Math.max(OUT_TOKENS, need);
    return Math.max(floor, Math.min(OUT_MAX, want));
  }
  function flushOne(date, turns, when) {
    var e = findEntry(date) || {};
    var prev = e.text || "";
    var isToday = date === dateOnly(when);
    var mode = !isToday && !e.digested ? "digest" : "append";
    var dl = dialogueOf(turns);
    var body = (mode === "digest" ? "【この日の全部の記録（長い下書き）】：\n" : "【すでに書いた今日の日記】★土台にすること（勝手に短くしない）：\n") + (prev || "（まだ無い）") + (dl ? "\n\n【今日の会話（新しい材料）】：\n" + dl : "");
    var sys = SYS.replace("{LANG}", langName()).replace("{DATE}", date).replace("{MODE_RULES}", mode === "digest" ? MODE_DIGEST : MODE_APPEND);
    var pt = personaText();
    if (pt) sys = pt + "\n\n---\n\n" + sys;
    var maxTok = outTokensFor(body, mode, prev.length);
    var lastMeta = null;
    return complete(sys, body, {
      maxTokens: maxTok,
      temperature: 0.4,
      onMeta: function(m) {
        lastMeta = m;
      }
    }).then(function(out) {
      var text = clip(out, TEXT_MAX).trim();
      if (!text) return false;
      if (lastMeta && lastMeta.finish_reason === "length" && maxTok >= 16e3) {
        return false;
      }
      if (mode === "digest") {
        upsert(date, text, when, 0, prev, true);
      } else {
        upsert(date, text, when, turns.length, void 0, false);
      }
      state.pending = state.pending.filter(function(t) {
        return dateOnly(t.at) !== date;
      });
      persist();
      return true;
    }, function() {
      return false;
    });
  }
  function digestPast(when) {
    var today = dateOnly(when);
    var todo = state.entries.filter(function(e) {
      return e.date < today && !e.digested && String(e.text || "").trim();
    });
    if (!todo.length) return Promise.resolve(false);
    var chain = Promise.resolve(false);
    todo.forEach(function(e) {
      chain = chain.then(function(changed) {
        return flushOne(e.date, [], when).then(function(ok) {
          return changed || ok;
        });
      });
    });
    return chain;
  }
  function needsDigest(now) {
    var today = dateOnly(now ||  new Date());
    return state.entries.some(function(e) {
      return e.date < today && !e.digested && String(e.text || "").trim();
    });
  }
  var Diary = {
    KEY,
    SYS,

    PENDING_MAX,

    OUT_TOKENS,
    OUT_MAX,
    TEXT_MAX,
    MODE_APPEND,
    MODE_DIGEST,
    outTokensFor,
    dateOnly,
    load,

    ingest: function(userText, shownText) {
      try {
        var u = clip(userText, 2e3), a = clip(shownText, 2e3);
        if (!u && !a) return false;
        state.pending.push({ u, a, at: Date.now() });
        if (state.pending.length > PENDING_MAX) state.pending = state.pending.slice(-PENDING_MAX);
        persist();
        return true;
      } catch (e) {
        return false;
      }
    },
    pendingCount: function() {
      return state.pending.length;
    },

    needsDigest: function(now) {
      return needsDigest(now);
    },
    pendingDates: function() {
      var seen = {}, out = [];
      state.pending.forEach(function(t) {
        var d = dateOnly(t.at);
        if (!seen[d]) {
          seen[d] = 1;
          out.push(d);
        }
      });
      return out;
    },
    count: function() {
      return state.entries.length;
    },

    entries: function() {
      return state.entries.slice();
    },
    get: function(date) {
      return findEntry(String(date || ""));
    },

    flushNow: function(now) {
      var when = now ||  new Date();
      return runQueue(function() {
        return digestPast(when).then(function(dChanged) {
          if (!state.pending.length) return dChanged;
          var groups = {}, order = [];
          state.pending.forEach(function(t) {
            var d = dateOnly(t.at);
            if (!groups[d]) {
              groups[d] = [];
              order.push(d);
            }
            groups[d].push(t);
          });
          var chain = Promise.resolve(false);
          order.forEach(function(d) {
            chain = chain.then(function(changed) {
              return flushOne(d, groups[d], when).then(function(ok) {
                return changed || ok;
              });
            });
          });
          return chain.then(function(c) {
            return c || dChanged;
          });
        });
      }).catch(function() {
        return false;
      });
    },
    remove: function(date) {
      var n = state.entries.length;
      state.entries = state.entries.filter(function(e) {
        return e.date !== String(date || "");
      });
      if (state.entries.length === n) return false;
      persist();
      return true;
    },

    setNote: function(date, text) {
      var e = findEntry(String(date || ""));
      if (!e) return false;
      e.note = clip(text, 2e3);
      persist();
      return true;
    },
    note: function(date) {
      var e = findEntry(String(date || ""));
      return e ? String(e.note || "") : "";
    },
    clear: function() {
      state = blank();
      persist();
    },

    dropPending: function() {
      var n = state.pending.length;
      state.pending = [];
      persist();
      return n;
    },
    snapshot: function() {
      return JSON.parse(JSON.stringify(state));
    },
    restore: function(snap) {
      if (!snap || typeof snap !== "object") {
        Diary.clear();
        return false;
      }
      state = {
        v: 1,
        entries: Array.isArray(snap.entries) ? snap.entries.filter(function(e) {
          return e && typeof e.date === "string" && typeof e.text === "string";
        }) : [],
        pending: Array.isArray(snap.pending) ? snap.pending.filter(function(t) {
          return t && (t.u || t.a);
        }) : []
      };
      persist();
      return true;
    },
    setCompleter: function(fn) {
      _complete = fn;
    }
  };
  load();
  global.Diary = Diary;
})(typeof window !== "undefined" ? window : globalThis);
