(function(global) {
  "use strict";
  var GEO = "https://geocoding-api.open-meteo.com/v1/search";
  var FC = "https://api.open-meteo.com/v1/forecast";
  var TTL_GEO = 24 * 60 * 60 * 1e3;
  var TTL_WX = 10 * 60 * 1e3;
  var TIMEOUT = 8e3;
  var WMO = {
    0: "晴",
    1: "大致晴朗",
    2: "局部多云",
    3: "阴",
    45: "雾",
    48: "雾凇",
    51: "小毛毛雨",
    53: "毛毛雨",
    55: "大毛毛雨",
    56: "冻毛毛雨",
    57: "强冻毛毛雨",
    61: "小雨",
    63: "中雨",
    65: "大雨",
    66: "冻雨",
    67: "强冻雨",
    71: "小雪",
    73: "中雪",
    75: "大雪",
    77: "雪粒",
    80: "小阵雨",
    81: "阵雨",
    82: "强阵雨",
    85: "小阵雪",
    86: "强阵雪",
    95: "雷阵雨",
    96: "雷阵雨伴小冰雹",
    99: "雷阵雨伴冰雹"
  };
  var ASK = /(天气|氣象|气温|氣溫|多少度|几度|下雨|下雪|会不会冷|冷不冷|热不热|冷不冷|weather|forecast|temperature|rain|snow|天気|気温|寒い|暑い|雨|雪)/i;
  var _geo = {};
  var _wx = {};
  function cfg() {
    try {
      return global.Config && Config.section("web") || {};
    } catch (e) {
      return {};
    }
  }
  function city() {
    return String(cfg().city || "").trim();
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
  function getJson(url, ms) {
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
    var opt = ctl ? { signal: ctl.signal } : void 0;
    return fetch(proxy(url), opt).then(function(r) {
      return r && r.ok ? r.json() : null;
    }).catch(function() {
      return null;
    }).then(function(j) {
      clearTimeout(timer);
      return j;
    });
  }
  function geocode(name) {
    var c = _geo[name];
    if (c && now() - c.at < TTL_GEO) return Promise.resolve(c);
    var u = GEO + "?name=" + encodeURIComponent(name) + "&count=1&language=zh&format=json";
    return getJson(u).then(function(j) {
      var r = j && j.results && j.results[0];
      if (!r || r.latitude == null || r.longitude == null) return null;
      var out = {
        at: now(),
        lat: r.latitude,
        lon: r.longitude,
        name: [r.name, r.admin1, r.country].filter(Boolean).join(" · "),
        tz: r.timezone || ""
      };
      _geo[name] = out;
      return out;
    });
  }
  function hourMin(iso) {
    var m = String(iso || "").match(/T(\d{2}):(\d{2})/);
    return m ? m[1] + ":" + m[2] : "";
  }
  function fetchWeather(g) {
    var key = g.lat + "," + g.lon;
    var c = _wx[key];
    if (c && now() - c.at < TTL_WX) return Promise.resolve(c.text);
    var u = FC + "?latitude=" + g.lat + "&longitude=" + g.lon + "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&wind_speed_unit=ms&timezone=auto&forecast_days=1";
    return getJson(u).then(function(j) {
      var cur = j && j.current, day = j && j.daily;
      if (!cur || cur.temperature_2m == null) return "";
      var lines = [];
      lines.push("（" + g.name + " · 当地 " + String(cur.time || "").slice(0, 10) + " " + hourMin(cur.time) + "）");
      var desc = WMO[cur.weather_code] || "";
      var l1 = "现在 " + cur.temperature_2m + "°C";
      if (cur.apparent_temperature != null) l1 += "（体感 " + cur.apparent_temperature + "°C）";
      if (desc) l1 += " · " + desc;
      if (cur.relative_humidity_2m != null) l1 += " · 湿度 " + cur.relative_humidity_2m + "%";
      if (cur.wind_speed_10m != null) l1 += " · 风速 " + cur.wind_speed_10m + " m/s";
      if (cur.precipitation != null) l1 += " · 降水 " + cur.precipitation + " mm";
      lines.push(l1);
      if (day && day.temperature_2m_max && day.temperature_2m_min && day.temperature_2m_max[0] != null && day.temperature_2m_min[0] != null) {
        var l2 = "今天 最高 " + day.temperature_2m_max[0] + "°C / 最低 " + day.temperature_2m_min[0] + "°C";
        if (day.precipitation_probability_max && day.precipitation_probability_max[0] != null) {
          l2 += " · 降水概率 " + day.precipitation_probability_max[0] + "%";
        }
        lines.push(l2);
      }
      var text = lines.join("\n");
      _wx[key] = { at: now(), text };
      return text;
    });
  }
  var Weather = {

    prop: "水晶球",

    matches: function(text) {
      return ASK.test(String(text || ""));
    },

    configured: function() {
      return !!city();
    },

    brief: function(cityArg) {
      var c = String(cityArg || city() || "").trim();
      if (!c) return Promise.resolve("");
      return geocode(c).then(function(g) {
        if (!g) return "";
        return fetchWeather(g);
      }).catch(function() {
        return "";
      });
    },
    reset: function() {
      _geo = {};
      _wx = {};
    },

    _WMO: WMO,
    _TTL_WX: TTL_WX,
    _TTL_GEO: TTL_GEO
  };
  global.Weather = Weather;
})(typeof window !== "undefined" ? window : globalThis);
