(function(global) {
  "use strict";
  var TIMEOUT = 25e3;
  var TIMEOUT_SLOW = 4e4;
  var MAX_ITEMS = 6;
  var MAX_OUT = 1400;
  var _cache = {};
  var TTL = 5 * 60 * 1e3;
  var PROVIDERS = {
    tavily: {
      label: "Tavily（国外，有免费额度）",
      build: function(q, key) {
        return {
          url: "https://api.tavily.com/search",
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: { api_key: key, query: q, max_results: MAX_ITEMS, search_depth: "basic" }
        };
      }
    },
    bocha: {
      label: "博查（国内，有免费试用）",
      build: function(q, key) {
        return {
          url: "https://api.bochaai.com/v1/web-search",
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
          body: { query: q, count: MAX_ITEMS, summary: true }
        };
      }
    },
    brave: {
      label: "Brave Search（国外，有免费额度）",
      build: function(q, key) {
        return {
          url: "https://api.search.brave.com/res/v1/web/search?q=" + encodeURIComponent(q) + "&count=" + MAX_ITEMS,
          method: "GET",
          headers: { "X-Subscription-Token": key, Accept: "application/json" }
        };
      }
    },
    serper: {
      label: "Serper（Google 结果）",
      build: function(q, key) {
        return {
          url: "https://google.serper.dev/search",
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-KEY": key },
          body: { q, num: MAX_ITEMS }
        };
      }
    },
    qianfan: {
      label: "百度千帆 · 智能搜索生成（国内）",

      build: function(q, key, model, ep) {
        var isWs = ep === "web_search";
        var path = isWs ? "/v2/ai_search/web_search" : "/v2/ai_search/chat/completions";
        var body = isWs ? {
          query: q,
          count: MAX_ITEMS,
          messages: [{ role: "user", content: q }],
          search_source: "baidu_search_v2",
          resource_type_filter: [{ type: "web", top_k: MAX_ITEMS }]
        } : {
          model: model || QF_MODELS[0],
          messages: [{ role: "user", content: q }],
          search_source: "baidu_search_v2",
          resource_type_filter: [{ type: "web", top_k: MAX_ITEMS }]
        };
        return {
          url: "https://qianfan.baidubce.com" + path,
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
          body
        };
      }
    },

    deepseek: {
      label: "DeepSeek 搜索",
      build: function(q, key) {
        return {
          url: "https://api.deepseek.com/v1/tools/search",
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
          body: { query: q, count: 4, need_content: false }
        };
      }
    }
  };
  var ASK = /(https?:\/\/|查询|搜索一下|搜索下|搜一下|搜下|搜搜|搜我的|搜索我的|查一下|查查|查不到|查得到|帮我查|帮我搜|查资料|上网查|网上查|联网查|能查到|能搜到|搜不到|搜得到|你去搜|新闻|最新消息|検索して|調べて|ネットで調べ|search\s+for|look\s+up|google\s+it|web\s+search)/i;
  var QF_MODELS = [
    "ernie-4.5-turbo-32k",
    "ernie-4.5-8k-preview",
    "ernie-4.0-turbo-8k",
    "ernie-3.5-8k",
    "deepseek-v3",
    "deepseek-r1"
  ];
  var _qfModel = "";
  var QF_EPS = ["web_search", "chat/completions"];
  var _qfEp = "";
  function bodyError(j) {
    if (!j || typeof j !== "object") return "";
    if (j.error) {
      if (typeof j.error === "string") return j.error;
      if (j.error.message) return String(j.error.message);
    }
    var c = j.code;
    if (c !== void 0 && c !== null && c !== 0 && c !== "0" && c !== 200 && c !== "200" && c !== "success" && c !== "ok") {
      var msg = String(j.message || "");
      return String(c) && msg ? String(c) + "：" + msg : String(msg || c);
    }
    return "";
  }
  var TRIM = /(帮我|请|麻烦|能不能|可以|你|一下|下|吧|呢|吗|谢谢|please|could you|can you)/gi;
  var VOCATIVE = /^(?:\s*(?:织音|tsumu)\s*[，,、:：!！.。~～]?\s*)+/gi;
  function stripAddressee(s) {
    return String(s == null ? "" : s).replace(/\btsumu\b/gi, " ").replace(/织音/g, " ");
  }
  var PLATFORMS = [
    [/京东|jd\.com/gi, "site:jd.com"],
    [/淘宝|taobao/gi, "site:taobao.com"],
    [/天猫|tmall/gi, "site:tmall.com"],
    [/拼多多|pinduoduo/gi, "site:pinduoduo.com"],
    [/亚马逊|amazon/gi, "site:amazon.cn"],
    [/知乎|zhihu/gi, "site:zhihu.com"],
    [/哔哩哔哩|bilibili|b站/gi, "site:bilibili.com"],
    [/微博|weibo/gi, "site:weibo.com"],
    [/小红书|xiaohongshu/gi, "site:xiaohongshu.com"],
    [/github/gi, "site:github.com"],
    [/网易云音乐|网易云|music\.163/gi, "site:music.163.com"],
    [/贴吧|tieba/gi, "site:tieba.baidu.com"],
    [/掘金|juejin/gi, "site:juejin.cn"],
    [/npm/gi, "site:npmjs.com"],
    [/pypi/gi, "site:pypi.org"],

    [/steam|蒸汽平台/gi, "site:store.steampowered.com"],
    [/epicgames|epic\s+games|epic游戏/gi, "site:epicgames.com"],
    [/豆瓣|douban/gi, "site:douban.com"],
    [/taptap/gi, "site:taptap.cn"]
  ];
  var STOP_TOK = /^(?:去|查|搜|再|还|在|找|看看|看|给|帮我|请|一下|吧|呢|吗|啊|呀|的|了|是|有|个|上|里|把|就|都|再查|再搜|帮我查|帮我搜)$/;
  var URL_RE = /https?:\/\/[^\s<>"'`）)】\]，。；;,]+/gi;
  function fromUrls(raw) {
    var sites = [], words = [], seenSite = {}, seenWord = {};
    var m = String(raw == null ? "" : raw).match(URL_RE) || [];
    for (var i = 0; i < m.length && i < 3; i++) {
      var u = null;
      try {
        u = new URL(m[i]);
      } catch (e) {
        continue;
      }
      var host = String(u.hostname || "").toLowerCase().replace(/^www\./, "");
      if (host && !seenSite[host]) {
        seenSite[host] = 1;
        sites.push("site:" + host);
      }
      var segs = String(u.pathname || "").split("/");
      for (var j = 0; j < segs.length && words.length < 6; j++) {
        var s = "";
        try {
          s = decodeURIComponent(segs[j]);
        } catch (e) {
          s = segs[j];
        }
        s = String(s).replace(/[^\w\u4e00-\u9fa5.\-]/g, "");
        if (s.length < 2) continue;
        if (seenWord[s.toLowerCase()]) continue;
        seenWord[s.toLowerCase()] = 1;
        words.push(s);
      }
    }
    return { sites, words };
  }
  function buildQuery(text, prev) {
    var raw = String(text == null ? "" : text);
    var urls = fromUrls(raw);
    var plain = stripAddressee(raw.replace(URL_RE, " "));
    var cur = clean(plain.replace(VOCATIVE, " ").replace(TRIM, " "), 160);
    var needCtx = /(再查|再搜|还查|还有|那个|这个|它|继续|接着|再试|换个|另外|别家|我的)/.test(plain);
    var base = cur;
    if (prev && (needCtx || cur.length < 10)) {
      var p = clean(stripAddressee(String(prev).replace(URL_RE, " ")).replace(VOCATIVE, " ").replace(TRIM, " "), 80);
      if (p) base = p + " " + cur;
    }
    base = base.replace(/多少钱|多少米|几块钱?|什么价(?:格)?|贵不贵/g, "价格");
    base = base.replace(/能查到|能搜到|查得到|搜得到|能不能查到|能不能搜到/g, " ");
    var sites = [], seen = {};
    for (var k = 0; k < urls.sites.length; k++) {
      seen[urls.sites[k]] = 1;
      sites.push(urls.sites[k]);
    }
    for (var i = 0; i < PLATFORMS.length; i++) {
      var re = PLATFORMS[i][0], s = PLATFORMS[i][1];
      re.lastIndex = 0;
      if (re.test(base)) {
        if (!seen[s]) {
          seen[s] = 1;
          sites.push(s);
        }
        re.lastIndex = 0;
        base = base.replace(re, " ");
      }
    }
    base = base.replace(/[，,、。.！!？?：:；;（）()【】\[\]「」"'"'~～…—\-]+/g, " ");
    var toks = clean(base, 200).split(" ");
    var out = [], seenTok = {};
    for (var j = 0; j < toks.length; j++) {
      var t = toks[j];
      if (!t) continue;
      var low = t.toLowerCase();
      if (STOP_TOK.test(low)) continue;
      if (seenTok[low]) continue;
      seenTok[low] = 1;
      out.push(t);
    }
    var body = out.join(" ").trim();
    if (urls.words.length) body = (urls.words.join(" ") + " " + body).trim();
    if (!body && !sites.length) return "";
    return clean((sites.join(" ") + " " + body).trim(), 160);
  }
  function cfg() {
    try {
      return global.Config && Config.section("web") || {};
    } catch (e) {
      return {};
    }
  }
  function now() {
    return Date.now();
  }
  function proxy(url) {
    try {
      return global.Api && Api.proxyUrl ? Api.proxyUrl(url) : url;
    } catch (e) {
      return url;
    }
  }
  function clean(v, n) {
    var s = String(v == null ? "" : v).replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }
  function keyFor(pid) {
    var c = cfg();
    var k = String(c.searchKey || "").trim();
    if (k) return k;
    if (pid !== "deepseek") return "";
    try {
      var l = global.Config && global.Config.section("llm") || {};
      return String(l.apiKey || "").trim();
    } catch (e) {
      return "";
    }
  }
  function harvest(node, out, depth) {
    if (!node || depth > 7 || out.length >= MAX_ITEMS) return out;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length && out.length < MAX_ITEMS; i++) harvest(node[i], out, depth + 1);
      return out;
    }
    if (typeof node !== "object") return out;
    var url = node.url || node.link || node.href;
    var title = node.title || node.name || node.headline;
    var snip = node.snippet || node.description || node.content || node.summary || node.text;
    if (typeof url === "string" && /^https?:\/\//i.test(url) && (title || snip)) {
      out.push({ url: clean(url, 300), title: clean(title, 120), snip: clean(snip, 400) });
    }
    for (var k in node) {
      if (Object.prototype.hasOwnProperty.call(node, k)) harvest(node[k], out, depth + 1);
    }
    return out;
  }
  function fmt(items, note) {
    if (!items.length) return "";
    var L = ["【网页检索结果】" + (note ? "（关键词：" + note + "）" : "")];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      L.push(i + 1 + ". " + (it.title || "(无标题)"));
      if (it.url) L.push("   " + it.url);
      if (it.snip) L.push("   " + it.snip);
    }
    var s = L.join("\n");
    if (s.length > MAX_OUT) s = s.slice(0, MAX_OUT - 1) + "…";
    return s;
  }
  function deepen(items, json, cap) {
    if (!items || !items.length) return items;
    var arr = json && json.results || [];
    var map = {};
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      if (it && typeof it.url === "string" && typeof it.summary === "string" && it.summary) {
        map[it.url] = it.summary;
      }
    }
    for (var j = 0; j < items.length; j++) {
      if (map[items[j].url]) items[j].snip = clean(map[items[j].url], cap || 300);
    }
    return items;
  }
  function run(req, ms) {
    var body = null, headers = req.headers || {};
    if (req.body != null) body = JSON.stringify(req.body);
    var ctl = null;
    try {
      ctl = new AbortController();
    } catch (e) {
    }
    var timer = setTimeout(function() {
      try {
        if (ctl) ctl.abort();
      } catch (e) {
      }
    }, ms || TIMEOUT);
    var opt = { method: req.method || "GET", headers, signal: ctl ? ctl.signal : void 0 };
    if (body) opt.body = body;
    return fetch(proxy(req.url), opt).then(function(r) {
      var st = r ? r.status : 0;
      if (!r || !r.ok) return { ok: false, status: st, json: null, error: "http" };
      return r.json().then(function(j) {
        return { ok: true, status: st, json: j };
      }).catch(function() {
        return { ok: false, status: st, json: null, error: "bad-json" };
      });
    }).catch(function(e) {
      return {
        ok: false,
        status: 0,
        json: null,
        error: e && e.name === "AbortError" ? "timeout" : "network"
      };
    }).then(function(res) {
      clearTimeout(timer);
      return res;
    });
  }
  function buildReq(text, model, ep, prev) {
    var c = cfg();
    var pid = String(c.searchProvider || "tavily").trim().toLowerCase();
    var p = PROVIDERS[pid];
    if (!p) return { error: "unknown-provider", provider: pid };
    var key = keyFor(pid);
    if (!key) return { error: "no-key", provider: pid };
    var q = buildQuery(text, prev);
    if (!q) return { error: "no-query", provider: pid };
    var md = model || (pid === "qianfan" ? _qfModel || QF_MODELS[0] : void 0);
    var useEp = ep || (pid === "qianfan" ? _qfEp || QF_EPS[0] : void 0);
    var to = pid === "qianfan" && useEp === "chat/completions" ? TIMEOUT_SLOW : TIMEOUT;
    try {
      return { req: p.build(q, key, md, useEp), query: q, provider: pid, model: md, ep: useEp, timeout: to };
    } catch (e) {
      return { error: "build", provider: pid };
    }
  }
  function qfPlan() {
    if (_qfEp) return [{ ep: _qfEp, model: _qfModel }];
    var out = [{ ep: "web_search", model: "" }];
    QF_MODELS.slice(0, 3).forEach(function(m) {
      out.push({ ep: "chat/completions", model: m });
    });
    return out;
  }
  function attemptSearch(q0, prev) {
    var b0 = buildReq(q0, void 0, void 0, prev);
    if (!b0.req) return Promise.resolve({ ok: false, error: b0.error, provider: b0.provider, tried: "" });
    var plan = b0.provider === "qianfan" ? qfPlan() : [{ ep: void 0, model: b0.model }];
    var tried = [];
    function attempt(i) {
      var it = plan[i];
      var b = buildReq(q0, it.model, it.ep, prev);
      if (!b.req) {
        return Promise.resolve({ ok: false, error: b.error, provider: b.provider, tried: tried.join(" → ") });
      }
      tried.push((b.ep || "") + (b.model ? "/" + b.model : ""));
      return run(b.req, b.timeout).then(function(res) {
        var last = i + 1 >= plan.length;
        if (!res.ok) {
          return {
            ok: false,
            error: res.status === 402 ? "no-balance" : res.error,
            status: res.status,
            provider: b.provider,
            query: b.query,
            model: b.model,
            ep: b.ep,
            tried: tried.join(" → ")
          };
        }
        var be = bodyError(res.json);
        if (be) {
          if (!last) return attempt(i + 1);
          return {
            ok: false,
            error: "body",
            status: res.status,
            provider: b.provider,
            query: b.query,
            model: b.model,
            ep: b.ep,
            detail: be,
            tried: tried.join(" → ")
          };
        }
        if (b.provider === "qianfan") {
          _qfEp = b.ep || "";
          _qfModel = b.model || "";
        }
        return {
          ok: true,
          status: res.status,
          provider: b.provider,
          query: b.query,
          model: b.model,
          ep: b.ep,
          tried: tried.join(" → "),
          json: res.json
        };
      });
    }
    return attempt(0);
  }
  var WebSrc = {
    matches: function(text) {
      return ASK.test(String(text || ""));
    },
    configured: function() {
      var c = cfg();
      var pid = String(c.searchProvider || "tavily").toLowerCase();
      return !!(keyFor(pid) && PROVIDERS[pid]);
    },
    providers: function() {
      var out = [];
      for (var k in PROVIDERS) {
        if (Object.prototype.hasOwnProperty.call(PROVIDERS, k)) out.push({ id: k, label: PROVIDERS[k].label });
      }
      return out;
    },

    prop: "看书",

    search: function(text, prev) {
      var b0 = buildReq(text, void 0, void 0, prev);
      if (!b0.req) return Promise.resolve("");
      var q = b0.query;
      var hit = _cache[q];
      if (hit && now() - hit.at < TTL) return Promise.resolve(hit.text);
      return attemptSearch(text, prev).then(function(r) {
        if (!r || !r.ok) return "";
        var items = harvest(r.json, [], 0);
        if (r.provider === "deepseek") items = deepen(items, r.json, 250);
        var s = fmt(items, q);
        if (s) _cache[q] = { at: now(), text: s };
        return s;
      }).catch(function() {
        return "";
      });
    },

    probe: function(text, prev) {
      return attemptSearch(text || "今天有什么新闻", prev).then(function(r) {
        if (!r || !r.ok) return r || { ok: false, error: "unknown" };
        var items = harvest(r.json, [], 0);
        if (r.provider === "deepseek") items = deepen(items, r.json, 250);
        var out = {
          ok: true,
          status: r.status,
          provider: r.provider,
          query: r.query,
          model: r.model,
          ep: r.ep,
          tried: r.tried,
          count: items.length,
          text: fmt(items, r.query)
        };
        if (!items.length) {
          try {
            out.keys = Object.keys(r.json || {}).slice(0, 8).join(", ");
            out.sample = JSON.stringify(r.json).slice(0, 400);
          } catch (e) {
          }
        }
        return out;
      }).catch(function(e) {
        return { ok: false, error: "network", detail: String(e && e.message || e) };
      });
    },
    reset: function() {
      _cache = {};
    },

    _harvest: harvest,
    _PROVIDERS: PROVIDERS,
    _fmt: fmt
  };
  global.WebSrc = WebSrc;
})(typeof window !== "undefined" ? window : globalThis);
