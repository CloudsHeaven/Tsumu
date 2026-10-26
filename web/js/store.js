(function(global) {
  "use strict";
  var CAP = 25e5;
  var WARN_RATIO = 0.7;
  var _onWarn = null;
  var _warnedFull = false, _warnedNear = false;
  function onWarn(fn) {
    _onWarn = typeof fn === "function" ? fn : null;
  }
  function fire(kind) {
    try {
      if (_onWarn) _onWarn(kind);
    } catch (e) {
    }
  }
  function used() {
    var n = 0, i, k, v;
    try {
      for (i = 0; i < global.localStorage.length; i++) {
        k = global.localStorage.key(i);
        if (k == null) continue;
        v = global.localStorage.getItem(k);
        n += k.length + (v == null ? 0 : String(v).length);
      }
    } catch (e) {
    }
    return n;
  }
  function ratio() {
    var r = used() / CAP;
    return r > 1 ? 1 : r;
  }
  function checkNear() {
    if (_warnedNear) return;
    if (ratio() < WARN_RATIO) return;
    _warnedNear = true;
    fire("near");
  }
  function set(key, value) {
    try {
      global.localStorage.setItem(String(key), String(value));
    } catch (e) {
      if (!_warnedFull) {
        _warnedFull = true;
        fire("full");
      }
      return false;
    }
    checkNear();
    return true;
  }
  function get(key) {
    try {
      return global.localStorage.getItem(String(key));
    } catch (e) {
      return null;
    }
  }
  function stats() {
    return { used: used(), cap: CAP, ratio: ratio(), warnRatio: WARN_RATIO };
  }
  function resetWarnings() {
    _warnedFull = false;
    _warnedNear = false;
  }
  global.SafeStore = {
    set,
    get,
    used,
    ratio,
    stats,
    onWarn,
    resetWarnings,
    CAP,
    WARN_RATIO
  };
})(typeof window !== "undefined" ? window : globalThis);
