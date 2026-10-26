(function(global) {
  "use strict";
  var LIMIT = 3;
  var SUMMARY_SHOW = 160;
  var FEELING_SHOW = 100;
  var CUE = new RegExp(
    "还记得|记不记得|记不起|想不起来|回忆|以前|之前|上次|那次|当初|那时候|那会儿|第一次|头一回|初次|当时|从前|曾经|remember|remind me|last time|back then|that time|first time|used to|when we|覚えて|思い出|前回|あの時|初めて|昔"
  );
  var TIME_CUE = new RegExp(
    "昨天|前天|上周|上个月|上上个月|去年|前年|最近|这几天|这几年|小时候|yesterday|last week|last month|last year|recently|昨日|先週|先月|去年|最近"
  );
  function cfg() {
    try {
      if (global.Config) {
        var c = global.Config.section("longterm") || {};
        if (c.enabled === false) return { enabled: false };
      }
    } catch (e) {
    }
    return { enabled: true };
  }
  function archiveOf() {
    try {
      return global.LongMem && LongMem.archive && LongMem.archive() || [];
    } catch (e) {
      return [];
    }
  }
  function configured() {
    if (!cfg().enabled) return false;
    return archiveOf().length > 0;
  }
  function matches(text) {
    return CUE.test(String(text == null ? "" : text));
  }
  function tokensOf(text) {
    var s = String(text == null ? "" : text).toLowerCase();
    var out = [], i;
    (s.match(/[\u4e00-\u9fa5]{2,}/g) || []).forEach(function(r) {
      for (i = 0; i + 2 <= r.length; i++) out.push(r.slice(i, i + 2));
    });
    (s.match(/[a-z0-9]{2,}/g) || []).forEach(function(w) {
      out.push(w);
    });
    var seen = {}, uniq = [];
    out.forEach(function(t) {
      if (!seen[t]) {
        seen[t] = 1;
        uniq.push(t);
      }
    });
    return uniq;
  }
  function clip(s, n) {
    s = String(s == null ? "" : s).replace(/\s+$/, "");
    return s.length > n ? s.slice(0, n) + "…" : s;
  }
  function rankFor(text, skip) {
    var arch = archiveOf();
    if (!arch.length) return [];
    var toks = tokensOf(text);
    var scored = [];
    arch.forEach(function(e) {
      if (!e || !e.summary) return;
      if (skip[String(e.summary)]) return;
      var hay = (String(e.summary) + " " + (e.feeling || "") + " " + (Array.isArray(e.keywords) ? e.keywords.join(" ") : "")).toLowerCase();
      var hit = 0;
      toks.forEach(function(t) {
        if (hay.indexOf(t) >= 0) hit++;
      });
      var imp = Number(e.importance) || 1;
      var refs = Number(e.refs) || 1;
      scored.push({
        e,
        hit,
        score: hit * 10 + imp * 2 + Math.min(refs, 5),
        date: String(e.date || "")
      });
    });
    if (!scored.length) return [];
    scored.sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return b.date.localeCompare(a.date);
    });
    var anyHit = scored.some(function(x) {
      return x.hit > 0;
    });
    return anyHit ? scored.filter(function(x) {
      return x.hit > 0;
    }) : scored;
  }
  function pick(text, prevText) {
    var skip = {};
    try {
      (global.LongMem && LongMem.selectedSummaries && LongMem.selectedSummaries(text) || []).forEach(function(s) {
        skip[String(s)] = 1;
      });
    } catch (e) {
    }
    var items = rankFor(text, skip).slice(0, LIMIT).map(function(x) {
      return x.e;
    });
    if (items.length >= LIMIT) return items;
    var prev = String(prevText == null ? "" : prevText).trim();
    var cur = String(text == null ? "" : text).trim();
    if (!prev || prev === cur) return items;
    rankFor(prev, skip).slice(0, LIMIT).forEach(function(x) {
      if (items.length < LIMIT && items.indexOf(x.e) < 0) items.push(x.e);
    });
    return items;
  }
  function dateLabel(e, today) {
    var d = String(e && e.date || "").trim();
    if (!d) return "（记不清具体哪天）";
    if (today && d === today) return "今天";
    return d;
  }
  function block(items, when) {
    var today = "";
    try {
      today = global.LongMem && LongMem.dateOnly ? LongMem.dateOnly(when ||  new Date()) : "";
    } catch (e) {
    }
    var lines = items.map(function(e) {
      var s = "・" + dateLabel(e, today) + "：" + clip(e.summary, SUMMARY_SHOW);
      if (e.feeling) s += "\n   （你当时的心情：" + clip(e.feeling, FEELING_SHOW) + "）";
      return s;
    });
    return "（你翻了翻自己的记忆，找到了这些：\n" + lines.join("\n") + '\n★ 用**你自己的口吻**自然地讲出来 ✓ —— 别逐条念 ✗、别说"根据记忆"这种话 ✗；想起是哪天就带上哪天 ✓）';
  }
  var EMPTY = '（你翻了翻自己的记忆，**没找到和这件事相关的** ✓ —— 那就老实说"唔…我记不太清了"，不要编 ✗）';
  var Recall = {
    CUE,
    LIMIT,
    EMPTY,
    matches,
    configured,
    _tokens: tokensOf,

    _pick: pick,

    search: function(text, when, prevText) {
      try {
        if (!matches(text) || !configured()) return Promise.resolve("");
        var items = pick(text, prevText);
        return Promise.resolve(items.length ? block(items, when) : EMPTY);
      } catch (e) {
        return Promise.resolve("");
      }
    },

    probe: function(text, prevText) {
      var items = [];
      try {
        items = pick(text, prevText);
      } catch (e) {
      }
      return {
        matched: matches(text),
        configured: configured(),
        count: items.length,
        summaries: items.map(function(e) {
          return String(e.summary || "");
        })
      };
    }
  };
  global.Recall = Recall;
})(typeof window !== "undefined" ? window : globalThis);
