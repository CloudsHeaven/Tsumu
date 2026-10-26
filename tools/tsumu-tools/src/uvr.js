"use strict";
const { Stft, IStft } = require("./stft");
function splitIntoChunks(samples, margin, numChunks, sampleRate) {
  const out = [];
  if (samples.length === 0) return out;
  let chunkSize = numChunks * sampleRate;
  if (samples.length < chunkSize) chunkSize = samples.length;
  if (margin > chunkSize) margin = chunkSize;
  for (let i = 0; i < samples.length; i += chunkSize) {
    const start = Math.max(0, i - margin);
    const end = Math.min(i + chunkSize + margin, samples.length);
    if (start >= end) break;
    out.push(samples.subarray(start, end));
    if (end === samples.length) break;
  }
  return out;
}
function subtract(a, b) {
  const n = Math.min(a.length, b.length);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = a[i] - b[i];
  return out;
}
class UvrSeparator {
  constructor(meta, ort, session) {
    this.meta = meta;
    this.ort = ort;
    this.session = session;
    this.cfg = {
      n_fft: meta.nFft,
      hop_length: meta.hopLength,
      win_length: meta.winLength,
      window_type: meta.windowType,
      center: meta.center
    };
    this.stft = new Stft(this.cfg);
    this.istft = new IStft(this.cfg);
    this.bins = meta.nFft / 2 + 1;
    this.xBuffer = null;
    this.inName = session.inputNames[0];
    this.outName = session.outputNames[0];
    this.timings = { stft: 0, onnx: 0, istft: 0, chunks: 0, frames: 0 };
  }

  _computeStft(chunk) {
    const { nFft, hopLength, dimT } = this.meta;
    const trim = nFft / 2;
    const chunkSize = hopLength * (dimT - 1);
    const genSize = chunkSize - 2 * trim;
    if (genSize <= 0) throw new Error(`bad meta: gen_size=${genSize} <= 0`);
    const pad = genSize - chunk.length % genSize;
    const buf = new Float64Array(trim + chunk.length + pad + trim);
    buf.set(chunk, trim);
    const results = [];
    for (let i = 0; i < chunk.length + pad; i += genSize) {
      results.push(this.stft.compute(buf.subarray(i, i + chunkSize), chunkSize));
    }
    return { results, pad };
  }

  _inverseStft(s, isFirst, isLast) {
    const { nFft, numChunks, sampleRate } = this.meta;
    const trim = nFft / 2;
    let margin = this.meta.margin;
    const chunkSize = numChunks * sampleRate;
    if (margin > chunkSize) margin = chunkSize;
    const pieces = [];
    let total = 0;
    for (let i = 0; i < s.results.length; i++) {
      const r = s.results[i];
      const wav = this.istft.compute(r.real, r.imag, r.num_frames);
      const p = wav.subarray(trim, wav.length - trim);
      pieces.push(p);
      total += p.length;
    }
    const ans = new Float64Array(total);
    let o = 0;
    for (const p of pieces) {
      ans.set(p, o);
      o += p.length;
    }
    const start = isFirst ? 0 : margin;
    const end = isLast ? ans.length - s.pad : ans.length - s.pad - margin;
    return ans.subarray(start, Math.max(start, end));
  }

  async _processChunk(chunk0, chunk1, isFirst, isLast) {
    const { dimF, dimT, nFft, dimC } = this.meta;
    const nFftBin = nFft / 2 + 1;
    const trim = nFft / 2;
    let t = Date.now();
    const s0 = this._computeStft(chunk0);
    const s1 = chunk1 && chunk1.length ? this._computeStft(chunk1) : s0;
    this.timings.stft += Date.now() - t;
    const numFrames = s0.results[0].num_frames;
    if (numFrames !== dimT) throw new Error(`numFrames(${numFrames}) != dim_t(${dimT})`);
    const nSub = s0.results.length;
    this.timings.frames += nSub * numFrames;
    const need = nSub * dimC * dimF * dimT;
    let x = this.xBuffer;
    if (!x || x.length !== need) x = this.xBuffer = new Float32Array(need);
    let px = 0;
    for (let i = 0; i < nSub; i++) {
      const r0 = s0.results[i].real, i0 = s0.results[i].imag;
      const r1 = s1.results[i].real, i1 = s1.results[i].imag;
      for (let j = 0; j < dimF; j++) for (let k = 0; k < numFrames; k++) x[px++] = r0[k * nFftBin + j];
      for (let j = 0; j < dimF; j++) for (let k = 0; k < numFrames; k++) x[px++] = i0[k * nFftBin + j];
      for (let j = 0; j < dimF; j++) for (let k = 0; k < numFrames; k++) x[px++] = r1[k * nFftBin + j];
      for (let j = 0; j < dimF; j++) for (let k = 0; k < numFrames; k++) x[px++] = i1[k * nFftBin + j];
    }
    const batch = nSub * 4 / dimC;
    const feeds = {};
    feeds[this.inName] = new this.ort.Tensor("float32", x, [batch, dimC, dimF, dimT]);
    t = Date.now();
    const out = await this.session.run(feeds);
    this.timings.onnx += Date.now() - t;
    const spec = out[this.outName].data;
    if (spec.length !== need) throw new Error(`model output size ${spec.length} != ${need}`);
    let ps = 0;
    for (let i = 0; i < nSub; i++) {
      const r0 = s0.results[i].real, i0 = s0.results[i].imag;
      const r1 = s1.results[i].real, i1 = s1.results[i].imag;
      for (let j = 0; j < dimF; j++) for (let k = 0; k < numFrames; k++) r0[k * nFftBin + j] = spec[ps++];
      for (let j = 0; j < dimF; j++) for (let k = 0; k < numFrames; k++) i0[k * nFftBin + j] = spec[ps++];
      for (let j = 0; j < dimF; j++) for (let k = 0; k < numFrames; k++) r1[k * nFftBin + j] = spec[ps++];
      for (let j = 0; j < dimF; j++) for (let k = 0; k < numFrames; k++) i1[k * nFftBin + j] = spec[ps++];
      for (let k = 0; k < numFrames; k++) {
        for (let j = dimF; j < nFftBin; j++) {
          r0[k * nFftBin + j] = 0;
          r1[k * nFftBin + j] = 0;
          i0[k * nFftBin + j] = 0;
          i1[k * nFftBin + j] = 0;
        }
      }
    }
    t = Date.now();
    const v0 = this._inverseStft(s0, isFirst, isLast);
    const v1 = this._inverseStft(s1, isFirst, isLast);
    this.timings.istft += Date.now() - t;
    this.timings.chunks++;
    return { ch0: v0, ch1: v1 };
  }

  async separate(audio, onProgress) {
    const { sampleRate, numChunks } = this.meta;
    const margin = this.meta.margin;
    const chans = audio.channels;
    const chunks0 = splitIntoChunks(chans[0], margin, numChunks, sampleRate);
    const stereo = chans.length > 1;
    const chunks1 = stereo ? splitIntoChunks(chans[1], margin, numChunks, sampleRate) : [];
    const v0parts = [], v1parts = [];
    for (let i = 0; i < chunks0.length; i++) {
      const r = await this._processChunk(
        chunks0[i],
        stereo ? chunks1[i] : null,
        i === 0,
        i === chunks0.length - 1
      );
      v0parts.push(r.ch0);
      v1parts.push(r.ch1);
      if (onProgress) onProgress(i + 1, chunks0.length);
    }
    const cat = (parts) => {
      let total = 0;
      for (const p of parts) total += p.length;
      const out = new Float64Array(total);
      let o = 0;
      for (const p of parts) {
        out.set(p, o);
        o += p.length;
      }
      return out;
    };
    const vocals = [cat(v0parts), cat(v1parts)];
    const nonVocals = [
      subtract(chans[0], vocals[0]),
      subtract(stereo ? chans[1] : chans[0], vocals[1])
    ];
    return { vocals, nonVocals, sampleRate };
  }
}
module.exports = { UvrSeparator, splitIntoChunks, subtract };
