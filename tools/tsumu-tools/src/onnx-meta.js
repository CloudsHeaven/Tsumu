"use strict";
const fs = require("fs");
function readVarint(buf, p) {
  let result = 0, shift = 1;
  for (; ; ) {
    const b = buf[p++];
    result += (b & 127) * shift;
    if ((b & 128) === 0) break;
    shift *= 128;
  }
  return [result, p];
}
function skipField(buf, p, wire) {
  if (wire === 0) {
    const r = readVarint(buf, p);
    return r[1];
  }
  if (wire === 1) return p + 8;
  if (wire === 2) {
    const r = readVarint(buf, p);
    return r[1] + r[0];
  }
  if (wire === 5) return p + 4;
  throw new Error("onnx-meta: bad wire type " + wire);
}
function parseStringEntry(buf, p, len) {
  const end = p + len;
  let key = null, val = null;
  while (p < end) {
    const t = readVarint(buf, p);
    p = t[1];
    const field = t[0] >>> 3, wire = t[0] & 7;
    if (field === 1 && wire === 2) {
      const r = readVarint(buf, p);
      key = buf.toString("utf8", r[1], r[1] + r[0]);
      p = r[1] + r[0];
    } else if (field === 2 && wire === 2) {
      const r = readVarint(buf, p);
      val = buf.toString("utf8", r[1], r[1] + r[0]);
      p = r[1] + r[0];
    } else {
      p = skipField(buf, p, wire);
    }
  }
  return [key, val];
}
function readOnnxMetadata(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 16) throw new Error("onnx-meta: file too small");
  const props = {};
  let p = 0;
  while (p < buf.length) {
    const t = readVarint(buf, p);
    p = t[1];
    const field = t[0] >>> 3, wire = t[0] & 7;
    if (field === 14 && wire === 2) {
      const r = readVarint(buf, p);
      const [k, v] = parseStringEntry(buf, r[1], r[0]);
      if (k != null) props[k] = v;
      p = r[1] + r[0];
    } else {
      p = skipField(buf, p, wire);
    }
    if (p <= 0) break;
  }
  return props;
}
function parseUvrMeta(props, shapes) {
  const num = (k) => props[k] == null ? void 0 : Number(props[k]);
  const meta = {
    modelType: props.model_type,
    numStems: num("stems"),
    sampleRate: num("sample_rate") || 44100,
    nFft: num("n_fft"),
    hopLength: num("hop_length") || 1024,
    winLength: num("win_length"),
    dimF: num("dim_f"),
    dimT: num("dim_t"),
    dimC: num("dim_c"),
    windowType: props.window_type || "hann",
    center: props.center == null ? true : Number(props.center) !== 0,

    margin: 0,
    numChunks: 15
  };
  if (shapes) {
    meta.inputShape = shapes.input;
    meta.outputShape = shapes.output;
    const o = shapes.output;
    if (o && o.length === 4) {
      if (!meta.dimC) meta.dimC = o[1];
      if (!meta.dimF) meta.dimF = o[2];
      if (!meta.dimT) meta.dimT = o[3];
    }
    if (!meta.nFft && meta.dimF) meta.nFft = meta.dimF * 2;
    if (!meta.winLength) meta.winLength = meta.nFft;
  }
  meta.margin = meta.sampleRate;
  return meta;
}
module.exports = { readOnnxMetadata, parseUvrMeta };
