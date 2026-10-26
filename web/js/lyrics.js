(function(global) {
  "use strict";
  function decode(buf) {
    var bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (bytes.length >= 3 && bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191) {
      bytes = bytes.subarray(3);
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (e) {
      try {
        return new TextDecoder("gb18030").decode(bytes);
      } catch (e2) {
      }
      return new TextDecoder("utf-8").decode(bytes);
    }
  }
  function toSec(h, m, s, frac) {
    var v = (h ? Number(h) * 3600 : 0) + Number(m) * 60 + Number(s);
    if (frac) {
      var f = String(frac);
      v += Number(f) / (f.length === 1 ? 10 : f.length === 2 ? 100 : 1e3);
    }
    return v;
  }
  var LRC_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  var LRC_WORD = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;
  function parseLRC(text) {
    var out = [], offset = 0;
    var lines = String(text || "").split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      var meta = /^\s*\[([a-zA-Z]+):([^\]]*)\]\s*$/.exec(raw);
      if (meta) {
        if (meta[1].toLowerCase() === "offset") {
          var v = parseInt(meta[2], 10);
          if (!isNaN(v)) offset = v;
        }
        continue;
      }
      var times = [], mm;
      LRC_TAG.lastIndex = 0;
      while (mm = LRC_TAG.exec(raw)) {
        times.push(toSec(0, mm[1], mm[2], mm[3]));
      }
      if (!times.length) continue;
      var txt = raw.replace(LRC_TAG, "").replace(LRC_WORD, "").trim();
      for (var k = 0; k < times.length; k++) out.push({ t: times[k], text: txt });
    }
    if (offset) {
      for (var j = 0; j < out.length; j++) out[j].t = Math.max(0, out[j].t + offset / 1e3);
    }
    out.sort(function(a, b) {
      return a.t - b.t;
    });
    return out;
  }
  var VTT_TIME = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?/;
  var VTT_CUE = new RegExp(VTT_TIME.source + "\\s*-->\\s*" + VTT_TIME.source);
  function unescapeEnt(s) {
    return String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  }
  function parseVTT(text) {
    var out = [];
    var body = String(text || "").replace(/^\uFEFF/, "");
    var blocks = body.split(/\r?\n\s*\r?\n/);
    for (var b = 0; b < blocks.length; b++) {
      var lines = blocks[b].split(/\r?\n/).filter(function(l) {
        return l.trim() !== "";
      });
      if (!lines.length) continue;
      var i = 0;
      if (/^WEBVTT/i.test(lines[0])) {
        if (lines.length === 1) continue;
        i = 1;
      }
      if (/^(NOTE|STYLE|REGION)\b/i.test(lines[i])) continue;
      if (lines[i].indexOf("-->") < 0) i++;
      if (i >= lines.length) continue;
      var m = VTT_CUE.exec(lines[i]);
      if (!m) continue;
      var t = toSec(m[1], m[2], m[3], m[4]);
      var txt = unescapeEnt(lines.slice(i + 1).join("\n").replace(/<[^>]+>/g, "")).trim();
      out.push({ t, text: txt });
    }
    out.sort(function(a, b2) {
      return a.t - b2.t;
    });
    return out;
  }
  function parse(buf, filename) {
    var text = decode(buf);
    var vtt = /\.vtt$/i.test(String(filename || "")) || /^\s*WEBVTT/i.test(text);
    return { kind: vtt ? "vtt" : "lrc", lines: vtt ? parseVTT(text) : parseLRC(text) };
  }
  global.Lyrics = { decode, parse, parseLRC, parseVTT };
})(typeof window !== "undefined" ? window : this);
