(function(global) {
  var MAGIC = "TSUMUENV";
  var HEADER = 32;
  var MAX_COUNT = 60 * 60 * 24;
  function parse(buf) {
    if (!buf || typeof buf.byteLength !== "number" || buf.byteLength < HEADER) return null;
    var dv;
    try {
      dv = new DataView(buf);
    } catch (e) {
      return null;
    }
    var magic = "";
    for (var i = 0; i < 8; i++) magic += String.fromCharCode(dv.getUint8(i));
    if (magic !== MAGIC) return null;
    var version = dv.getUint32(8, true);
    if (version !== 1) return null;
    var rateHz = dv.getUint32(12, true);
    var count = dv.getUint32(16, true);
    if (!rateHz || !count || count > MAX_COUNT) return null;
    if (HEADER + count * 4 > buf.byteLength) return null;
    var rms = new Float32Array(count);
    for (var k = 0; k < count; k++) rms[k] = dv.getFloat32(HEADER + k * 4, true);
    return {
      version,
      rateHz,
      count,
      refRms: dv.getFloat32(24, true),
      peakRms: dv.getFloat32(28, true),
      rms,
      seconds: count / rateHz
    };
  }
  function levelAt(env, seconds) {
    if (!env || !env.count) return 0;
    var t = Number(seconds);
    if (!isFinite(t) || t < 0) t = 0;
    var i = Math.floor(t * env.rateHz);
    if (i >= env.count) i = env.count - 1;
    var ref = env.refRms > 1e-6 ? env.refRms : 0.22;
    var r = env.rms[i] / ref;
    if (!(r > 0)) return 0;
    if (r > 1) r = 1;
    return Math.min(1, Math.pow(r, 0.7));
  }
  global.TsumuMouthEnv = { parse, levelAt, MAGIC };
})(window);
