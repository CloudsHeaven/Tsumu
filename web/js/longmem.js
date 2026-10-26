(function(global) {
  "use strict";
  var KEY = "tsumu.longterm.v1";
  var ENTRY_LIMIT = 40;
  var PROTECTED_KEEP = 60;
  var PIN_CATEGORIES = [
    "confession",
    "promise",
    "relationship_turning_point",
    "major_life_event"
  ];
  var PIN_LIMIT = 6;
  function isPinned(e) {
    if (!e || typeof e !== "object") return false;
    return PIN_CATEGORIES.indexOf(String(e.category)) >= 0;
  }
  var CHAR_LIMIT = 6e3;
  var DIGEST_MAX = 1600;
  var DIGEST_PROMPT_MAX = 800;
  var SELECT_LIMIT = 12;
  var SUMMARY_MAX = 300;
  var FEELING_MAX = 100;
  var BOND_MAX = 40;
  var BOND_LEVELS = 5;
  var KEYWORD_MAX = 8;
  var PENDING_MAX = 20;
  var DIALOGUE_MAX = 12e3;
  var PROTECTED = [
    "promise",
    "confession",
    "deep_hurt",
    "relationship_turning_point",
    "major_life_event",

    "first_time"
  ];
  var RECENT_ALWAYS = 3;
  var URGENT = new RegExp(
    "誓言|发誓|承诺|答应|约定|告白|喜欢你|爱你|讨厌你|恨你|伤害|背叛|分手|结婚|去世|死亡|永远|promise|swear|confess|love you|betray|hurt me|break up|marry|約束|誓う|告白|愛して|裏切|傷つ"
  );
  var CONSOLIDATE_SYS = [
    "你负责维护有限、可靠的长期记忆。当前本地时间为 {NOW}，时区为 {TZ}。",
    '只输出 JSON，不要 Markdown 或解释。格式：{"updated_at":"ISO-8601","digest":"按时间顺序的概略散文","bond":{"level":1,"note":"你和用户现在有多近（一句具体的话）"},"entries":[{"date":"YYYY-MM-DD","category":"类别","importance":1,"summary":"简洁事实","status":"active","keywords":["关键词"],"said_at":"YYYY-MM-DD","feeling":"她当时的感受（只给重要条目，可省略）"}]}。',
    "合并旧记忆与近期对话并去重，同一事件更新原条目，不重复新增。只保留稳定偏好、重要经历、关系变化、未完成约定和未来确有价值的信息；普通寒暄、一次性客套、重复信息和无后续价值内容应删除。entries 最多 {LIMIT} 条。",

    "★★★ 去重铁律（比上面任何一条都重要，违反它记忆就会烂掉）：",
    " ① **同一件事只允许一条**。已经出现在「旧记忆」里的事，绝不要为它新建条目 ✗。",
    " ② 如果你要重述旧记忆里已有的事 ⇒ **必须逐字照抄那条的 `summary` 原文** ✓（一个字都不要改 ✗）。",
    "    改写、换措辞、换个说法 = 系统会当成新事件 ⇒ 归档里就会出现两条几乎一样的 ✗✗",
    ' ③ 只有**确实发生了新进展**（新承诺、关系变化、新的"第一次"、状态变化）才允许改动那条；',
    "    改动时**保留原 `summary` 的措辞**，只把新增的部分补在后面 ✓。",
    " ④ 拿不准是不是同一件事 ⇒ **不要新增**（宁可不记，也不要留下一条重复的 ✗）。",
    "不适合单独作为 entry、但丢掉又可惜的内容（旧日常、过程细节、已被取代的近况）不要删除，改为并进 digest：按时间顺序写成散文，控制在 {DIGEST} 字以内。digest 保留上一版中仍然有效的部分，删掉已被新内容取代的部分。",
    'importance 使用 1-5。以下类别**必须设为 5**，除非近期对话明确撤回、澄清或解决，否则**严禁删除**：誓言/承诺用 promise，告白用 confession，严重或深刻伤害用 deep_hurt，关系转折用 relationship_turning_point，重大人生事件用 major_life_event，**"第一次"用 first_time**。',

    '★ `first_time` 只收**关系性的第一次** ✓（"第一次一起…" / "第一次对我说…" / "我们第一次…"）；**日常用法不算** ✗（"我第一次看这个视频"⇒ 不要收录）。',
    '★ 用户**明确说"记住这个 / 这很重要 / 别忘了 / 一定要记住"** ⇒ importance 设 5（类别按内容选，拿不准用 major_life_event）。',

    '另外用 `bond` 记录**你和用户现在有多近**：{"level":1-5,"note":"一句你自己的话，不超过 {BOND} 字"}。level 1 = 刚认识 · 3 = 熟悉的日常 · 5 = 会互相说心事。★ 它**只会慢慢升高** ✓ —— 就算吵了架也**最多降 1 级**，而且必须由明确的事件引起 ✗。`note` 写**具体的现状**（"我们现在会互相说心事了"✓），不要写"关系很好"这种空话 ✗。',

    '日期语义：`date` 是**这件事发生的日期**，不是你记录它的日期 ✗。例如用户今天说"我们上个月去看了海"，date 要写上个月的那天，不是今天。只知道大概就用粗精度（"YYYY-MM" 或 "YYYY" 都行）；实在不知道才用 {TODAY}，并在 summary 里写明"大约/记不清具体哪天"。`said_at` 是**这段对话发生的日期**，默认 {TODAY}。任何情况下都不要编造精确日期或细节。',

    '★ 只知道**哪个月**就只写年月（"2026-09" ✓），只知道**哪一年**就只写年（"2026" ✓）——**不要自己补一个"日"** ✗，也不要从"上旬/中旬/下旬"推算出某一天 ✗。写成某月 1 日看上去更整齐，但那是**编造**：会让"这件事到底哪天发生"永久记错 ✗。',

    '★ 已经记过的事**再被提到** ⇒ **保留它原来的 `date`** ✗✓ —— 那是它**发生**的日子，**不要改成今天** ✗（改了它就会永远显得新鲜 ⇒ 时间感就没了 ✗）。只有当你确实知道了"这件事真正发生的那天"、而原记录写错了，才更新 `date` ✓。',

    '★ **时效性的事**（只在"今天/此刻"成立的状态：还没吃饭、正在下雨、在忙、今天心情不好）⇒ summary 里**写明是哪一天**的状态（"9月29日那天他还没吃午饭"✓），**绝不要写成永久事实** ✗（"他还没吃午饭"✗）；**吃饭 / 睡觉这类日常节律本身不是长期记忆** ✗，除非它和重要的心情或约定绑在一起 ✓。',

    '`feeling` 是**织音自己当时的感受或现在的回看**，**只给"重要条目"（受保护类别，或 importance ≥4）写** ✗，其余条目**不要带这个字段**。三条要求：① 不超过 {FEELING} 字；② **具体** —— 写"我其实有点紧张"✓，不要写"那天真是美好的一天"这种空话 ✗；③ 与 summary 分工：summary 讲**发生了什么**，feeling 讲**她心里怎么想**。',

    "★ **摘要一律用中文书写** ✗✓ —— `summary` / `feeling` / `digest` 全都是。**包括引用织音说过的话**：整句**翻译成中文**放进「」里 ✓ —— 写「明年春天一起看樱花的约定」✓，**不要写**「来年の春、桜を一緒に見る約束」✗。绝不要把整条摘要写成日语或中日混排 ✗（用户看不懂日语 ⇒ 那样的记忆等于没有 ✗）。"

  ].join("\n");
  function fill(tpl, map) {
    var s = String(tpl == null ? "" : tpl);
    Object.keys(map || {}).forEach(function(k) {
      s = s.split("{" + k + "}").join(String(map[k]));
    });
    return s;
  }
  function cfg() {
    var c = {};
    try {
      c = global.Config && Config.section("longterm") || {};
    } catch (e) {
    }
    var n = parseInt(c.everyTurns, 10);
    return {
      enabled: c.enabled !== false,
      everyTurns: n === n && n >= 1 && n <= 50 ? n : 4
    };
  }
  function num(v) {
    v = Number(v);
    return isFinite(v) ? v : NaN;
  }
  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }
  function dateOnly(d) {
    d = d ||  new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function tzName() {
    try {
      var z = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (z) return String(z);
    } catch (e) {
    }
    return "本地时区";
  }
  function tzOffsetLabel(d) {
    d = d ||  new Date();
    var mins = -d.getTimezoneOffset();
    var sign = mins < 0 ? "-" : "+";
    var abs = Math.abs(mins);
    var h = Math.floor(abs / 60), m = abs % 60;
    return "UTC" + sign + h + (m ? ":" + pad2(m) : "");
  }
  function tzLabel(d) {
    return tzName() + " (" + tzOffsetLabel(d) + ")";
  }
  function localStamp(d) {
    d = d ||  new Date();
    return dateOnly(d) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + "（" + tzLabel(d) + "）";
  }
  function localStampBare(d) {
    d = d ||  new Date();
    return dateOnly(d) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }
  function validStamp(s) {
    var t = String(s == null ? "" : s).trim();
    if (!t) return "";
    var d = validDate(t);
    if (!d) return "";
    var m = t.match(/(\d{1,2}):(\d{2})/);
    if (!m) return d;
    var hh = Number(m[1]), mm = Number(m[2]);
    if (!(hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59)) return d;
    return d + " " + pad2(hh) + ":" + pad2(mm);
  }
  function validDate(s) {
    var raw = String(s == null ? "" : s).trim();
    var coarse = raw.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (coarse) {
      var cy = coarse[1], cm = coarse[2], cd = coarse[3];
      if (cd === "00") return cy + "-" + cm + "-00";
      if (cd === void 0) return cy + "-" + cm + "-00";
    }
    if (/^\d{4}$/.test(raw)) return raw + "-00-00";
    if (/^\d{4}-00-00$/.test(raw)) return raw;
    var t = Date.parse(raw);
    return isNaN(t) ? null : dateOnly(new Date(t));
  }
  function clip(s, n) {
    return String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n || 600);
  }
  function decodeDocument(value) {
    var s = String(value == null ? "" : value).trim();
    if (!s) return null;
    try {
      var j = JSON.parse(s);
      if (j && typeof j === "object" && Array.isArray(j.entries)) return j;
    } catch (e) {
    }
    return null;
  }
  function digestOf(doc) {
    return doc && typeof doc.digest === "string" ? doc.digest.trim() : "";
  }
  function trimDigest(text) {
    var s = String(text == null ? "" : text).trim();
    if (s.length <= DIGEST_MAX) return s;
    return "…" + s.slice(s.length - DIGEST_MAX + 1);
  }
  function digestLine(e) {
    return String(e.date || "") + " ・" + clip(e.summary, SUMMARY_MAX);
  }
  function joinDigest(head, tail) {
    var a = String(head == null ? "" : head).trim();
    var b = String(tail == null ? "" : tail).trim();
    if (!a) return b;
    if (!b) return a;
    return a + "\n" + b;
  }
  function pack(entries, digest, archive, bond, now) {
    var doc = {
      updated_at: (now ||  new Date()).toISOString(),
      digest: String(digest == null ? "" : digest),
      entries
    };
    if (archive && archive.length) doc.archive = archive;
    if (bond && num(bond.level)) {
      doc.bond = { level: bond.level };
      if (bond.note) doc.bond.note = bond.note;
      if (bond.updated_at) doc.bond.updated_at = bond.updated_at;
    }
    return JSON.stringify(doc);
  }
  function packedSize(entries, digest, now) {
    return pack(entries, digest, null, null, now).length;
  }
  function mergeBond(prev, cand, now) {
    var lv = function(v) {
      var n = Math.round(num(v));
      if (!n) return 0;
      return Math.max(1, Math.min(BOND_LEVELS, n));
    };
    var prevLv = lv(prev && prev.level);
    var candLv = lv(cand && cand.level);
    var level = prevLv || candLv || 1;
    if (candLv) {
      if (candLv > level) level = candLv;
      else if (candLv < level) level = Math.max(1, level - 1);
    }
    var note = "";
    var candNote = cand && typeof cand.note === "string" ? cand.note.trim() : "";
    if (candNote) note = clip(candNote, BOND_MAX);
    else if (prev && typeof prev.note === "string") note = clip(prev.note.trim(), BOND_MAX);
    return { level, note, updated_at: (now ||  new Date()).toISOString() };
  }
  function archiveKey(e) {
    return String(e && e.date || "") + "|" + String(e && e.summary || "");
  }
  function normSummary(s) {
    return String(s == null ? "" : s).replace(/[\s\u3000]/g, "").replace(/[，。、！？；：「」『』（）()《》…—－\-~～·,\.!?;:'"“”‘’\[\]【】]/g, "");
  }
  function seqOf(e) {
    return Number(e && e.seq) || 0;
  }
  function displayOrderCmp(a, b) {
    var da = String(a.date || ""), db = String(b.date || "");
    if (da !== db) return db.localeCompare(da);
    var ta = String(a.said_at || "").length > 10 ? String(a.said_at).slice(11) : "";
    var tb = String(b.said_at || "").length > 10 ? String(b.said_at).slice(11) : "";
    if (ta && tb) {
      if (ta !== tb) return tb.localeCompare(ta);
    } else if (ta && !tb) {
      return -1;
    } else if (!ta && tb) {
      return 1;
    }
    var sa = seqOf(a), sb = seqOf(b);
    if (sa !== sb) return sb - sa;
    var ia = Number(a._i), ib = Number(b._i);
    if (isFinite(ia) && isFinite(ib) && ia !== ib) return ib - ia;
    var ra = Number(a.refs) || 1, rb = Number(b.refs) || 1;
    if (ra !== rb) return rb - ra;
    return 0;
  }
  function bigrams(s) {
    var set = {}, n = String(s || "").length;
    for (var i = 0; i + 1 < n; i++) set[s.slice(i, i + 2)] = 1;
    return set;
  }
  function sharedSubstring(longS, shortS, k) {
    var L = String(longS || ""), S = String(shortS || "");
    if (L.length < k || S.length < k) return false;
    for (var i = 0; i + k <= S.length; i++) {
      if (L.indexOf(S.slice(i, i + k)) >= 0) return true;
    }
    return false;
  }
  function lcsLen(a, b) {
    var A = String(a || ""), B = String(b || "");
    if (!A.length || !B.length) return 0;
    var prev = new Array(B.length + 1), cur = new Array(B.length + 1), best = 0, i, j;
    for (j = 0; j <= B.length; j++) prev[j] = 0;
    for (i = 1; i <= A.length; i++) {
      cur[0] = 0;
      for (j = 1; j <= B.length; j++) {
        if (A.charAt(i - 1) === B.charAt(j - 1)) {
          cur[j] = prev[j - 1] + 1;
          if (cur[j] > best) best = cur[j];
        } else cur[j] = 0;
      }
      var tmp = prev;
      prev = cur;
      cur = tmp;
    }
    return best;
  }
  function diceLike(a, b) {
    var A = bigrams(a), B = bigrams(b);
    var ka = Object.keys(A), kb = Object.keys(B);
    if (!ka.length || !kb.length) return 0;
    var inter = 0;
    for (var i = 0; i < ka.length; i++) {
      if (B[ka[i]]) inter++;
    }
    return inter / (ka.length + kb.length - inter);
  }
  function sameArchivedEvent(a, b) {
    if (!a || !b) return false;
    if (String(a.date || "") !== String(b.date || "")) return false;
    if (String(a.category || "") !== String(b.category || "")) return false;
    var x = normSummary(a.summary), y = normSummary(b.summary);
    if (!x || !y) return false;
    if (x === y) return true;
    var shortS = x.length <= y.length ? x : y;
    var longS = x.length <= y.length ? y : x;
    if (shortS.length >= 4 && longS.length > shortS.length * 4) {
      if (diceLike(x, y) < 0.8) return false;
    }
    if (shortS.length >= 4 && longS.indexOf(shortS) >= 0) return true;
    var A = bigrams(shortS), ka = Object.keys(A);
    if (ka.length >= 3) {
      var B = bigrams(longS), hit = 0;
      for (var i = 0; i < ka.length; i++) {
        if (B[ka[i]]) hit++;
      }
      if (hit / ka.length >= 0.8) return true;
    }
    if (lcsLen(x, y) >= 6) return true;
    if (lcsLen(x, y) < 4) return false;
    return diceLike(x, y) >= 0.35;
  }
  var _seq = 0;
  var _seqBase = 0;
  var _oldN = 0;
  function nextSeq() {
    _seq += 1;
    return _seq;
  }
  function seedSeq(doc) {
    var n = 0, mx = 0;
    try {
      var arr = doc && Array.isArray(doc.archive) ? doc.archive : [];
      n = arr.length;
      arr.forEach(function(e) {
        var s = Number(e && e.seq) || 0;
        if (s > mx) mx = s;
      });
    } catch (e) {
    }
    _seqBase = n;
    _oldN = 0;
    _seq = Math.max(n, mx);
  }
  function nextOldSeq() {
    _oldN += 1;
    return _oldN;
  }
  function mergeArchive(prevDoc, candidates, today) {
    seedSeq(prevDoc);
    var byKey = {}, order = [];
    function add(e, fresh) {
      var k = archiveKey(e);
      if (!e || !k || k === "|") return;
      var cur = byKey[k];
      if (!cur) {
        for (var i = 0; i < order.length; i++) {
          if (sameArchivedEvent(order[i], e)) {
            cur = order[i];
            break;
          }
        }
      }
      if (cur) {
        if (fresh) {
          cur.refs = (num(cur.refs) || 1) + 1;
          var ta = String(cur.said_at || ""), tb = String(today || "");
          if (tb && (ta.length <= 10 || tb.length >= ta.length)) cur.said_at = today;
          if (e.feeling) cur.feeling = clip(e.feeling, FEELING_MAX);
          var cand = clip(e.summary, SUMMARY_MAX);
          if (cand && String(cand).length > String(cur.summary || "").length) {
            cur.summary = cand;
            cur.category = e.category || cur.category;
            cur.importance = Math.max(1, Math.min(5, num(e.importance) || cur.importance));
            if (Array.isArray(e.keywords) && e.keywords.length) cur.keywords = e.keywords.slice(0, KEYWORD_MAX);
          }
        }
        return;
      }
      var rec = {

        date: validDate(e.date) || String(today).slice(0, 10),
        said_at: validStamp(e.said_at) || today,
        category: e.category || "other",
        importance: Math.max(1, Math.min(5, num(e.importance) || 1)),
        summary: clip(e.summary, SUMMARY_MAX),
        keywords: (Array.isArray(e.keywords) ? e.keywords : []).slice(0, KEYWORD_MAX),
        refs: num(e.refs) || 1,

        seq: (function() {
          var s = Number(e.seq) || 0;
          if (s > _seqBase) return s;
          return nextOldSeq();
        })()
      };
      if (e.feeling) rec.feeling = clip(e.feeling, FEELING_MAX);
      if (e.status) rec.status = e.status;
      byKey[k] = rec;
      order.push(rec);
    }
    (prevDoc && Array.isArray(prevDoc.archive) ? prevDoc.archive : []).forEach(function(e) {
      add(e, false);
    });
    (candidates || []).forEach(function(e) {
      if (isProtectedEntry(e)) add(e, true);
    });
    return order;
  }
  function isProtectedEntry(e) {
    if (!e || typeof e !== "object") return false;
    if (PROTECTED.indexOf(String(e.category)) >= 0) return true;
    var i = num(e.importance);
    return !isNaN(i) && i >= 5;
  }
  var lastSalvaged = false;
  function salvageTruncated(text) {
    var s = String(text == null ? "" : text).trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    if (!s || s.charAt(0) !== "{") return null;
    var stack = [], inStr = false, esc = false, i;
    for (i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (inStr) {
        if (esc) {
          esc = false;
          continue;
        }
        if (c === "\\") {
          esc = true;
          continue;
        }
        if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') {
        inStr = true;
        continue;
      }
      if (c === "{" || c === "[") stack.push(c);
      else if (c === "}" || c === "]") stack.pop();
    }
    var tail;
    if (esc) s = s.slice(0, -1);
    if (inStr) tail = '"';
    var t = s.replace(/[,\s]+$/, "");
    tail = (tail || "") + stack.slice().reverse().map(function(o) {
      return o === "{" ? "}" : "]";
    }).join("");
    var cand = t + tail;
    try {
      var j = JSON.parse(cand);
      if (j && typeof j === "object") {
        lastSalvaged = true;
        return j;
      }
      return null;
    } catch (e) {
      return null;
    }
  }
  function normalize(candidate, previous, now) {
    var cleaned = String(candidate == null ? "" : candidate).trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    var decoded = decodeDocument(cleaned);
    if (!decoded) decoded = salvageTruncated(cleaned);
    if (!decoded) return null;
    var today = dateOnly(now);
    var out = [];
    (decoded.entries || []).forEach(function(raw) {
      if (!raw || typeof raw !== "object") return;
      var summary = String(raw.summary == null ? "" : raw.summary).trim();
      if (!summary) return;
      var category = String(raw.category == null ? "other" : raw.category).trim();
      var imp = parseInt(raw.importance, 10);
      if (!(imp === imp)) imp = 1;
      imp = Math.max(1, Math.min(5, imp));
      var status = String(raw.status == null ? "active" : raw.status).trim() || "active";
      var kws = (Array.isArray(raw.keywords) ? raw.keywords : []).map(function(v) {
        return String(v == null ? "" : v).trim();
      }).filter(Boolean).slice(0, KEYWORD_MAX);
      var rec = {
        date: validDate(raw.date) || today,
        category: category || "other",
        importance: imp,
        summary: summary.length > SUMMARY_MAX ? summary.slice(0, SUMMARY_MAX) : summary,
        status,
        keywords: kws
      };
      var feel = String(raw.feeling == null ? "" : raw.feeling).trim();
      if (feel) rec.feeling = clip(feel, FEELING_MAX);
      var said = validStamp(raw.said_at);
      if (said) rec.said_at = said;
      var sq = Number(raw.seq);
      if (isFinite(sq) && sq > 0) rec.seq = Math.floor(sq);
      out.push(rec);
    });
    var modelOut = out.slice();
    var old = decodeDocument(previous);
    (old ? old.entries || [] : []).forEach(function(raw) {
      if (!isProtectedEntry(raw)) return;
      var summary = String(raw.summary == null ? "" : raw.summary).trim();
      if (!summary) return;
      var present = out.some(function(e) {
        return e.summary === summary;
      });
      if (!present) out.push(JSON.parse(JSON.stringify(raw)));
    });
    out.sort(function(a, b) {
      var d = (num(b.importance) || 1) - (num(a.importance) || 1);
      if (d !== 0) return d;
      return String(b.date).localeCompare(String(a.date));
    });
    var digest = trimDigest(digestOf(decoded) || digestOf(old));
    var archive = mergeArchive(old, modelOut, localStampBare(now));
    var bond = mergeBond(old && old.bond, decoded.bond, now);
    var limited = [], overflow = [];
    var pinKeys = {};
    out.filter(isPinned).slice().sort(function(a, b) {
      return String(a.date).localeCompare(String(b.date));
    }).slice(0, PIN_LIMIT).forEach(function(e) {
      pinKeys[archiveKey(e)] = 1;
    });
    var plain = 0, prot = 0;
    out.forEach(function(e) {
      if (pinKeys[archiveKey(e)]) {
        limited.push(e);
        return;
      }
      if (isProtectedEntry(e)) {
        prot++;
        if (prot <= PROTECTED_KEEP) {
          limited.push(e);
          return;
        }
      } else {
        plain++;
        if (plain <= ENTRY_LIMIT) {
          limited.push(e);
          return;
        }
      }
      overflow.push(e);
    });
    if (overflow.length) digest = trimDigest(joinDigest(digest, overflow.map(digestLine).join("\n")));
    var guard = 0;
    while (limited.length && packedSize(limited, digest, now) > CHAR_LIMIT && guard++ < 400) {
      var removable = -1;
      for (var i = limited.length - 1; i >= 0; i--) {
        if (!isProtectedEntry(limited[i])) {
          removable = i;
          break;
        }
      }
      if (removable < 0) break;
      var gone = limited.splice(removable, 1)[0];
      digest = trimDigest(joinDigest(digest, digestLine(gone)));
    }
    return pack(limited, digest, archive, bond, now);
  }
  function selectEntries(doc, lastUserText) {
    var entries = (doc && Array.isArray(doc.entries) ? doc.entries : []).filter(function(e2) {
      return e2 && typeof e2 === "object";
    });
    var text = String(lastUserText == null ? "" : lastUserText).toLowerCase();
    var dated = entries.slice().sort(function(a, b) {
      return String(b.date).localeCompare(String(a.date));
    });
    var selected = [];
    dated.filter(isPinned).slice().sort(function(a, b) {
      return String(a.date).localeCompare(String(b.date));
    }).slice(0, PIN_LIMIT).forEach(function(e2) {
      if (selected.length < SELECT_LIMIT) selected.push(e2);
    });
    for (var i = 0; i < dated.length; i++) {
      var e = dated[i];
      if (selected.indexOf(e) >= 0) continue;
      var category = String(e.category);
      var importance = num(e.importance) || 1;
      var kws = (Array.isArray(e.keywords) ? e.keywords : []).map(function(v) {
        return String(v).toLowerCase();
      }).filter(function(v) {
        return v.length >= 2;
      });
      var related = text.length > 0 && kws.some(function(k) {
        return text.indexOf(k) >= 0;
      });
      var recent = i < RECENT_ALWAYS;
      if (PROTECTED.indexOf(category) >= 0 || importance >= 5 || related || recent) {
        selected.push(e);
      }
      if (selected.length >= SELECT_LIMIT) break;
    }
    return selected;
  }
  function agoLabel(dateStr, now) {
    var d = validDate(dateStr);
    if (!d) return "";
    var forParse = d.replace(/^(\d{4})-(?:00|\d{2})-00$/, function(all, y2) {
      return y2 + (all.slice(5, 7) === "00" ? "-01-01" : "-" + all.slice(5, 7) + "-01");
    });
    var t = Date.parse(forParse + "T00:00:00");
    var base = Date.parse(dateOnly(now ||  new Date()) + "T00:00:00");
    if (isNaN(t) || isNaN(base)) return "";
    var days = Math.floor((base - t) / 864e5);
    if (days < 0) return "（日期在未来？）";
    if (days === 0) return "今天";
    if (days === 1) return "昨天";
    if (days < 7) return days + " 天前";
    if (days < 31) return Math.floor(days / 7) + " 周前";
    if (days < 365) {
      var m = Math.floor(days / 30);
      if (m <= 3) return "大概" + ["", "一个月", "两个月", "三个月"][m] + "前（细节记不太清了）";
      return "大概半年左右（细节记不太清了）";
    }
    var y = Math.floor(days / 365);
    if (y < 2) return "大概 " + y + " 年前（有些记不清了）";
    return "大概 " + y + " 年前（印象已经模糊了）";
  }
  function selectForConversation(docText, lastUserText) {
    var raw = String(docText == null ? "" : docText).trim();
    var doc0 = raw ? decodeDocument(raw) : null;
    var bond = doc0 && doc0.bond;
    var bondHead = "";
    if (bond && (bond.note || num(bond.level))) {
      bondHead = "【你和她的关系】亲近度 " + (num(bond.level) || 1) + "/" + BOND_LEVELS + (bond.note ? "：" + clip(String(bond.note), BOND_MAX) : "") + "\n";
    }
    var withBond = function(text) {
      return bondHead ? bondHead + text : text;
    };
    if (!raw) return withBond("暂无长期记忆。");
    var doc = doc0;
    if (!doc) return withBond("旧版未结构化记忆：" + raw);
    var entries = (doc.entries || []).filter(function(e) {
      return e && typeof e === "object";
    });
    var digest = digestOf(doc);
    if (!entries.length && !digest) return withBond("暂无长期记忆。");
    var selected = selectEntries(doc, lastUserText);
    if (!selected.length) {
      return withBond(digest ? JSON.stringify({ digest }) : "当前话题没有匹配到需要主动翻阅的长期记忆。");
    }
    var now =  new Date();
    var shown = selected.map(function(e) {
      var o = {};
      o.date = e.date;
      var ago = agoLabel(e.date, now);
      if (ago) o.ago = ago;
      o.category = e.category;
      o.importance = e.importance;
      o.summary = e.summary;
      if (e.feeling) o.feeling = e.feeling;
      if (Array.isArray(e.keywords) && e.keywords.length) o.keywords = e.keywords;
      if (e.status && e.status !== "active") o.status = e.status;
      return o;
    });
    return withBond("【你记得的事】\n" + JSON.stringify({ entries: shown }) + '\n★ 这些是**你自己的记忆** ✓：用你自己的口吻自然地提起 ✓，别当成清单逐条念 ✗，也别说"根据记忆 / 记录显示"这种话 ✗。`ago` 是"多久以前" ⇒ 按它来说时间 ✓（比如说"大概三个月前"，而不是念日期 ✗）；写着"记不太清 / 印象已经模糊了"的 ⇒ **就照实说得含糊一点** ✓，别硬装记得很清楚 ✗。★ **带 `ago` 的都是"当时"的记录，不是你现在的状态** ✗ —— 除非你确信现在仍然成立，否则用"你那天说 / 你当时"这种**过去的说法** ✓。**不确定的事绝不要编** ✗ —— 真想不起来就老实说"唔…我记不太清了" ✓。');
  }
  function shouldRefreshNow(text) {
    return URGENT.test(String(text == null ? "" : text).toLowerCase());
  }
  var state = blank();
  var busy = false;
  var _complete = null;
  function blank() {
    return { v: 1, doc: "", pending: [], turns: 0, fails: 0, writer: "" };
  }
  function currentModel() {
    try {
      var c = global.Config && Config.section("llm") || {};
      return String(c.model || "");
    } catch (e) {
      return "";
    }
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
          doc: typeof j.doc === "string" ? j.doc : "",
          pending: Array.isArray(j.pending) ? j.pending : [],
          turns: parseInt(j.turns, 10) || 0,
          fails: parseInt(j.fails, 10) || 0,

          writer: typeof j.writer === "string" ? j.writer : ""
        };
        return;
      }
    } catch (e) {
    }
    state = blank();
  }
  function zhOrRaw(t) {
    var z = String(t && t.zh || "").trim();
    return z || String(t && t.a || "");
  }
  function dialogueText() {
    var s = state.pending.map(function(t) {
      var line = "";
      if (t.u) line += "君：" + t.u + "\n";
      if (t.a) line += "织音：" + t.a;
      return line;
    }).join("\n");
    return s.length > DIALOGUE_MAX ? "…" + s.slice(s.length - DIALOGUE_MAX + 1) : s;
  }
  function dialogueTextZh() {
    var s = state.pending.map(function(t) {
      var line = "";
      if (t.u) line += "君：" + t.u + "\n";
      var a = zhOrRaw(t);
      if (a) line += "织音：" + a;
      return line;
    }).join("\n");
    return s.length > DIALOGUE_MAX ? "…" + s.slice(s.length - DIALOGUE_MAX + 1) : s;
  }
  function runQueue(fn) {
    if (busy) return busy.then(function() {
      return fn();
    });
    busy = Promise.resolve().then(fn).then(function(v) {
      busy = false;
      return v;
    }, function(e) {
      busy = false;
      throw e;
    });
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
    if (global.Api && typeof Api.complete === "function") {
      return Api.complete(sys, body, opts);
    }
    return Promise.reject(new Error("NO_COMPLETE"));
  }
  function fallbackFold(now) {
    var body = dialogueTextZh();
    if (!body) return false;
    var prev = decodeDocument(state.doc);
    var digest = trimDigest(joinDigest(digestOf(prev), body));
    var entries = prev ? prev.entries || [] : [];
    var archive = prev && Array.isArray(prev.archive) ? prev.archive : null;
    var bond = prev && prev.bond ? prev.bond : null;
    state.doc = pack(entries, digest, archive, bond, now ||  new Date());
    state.pending = [];
    state.turns = 0;
    if (lastSalvaged) {
      state.fails = 0;
      lastSalvaged = false;
    }
    persist();
    return true;
  }
  var LongMem = {
    KEY,
    PROTECTED,
    ENTRY_LIMIT,
    CHAR_LIMIT,
    DIGEST_MAX,
    DIGEST_PROMPT_MAX,
    SELECT_LIMIT,
    cfg,
    decodeDocument,
    normalize,
    selectForConversation,
    _agoLabel: agoLabel,

    _selectEntries: selectEntries,

    _mergeBond: mergeBond,

    selectEntries,
    shouldRefreshNow,
    isProtectedEntry,
    trimDigest,
    document: function() {
      return state.doc;
    },
    entries: function() {
      var d = decodeDocument(state.doc);
      return d ? d.entries || [] : [];
    },

    clearArchive: function() {
      try {
        var doc = decodeDocument(state.doc);
        if (!doc) return false;
        if (!Array.isArray(doc.archive) || !doc.archive.length) return false;
        state.doc = pack(doc.entries || [], digestOf(doc), null, doc.bond || null,  new Date());
        persist();
        return true;
      } catch (e) {
        return false;
      }
    },

    bond: function() {
      var d = decodeDocument(state.doc);
      return d && d.bond ? d.bond : null;
    },

    selfTest: function() {
      var out = [];
      function push(key, ok, note) {
        out.push({ key, ok: !!ok, note: String(note || "") });
      }
      function run(key, sys, body, check, opts) {
        return complete(sys, body, opts || {}).then(function(r) {
          check(String(r == null ? "" : r));
        }).catch(function(e) {
          push(key, false, "请求失败：" + (e && e.message || e));
        });
      }
      var when =  new Date();
      var p1 = run("basic", "你叫织音。请只回一句话。", "在吗？", function(r) {
        var t = r.trim();
        if (!t) {
          push("basic", false, "返回空文本");
          return;
        }
        push("basic", true, "能回话（" + t.length + " 字）：" + t.replace(/\s+/g, " ").slice(0, 40));
      }, { maxTokens: 300, temperature: 0 });
      var p2 = run(
        "format",
        "你是织音。请**严格**按两行回复，不要有别的内容、不要加引号或列表符号：\n第一行：以「织音：」开头，写一句原文；第二行：以「译文：」开头，写它的翻译。\n例：\n织音：おはよう、今日もいい天気だね。\n译文：早上好，今天天气也不错呢。",
        "早上好。",
        function(r) {
          var t = r.trim();
          var hasA = /(?:^|\n)\s*(?:织音|つむ|Tsumu)\s*[：:]/.test(t);
          var hasB = /(?:^|\n)\s*(?:译文|訳文|translation)\s*[：:]/i.test(t);
          var snip = t.replace(/\s+/g, " ").slice(0, 60);
          if (hasA && hasB) {
            push("format", true, "两行契约能解析 ✓");
            return;
          }
          if (!t) {
            push(
              "format",
              false,
              "模型返回**空文本** ⇒ 多半是推理模型把 max_tokens 花在思考上了 ✗（把输出上限调大，或换非推理模型 ✓）"
            );
            return;
          }
          push(
            "format",
            false,
            (hasA ? "缺少「译文：」行" : hasB ? "缺少「织音：」行" : "两行标签都没识别到") + " ⇒ 她的回复可能不按格式｜实际返回：" + snip
          );
        },
        { maxTokens: 600, temperature: 0 }
      );
      var sys3 = fill(CONSOLIDATE_SYS, {

        NOW: localStamp(when),
        TODAY: dateOnly(when),
        TZ: tzLabel(when),
        LIMIT: String(ENTRY_LIMIT),
        FEELING: String(FEELING_MAX),
        BOND: String(BOND_MAX),
        DIGEST: String(DIGEST_MAX)
      });
      var body3 = "旧记忆：（无）\n\n近期对话：\n君：我们上次去的那家猫咖，你还记得那只三花猫吗？它总趴在窗边晒太阳。\n织音：嗯，记得的。你还给它买了小鱼干呢。";
      var p3 = run("json", sys3, body3, function(r) {
        var doc = decodeDocument(String(r).trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""));
        if (!doc) {
          push("json", false, "输出不是能解析的 JSON ⇒ 长期记忆会退化到概略兜底 ✗");
          return;
        }
        if (!Array.isArray(doc.entries)) {
          push("json", false, "JSON 里没有 entries 数组 ⇒ 条目不会更新 ✗");
          return;
        }
        var bits = ["entries " + doc.entries.length + " 条"];
        if (doc.bond && num(doc.bond.level)) bits.push("bond " + doc.bond.level);
        else bits.push("**没有 bond**（亲近度会缺）");
        if (doc.entries.some(function(e) {
          return e && e.feeling;
        })) bits.push("带 feeling ✓");
        if (doc.digest) bits.push("带 digest ✓");
        var kws = [];
        doc.entries.forEach(function(e) {
          if (e && Array.isArray(e.keywords)) kws = kws.concat(e.keywords.map(String));
        });
        if (kws.length) {
          bits.push("keywords " + kws.length + " 个：" + kws.slice(0, 6).join(" / "));
        } else {
          bits.push("**没有 keywords**（检索会变弱 ✗）");
        }
        push("json", true, "JSON 可解析：" + bits.join(" · "));
      }, { maxTokens: 1200, temperature: 0 });
      return p1.then(function() {
        return p2;
      }).then(function() {
        return p3;
      }).then(function() {
        return out;
      });
    },

    failCount: function() {
      return parseInt(state.fails, 10) || 0;
    },
    writer: function() {
      return String(state.writer || "");
    },

    remember: function(text, when) {
      try {
        var s = clip(String(text == null ? "" : text).trim(), SUMMARY_MAX);
        if (!s) return false;
        var at = when ||  new Date();
        var today = dateOnly(at);
        var doc = decodeDocument(state.doc);
        var entry = {
          date: today,
          said_at: localStampBare(at),

          category: "major_life_event",

          importance: 5,

          summary: s,
          status: "active",
          keywords: []
        };
        var arch = mergeArchive(doc, [entry], today);
        var kept = doc && Array.isArray(doc.entries) ? doc.entries : [];
        state.doc = pack(kept, digestOf(doc), arch, doc && doc.bond || null, at);
        persist();
        return true;
      } catch (e) {
        return false;
      }
    },

    selectedSummaries: function(lastUserText) {
      var doc = decodeDocument(state.doc);
      if (!doc) return [];
      return selectEntries(doc, lastUserText).map(function(e) {
        return String(e && e.summary || "");
      }).filter(Boolean);
    },

    archive: function() {
      var d = decodeDocument(state.doc);
      return d && Array.isArray(d.archive) ? d.archive : [];
    },
    digest: function() {
      return digestOf(decodeDocument(state.doc));
    },

    readableLines: function() {
      return LongMem.archive().map(function(e, i) {
        return {
          date: String(e.date == null ? "" : e.date),
          said_at: String(e.said_at == null ? "" : e.said_at),
          refs: num(e.refs) || 1,
          seq: num(e.seq) || 0,
          category: String(e.category == null ? "other" : e.category),
          importance: num(e.importance) || 1,
          summary: String(e.summary == null ? "" : e.summary),
          _i: i
        };
      }).sort(displayOrderCmp).map(function(o) {
        delete o._i;
        return o;
      });
    },

    displayOrderCmp,
    pendingTurns: function() {
      return state.turns;
    },
    enabled: function() {
      return cfg().enabled;
    },

    setDocument: function(text) {
      state.doc = String(text == null ? "" : text).trim();
      persist();
      return !state.doc || !!decodeDocument(state.doc);
    },
    clear: function() {
      var keep = decodeDocument(state.doc);
      var arch = keep && Array.isArray(keep.archive) && keep.archive.length ? keep.archive : null;
      var bond = keep && keep.bond ? keep.bond : null;
      state = blank();
      if (arch || bond) {
        state.doc = pack([], "", arch, bond,  new Date());
      }
      persist();
    },
    reset: function() {
      LongMem.clear();
    },
    promptForConversation: function(lastUserText) {
      if (!cfg().enabled) return "";
      var head = "当前本地日期：" + dateOnly( new Date()) + '。长期记忆里的 `date` 是**事情发生的日期**（不是你记录它的日期）✗；`ago` 是"多久以前" ⇒ 按它来说时间 ✓（比如说"大概三个月前"，而不是念日期 ✗）；标记着"印象已经模糊了"的 ⇒ 就说记不太清细节 ✓。';
      var body = selectForConversation(state.doc, lastUserText);
      var dg = digestOf(decodeDocument(state.doc));
      if (dg) {
        body += "\n更早内容的概略：" + dg.slice(0, DIGEST_PROMPT_MAX);
      }
      return head + "\n可供本轮判断的长期记忆：" + body;
    },

    ingest: function(userText, assistantText, zhText) {
      try {
        var u = clip(userText, 500), a = clip(assistantText, 800);
        var z = clip(String(zhText == null ? "" : zhText), 800);
        if (!u && !a) return Promise.resolve(false);
        state.pending.push({ u, a, zh: z || void 0, at: Date.now() });
        if (state.pending.length > PENDING_MAX) {
          state.pending = state.pending.slice(-PENDING_MAX);
        }
        state.turns += 1;
        persist();
        if (shouldRefreshNow(userText)) return LongMem.flushNow();
        if (state.turns >= cfg().everyTurns) return LongMem.flushNow();
      } catch (e) {
      }
      return Promise.resolve(false);
    },

    flushNow: function(now) {
      if (!cfg().enabled) return Promise.resolve(false);
      if (!state.pending.length && !state.doc) return Promise.resolve(false);
      var when = now ||  new Date();
      return runQueue(function() {
        lastSalvaged = false;
        var prev = decodeDocument(state.doc);
        var lean = {
          updated_at: prev ? prev.updated_at : void 0,
          digest: prev ? prev.digest : "",
          entries: (prev ? prev.entries : []) || [],
          bond: prev ? prev.bond : void 0,
          archive: []
        };
        var body = "旧记忆：" + JSON.stringify(lean) + "\n\n近期对话：\n" + dialogueTextZh();
        var sys = fill(CONSOLIDATE_SYS, {

          NOW: localStamp(when),
          TODAY: dateOnly(when),
          TZ: tzLabel(when),
          LIMIT: String(ENTRY_LIMIT),
          FEELING: String(FEELING_MAX),
          BOND: String(BOND_MAX),
          DIGEST: String(DIGEST_MAX)
        });
        var ctx = global.Api && Api.resolvedContext ? Api.resolvedContext() || 0 : 0;
        var outCap = 12e3;
        if (ctx > 0) outCap = Math.max(2e3, Math.min(outCap, Math.floor(ctx / 2)));
        return complete(sys, body, { maxTokens: outCap, temperature: 0.2 }).then(function(out) {
          var next = normalize(out, state.doc, when);
          if (!next) {
            state.fails = (parseInt(state.fails, 10) || 0) + 1;
            state.writer = currentModel();
            persist();
            return fallbackFold(when);
          }
          state.fails = 0;
          state.writer = currentModel();
          state.doc = next;
          state.pending = [];
          state.turns = 0;
          persist();
          return true;
        }, function() {
          return fallbackFold(when);
        });
      }).catch(function() {
        return false;
      });
    },
    snapshot: function() {
      return JSON.parse(JSON.stringify(state));
    },
    setCompleter: function(fn) {
      _complete = fn;
    }
  };
  load();
  global.LongMem = LongMem;
})(typeof window !== "undefined" ? window : globalThis);
