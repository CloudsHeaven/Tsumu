"use strict";
const TWOPI = Math.PI * 2;
function factorize(n) {
  const f = [];
  let m = n;
  while (m % 4 === 0) {
    f.push(4);
    m /= 4;
  }
  while (m % 2 === 0) {
    f.push(2);
    m /= 2;
  }
  while (m % 3 === 0) {
    f.push(3);
    m /= 3;
  }
  while (m % 5 === 0) {
    f.push(5);
    m /= 5;
  }
  if (m !== 1) throw new Error("FFT: unsupported size " + n);
  return f;
}
class FFT {
  constructor(n) {
    if (!Number.isInteger(n) || n < 1) throw new Error("FFT: bad size " + n);
    this.n = n;
    this.factors = factorize(n);
    const levels = [];
    let cn = n;
    for (let fi = 0; fi < this.factors.length; fi++) {
      const r = this.factors[fi];
      const m = cn / r;
      const twRe = new Float64Array(r * m);
      const twIm = new Float64Array(r * m);
      for (let p = 0; p < r; p++) {
        for (let q = 0; q < m; q++) {
          const ang = -TWOPI * (p * q % cn) / cn;
          twRe[p * m + q] = Math.cos(ang);
          twIm[p * m + q] = Math.sin(ang);
        }
      }
      const sr = new Float64Array(r * r);
      const si = new Float64Array(r * r);
      for (let p = 0; p < r; p++) {
        for (let s = 0; s < r; s++) {
          const ang = -TWOPI * (p * s % r) / r;
          sr[p * r + s] = Math.cos(ang);
          si[p * r + s] = Math.sin(ang);
        }
      }
      levels.push({ n: cn, r, m, twRe, twIm, sr, si });
      cn = m;
    }
    this.levels = levels;
    const scratch = 4 * n + 16;
    this._sRe = new Float64Array(scratch);
    this._sIm = new Float64Array(scratch);
    this._outRe = new Float64Array(n);
    this._outIm = new Float64Array(n);
  }
  _run(re, im, n, off, stride, outRe, outIm, outOff, lv, sRe, sIm, sOff) {
    if (n === 1) {
      outRe[outOff] = re[off];
      outIm[outOff] = im[off];
      return;
    }
    const L = this.levels[lv];
    const r = L.r, m = L.m;
    const twRe = L.twRe, twIm = L.twIm, sr = L.sr, si = L.si;
    const childBase = sOff + n;
    for (let p = 0; p < r; p++) {
      this._run(
        re,
        im,
        m,
        off + p * stride,
        stride * r,
        sRe,
        sIm,
        sOff + p * m,
        lv + 1,
        sRe,
        sIm,
        childBase
      );
    }
    for (let q = 0; q < m; q++) {
      for (let s = 0; s < r; s++) {
        let ar = 0, ai = 0;
        for (let p = 0; p < r; p++) {
          const xr = sRe[sOff + p * m + q];
          const xi = sIm[sOff + p * m + q];
          const wr = twRe[p * m + q];
          const wi = twIm[p * m + q];
          const br = xr * wr - xi * wi;
          const bi = xr * wi + xi * wr;
          const vr = sr[p * r + s];
          const vi = si[p * r + s];
          ar += br * vr - bi * vi;
          ai += br * vi + bi * vr;
        }
        outRe[outOff + q + m * s] = ar;
        outIm[outOff + q + m * s] = ai;
      }
    }
  }

  forward(re, im) {
    const n = this.n;
    this._run(re, im, n, 0, 1, this._outRe, this._outIm, 0, 0, this._sRe, this._sIm, 0);
    re.set(this._outRe);
    im.set(this._outIm);
  }

  inverse(re, im) {
    const n = this.n;
    for (let i = 0; i < n; i++) im[i] = -im[i];
    this.forward(re, im);
    const s = 1 / n;
    for (let i = 0; i < n; i++) {
      re[i] *= s;
      im[i] = -im[i] * s;
    }
  }
}
function naiveDft(re, im, n, bins) {
  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  const idx = bins || Array.from({ length: n }, (_, i) => i);
  for (const k of idx) {
    let sr = 0, si = 0;
    for (let t = 0; t < n; t++) {
      const ang = -TWOPI * (k * t % n) / n;
      const c = Math.cos(ang), s = Math.sin(ang);
      sr += re[t] * c - im[t] * s;
      si += re[t] * s + im[t] * c;
    }
    outRe[k] = sr;
    outIm[k] = si;
  }
  return { re: outRe, im: outIm };
}
module.exports = { FFT, factorize, naiveDft, TWOPI };
