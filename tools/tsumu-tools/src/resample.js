"use strict";
function designLowpass(cutoff, taps) {
  const h = new Float64Array(taps);
  const M = taps - 1;
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const x = i - M / 2;
    const sinc = x === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x);
    const w = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / M) + 0.08 * Math.cos(4 * Math.PI * i / M);
    h[i] = sinc * w;
    sum += h[i];
  }
  for (let i = 0; i < taps; i++) h[i] /= sum;
  return h;
}
function lowpass(x, h) {
  const n = x.length, taps = h.length, half = taps - 1 >> 1;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = 0; k < taps; k++) {
      const j = i + k - half;
      if (j >= 0 && j < n) acc += x[j] * h[k];
    }
    out[i] = acc;
  }
  return out;
}
function resample(channels, srcRate, dstRate) {
  if (srcRate === dstRate) {
    return { channels: channels.map((c) => c instanceof Float64Array ? c : Float64Array.from(c)), sampleRate: dstRate };
  }
  let work = channels.map((c) => c instanceof Float64Array ? c : Float64Array.from(c));
  if (dstRate < srcRate) {
    const h = designLowpass(0.45 * (dstRate / srcRate), 64);
    work = work.map((c) => lowpass(c, h));
  }
  const ratio = dstRate / srcRate;
  const outLen = Math.max(1, Math.round(work[0].length * ratio));
  const out = work.map(() => new Float64Array(outLen));
  for (let i = 0; i < outLen; i++) {
    const srcPos = i / ratio;
    const i0 = Math.floor(srcPos);
    const frac = srcPos - i0;
    const i1 = Math.min(i0 + 1, work[0].length - 1);
    const a0 = Math.min(i0, work[0].length - 1);
    for (let c = 0; c < work.length; c++) {
      out[c][i] = work[c][a0] * (1 - frac) + work[c][i1] * frac;
    }
  }
  return { channels: out, sampleRate: dstRate };
}
function toMono(channels) {
  const n = channels[0].length;
  if (channels.length === 1) return Float64Array.from(channels[0]);
  const out = new Float64Array(n);
  for (let c = 0; c < channels.length; c++) {
    const ch = channels[c];
    for (let i = 0; i < n; i++) out[i] += ch[i];
  }
  for (let i = 0; i < n; i++) out[i] /= channels.length;
  return out;
}
module.exports = { resample, toMono, lowpass, designLowpass };
