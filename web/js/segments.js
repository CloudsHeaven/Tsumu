(function(global) {
  "use strict";
  var CHARA_ID = "tsumu";
  var NARRATOR = "narrator";
  var TRANSLATION = "translation";
  var CHARACTER = "character";
  var RE_PREFIX = /^\s*(旁白|织音|译文|角色\s*\[\s*([A-Za-z0-9_-]+)\s*\])\s*[：:]\s*/;
  var RE_ANY_PREFIX = /^[ \t]*(?:旁白|织音|译文|角色\s*\[\s*[A-Za-z0-9_-]+\s*\])\s*[：:]/m;
  var RE_CUE = /\[[^\[\]\r\n]*\]/g;
  var RE_PAREN_ONLY = /^\s*[（(][^）)]*[）)]\s*$/;
  var RULE = "──────";
  var LABELS = {
    zh: { narrator: "旁白", translation: "译文", tsumu: "织音" },
    "zh-tw": { narrator: "旁白", translation: "譯文", tsumu: "织音" },
    ja: { narrator: "ナレーション", translation: "訳文", tsumu: "织音" },
    en: { narrator: "Narration", translation: "Translation", tsumu: "Tsumu" },
    hi: { narrator: "वर्णन", translation: "अनुवाद", tsumu: "Tsumu" },
    id: { narrator: "Narasi", translation: "Terjemahan", tsumu: "Tsumu" },
    "pt-br": { narrator: "Narração", translation: "Tradução", tsumu: "Tsumu" }
  };
  function labelsFor(lang) {
    return LABELS[lang] || LABELS.zh;
  }
  var RE_MACHINE_FW_CUE = /^[ \t]*［([^［］\r\n]*[：:][^［］\r\n]*)］[ \t]*$/gm;
  var RE_MACHINE_CJK_CUE = /^[ \t]*【([^【】\r\n]*[：:][^【】\r\n]*)】[ \t]*$/gm;
  function normalizeMachineCues(s) {
    return String(s == null ? "" : s).replace(RE_MACHINE_FW_CUE, function(whole, inner) {
      return "[" + inner + "]";
    }).replace(RE_MACHINE_CJK_CUE, function(whole, inner) {
      return "[" + inner + "]";
    });
  }
  function stripCues(s) {
    return normalizeMachineCues(s).replace(RE_CUE, "").replace(/[ \t]{2,}/g, " ").trim();
  }
  function speakerOf(word) {
    if (word === "旁白") return NARRATOR;
    if (word === "译文") return TRANSLATION;
    if (word === "织音") return CHARA_ID;
    return CHARACTER;
  }
  function parse(text) {
    var out = [];
    var active = null;
    var activeId = null;
    String(text == null ? "" : text).replace(/\r\n/g, "\n").split("\n").forEach(function(raw) {
      var line = raw.trim();
      if (!line) return;
      var m = RE_PREFIX.exec(line);
      if (m) {
        active = speakerOf(m[1]);
        activeId = active === CHARACTER ? String(m[2] || "").toLowerCase() : null;
        var content = line.slice(m[0].length).trim();
        if (content) out.push({ speaker: active, text: content, characterId: activeId });
        return;
      }
      var sp = RE_PAREN_ONLY.test(line) ? NARRATOR : active || CHARA_ID;
      out.push({ speaker: sp, text: line, characterId: sp === CHARACTER ? activeId : null });
    });
    return out;
  }
  function hasLabels(text) {
    return RE_ANY_PREFIX.test(String(text == null ? "" : text));
  }
  var RE_PAREN_LEAD = /^[ \t]*[（(]\s*([^（()）\r\n]*?)\s*[）)]\s*/;
  var RE_PAREN_OPEN = /^[ \t]*[（(]/;
  function peelParens(line) {
    var narr = [], rest = String(line == null ? "" : line), m;
    while (m = RE_PAREN_LEAD.exec(rest)) {
      if (!m[1]) break;
      narr.push(m[1]);
      rest = rest.slice(m[0].length);
    }
    if (!narr.length && RE_PAREN_OPEN.test(rest)) {
      narr.push(rest.replace(RE_PAREN_OPEN, "").trim());
      rest = "";
    }
    return { narr: narr.join(" "), rest };
  }
  function stripParenNarr(text) {
    return String(text == null ? "" : text).replace(/(^|\n)(?:[ \t]*[（(][^（()）\r\n]*[）)][ \t]*)+/g, "$1");
  }
  function speakText(text) {
    var src = String(text == null ? "" : text);
    if (!hasLabels(src)) return stripCues(stripParenNarr(src));
    var lines = parse(src).filter(function(s) {
      return s.speaker === CHARA_ID;
    }).map(function(s) {
      return stripCues(stripParenNarr(s.text));
    }).filter(Boolean);
    return lines.length ? lines.join("\n") : "";
  }
  function translationText(text) {
    return parse(text).filter(function(s) {
      return s.speaker === TRANSLATION;
    }).map(function(s) {
      return stripCues(s.text);
    }).filter(Boolean).join("\n");
  }
  function narrationText(text) {
    var src = String(text == null ? "" : text);
    if (!hasLabels(src)) return "";
    try {
      return parse(src).filter(function(s) {
        return s.speaker === NARRATOR;
      }).map(function(s) {
        return stripCues(s.text);
      }).filter(Boolean).join("\n");
    } catch (e) {
      return "";
    }
  }
  function displayText(text, lang, opts) {
    opts = opts || {};
    var showOriginal = opts.showOriginal !== false;
    var src = String(text == null ? "" : text);
    if (!hasLabels(src)) return stripCues(src);
    var L = labelsFor(lang);
    var lines = [];
    var rulePlaced = false;
    var items = parse(src);
    var hasTrans = items.some(function(s) {
      return s.speaker === TRANSLATION && stripCues(s.text);
    });
    items.forEach(function(s) {
      var t = stripCues(s.text);
      if (!t) return;
      if (s.speaker === TRANSLATION) {
        if (showOriginal) {
          if (!rulePlaced) {
            lines.push(RULE);
            rulePlaced = true;
          }
          lines.push(L.translation + "：" + t);
        } else {
          lines.push(t);
        }
      } else if (s.speaker === NARRATOR) {
        lines.push(L.narrator + "：" + t);
      } else if (s.speaker === CHARACTER) {
        lines.push("角色[" + (s.characterId || "unknown") + "]：" + t);
      } else {
        if (showOriginal || !hasTrans) lines.push(t);
      }
    });
    if (lines.length) return lines.join("\n");
    return translationText(src) || stripCues(src);
  }
  function splitNarration(text, lang) {
    var src = String(text == null ? "" : text);
    if (!src) return null;
    var L = labelsFor(lang);
    var words = [L.narrator, LABELS.zh.narrator];
    var uniq = words.filter(function(w, i) {
      return w && words.indexOf(w) === i;
    });
    var re = new RegExp("^[ \\t]*(?:" + uniq.join("|") + ")[ \\t]*[：:]");
    var lines = src.replace(/\r\n/g, "\n").split("\n");
    var seq = [];
    var inNarr = false;
    var separated = false;
    var push = function(kind, text2) {
      seq.push({ kind, text: text2 });
    };
    lines.forEach(function(line) {
      if (re.test(line)) {
        inNarr = true;
        separated = false;
        push("narr", stripCues(line.replace(re, "")));
        return;
      }
      if (!line.trim()) {
        push(inNarr ? "narr" : "body", "");
        if (inNarr) separated = true;
        return;
      }
      var isOtherLabel = RE_ANY_PREFIX.test(line);
      var peel = peelParens(line);
      var forceBody = false;
      if (peel.narr) {
        push("narr", peel.narr);
        if (!peel.rest.trim()) return;
        line = peel.rest;
        forceBody = true;
      }
      push(inNarr && !separated && !isOtherLabel && !forceBody ? "narr" : "body", line);
    });
    var merged = [];
    seq.forEach(function(it) {
      var last = merged[merged.length - 1];
      if (last && last.kind === it.kind) last.lines.push(it.text);
      else merged.push({ kind: it.kind, lines: [it.text] });
    });
    var parts = merged.map(function(g) {
      return {
        kind: g.kind,
        text: g.lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()
      };
    }).filter(function(p) {
      return !!p.text;
    });
    var nar = parts.filter(function(p) {
      return p.kind === "narr";
    }).map(function(p) {
      return p.text;
    }).join("\n\n").trim();
    if (!nar) return null;
    return {
      narr: nar,
      body: parts.filter(function(p) {
        return p.kind === "body";
      }).map(function(p) {
        return p.text;
      }).join("\n\n").trim(),

      parts
    };
  }
  global.Segments = {

    CHARA_ID,
    NARRATOR,
    TRANSLATION,
    RULE,
    hasLabels,
    parse,
    stripCues,
    speakText,
    translationText,
    narrationText,
    splitNarration,

    stripParenNarr,
    displayText,
    labelsFor
  };
})(window);
