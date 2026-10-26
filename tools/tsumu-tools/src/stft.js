"use strict";
const { FFT, TWOPI } = require("./fft");
function makeWindow(type, size) {
  const w = new Float64Array(size);
  let a = TWOPI / (size - 1);
  if (type === "hann") a = TWOPI / size;
  for (let i = 0; i < size; i++) {
    if (type === "hann" || type === "hanning") w[i] = 0.5 - 0.5 * Math.cos(a * i);
    else if (type === "sine") w[i] = Math.sin(0.5 * a * i);
    else if (type === "hamming") w[i] = 0.54 - 0.46 * Math.cos(a * i);
    else if (type === "povey") w[i] = Math.pow(0.5 - 0.5 * Math.cos(a * i), 0.85);
    else if (type === "rectangular") w[i] = 1;
    else if (type === "blackman") w[i] = 0.42 - 0.5 * Math.cos(a * i) + 0.08 * Math.cos(2 * a * i);
    else throw new Error("unsupported window_type: " + type);
  }
  return w;
}
function reflectPad(data, n, pad) {
  const out = new Float64Array(n + 2 * pad);
  out.set(data.subarray(0, n), pad);
  for (let i = 0; i < pad; i++) {
    out[i] = data[pad - i];
    out[pad + n + i] = data[n - 2 - i];
  }
  return out;
}
function normalizeCfg(cfg) {
  return {
    n_fft: cfg.n_fft,
    hop: cfg.hop_length,
    win_length: cfg.win_length == null ? cfg.n_fft : cfg.win_length,
    window_type: cfg.window_type || "hann",
    center: cfg.center !== false,
    pad_mode: cfg.pad_mode || "reflect",
    normalized: !!cfg.normalized
  };
}
class Stft {
  constructor(cfg) {
    const c = normalizeCfg(cfg);
    Object.assign(this, c);
    this.window = makeWindow(c.window_type, c.win_length);
    this.bins = c.n_fft / 2 + 1;
    this.fft = new FFT(c.n_fft);
    this._re = new Float64Array(c.n_fft);
    this._im = new Float64Array(c.n_fft);
  }

  compute(data, n) {
    const { n_fft, hop, window, bins } = this;
    let p = data, N = n;
    if (this.center) {
      p = reflectPad(data, n, n_fft / 2);
      N = p.length;
    }
    const numFrames = 1 + Math.floor((N - n_fft) / hop);
    const real = new Float64Array(numFrames * bins);
    const imag = new Float64Array(numFrames * bins);
    const re = this._re, im = this._im;
    const wl = Math.min(this.win_length, n_fft);
    const half = n_fft / 2;
    for (let i = 0; i < numFrames; i++) {
      const o = i * hop;
      for (let k = 0; k < wl; k++) {
        re[k] = p[o + k] * window[k];
        im[k] = 0;
      }
      for (let k = wl; k < n_fft; k++) {
        re[k] = 0;
        im[k] = 0;
      }
      this.fft.forward(re, im);
      const b = i * bins;
      real[b] = re[0];
      imag[b] = 0;
      real[b + half] = re[half];
      imag[b + half] = 0;
      for (let k = 1; k < half; k++) {
        real[b + k] = re[k];
        imag[b + k] = im[k];
      }
      if (this.normalized) {
        const s = 1 / Math.sqrt(n_fft);
        for (let k = 0; k < bins; k++) {
          real[b + k] *= s;
          imag[b + k] *= s;
        }
      }
    }
    return { real, imag, num_frames: numFrames };
  }
}
class IStft {
  constructor(cfg) {
    const c = normalizeCfg(cfg);
    Object.assign(this, c);
    this.window = makeWindow(c.window_type, c.win_length);
    this.bins = c.n_fft / 2 + 1;
    this.fft = new FFT(c.n_fft);
    this._re = new Float64Array(c.n_fft);
    this._im = new Float64Array(c.n_fft);
  }

  compute(real, imag, numFrames) {
    const { n_fft, hop, window, bins } = this;
    const half = n_fft / 2;
    const numSamples = n_fft + (numFrames - 1) * hop;
    const samples = new Float64Array(numSamples);
    const denom = new Float64Array(numSamples);
    const re = this._re, im = this._im;
    const wl = Math.min(this.win_length, n_fft);
    for (let i = 0; i < numFrames; i++) {
      const b = i * bins;
      re[0] = real[b];
      im[0] = 0;
      re[half] = real[b + half];
      im[half] = 0;
      for (let k = 1; k < half; k++) {
        const rr = real[b + k], ii = imag[b + k];
        re[k] = rr;
        im[k] = ii;
        re[n_fft - k] = rr;
        im[n_fft - k] = -ii;
      }
      this.fft.inverse(re, im);
      const o = i * hop;
      for (let k = 0; k < wl; k++) samples[o + k] += re[k] * window[k];
      for (let k = 0; k < wl; k++) denom[o + k] += window[k] * window[k];
    }
    for (let i = 0; i < numSamples; i++) {
      if (denom[i]) samples[i] /= denom[i];
    }
    if (this.center) return samples.subarray(half, numSamples - half);
    return samples;
  }
}
module.exports = { Stft, IStft, makeWindow, reflectPad };
