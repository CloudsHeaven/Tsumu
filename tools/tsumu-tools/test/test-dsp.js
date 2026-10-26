"use strict";
const { FFT, naiveDft, TWOPI } = require("../src/fft");
const { Stft, IStft } = require("../src/stft");
let fails = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS  " : "FAIL  ") + name + (detail ? "   " + detail : ""));
  if (!ok) fails++;
}
function maxAbsDiff(a, b, from, to) {
  let m = 0, at = -1;
  for (let i = from; i < to; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > m) {
      m = d;
      at = i;
    }
  }
  return { m, at };
}
function rnd(seed) {
  let s = seed >>> 0;
  return () => {
    s = s * 1664525 + 1013904223 >>> 0;
    return s / 4294967296 * 2 - 1;
  };
}
console.log("--- 1) FFT vs 朴素 DFT ---");
for (const n of [12, 15, 32, 60, 256, 1024, 3072, 4096]) {
  const g = rnd(12345 + n);
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    re[i] = g();
    im[i] = g() * 0.5;
  }
  const ref = naiveDft(re, im, n);
  const f = new FFT(n);
  const r2 = re.slice(), i2 = im.slice();
  f.forward(r2, i2);
  const dr = maxAbsDiff(r2, ref.re, 0, n), di = maxAbsDiff(i2, ref.im, 0, n);
  const tol = 1e-9 * n;
  check(
    `n=${n} factors=[${f.factors}]`,
    dr.m < tol && di.m < tol,
    `maxdiff re=${dr.m.toExponential(2)} im=${di.m.toExponential(2)} tol=${tol.toExponential(1)}`
  );
}
{
  const n = 6144;
  const g = rnd(999);
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    re[i] = g();
    im[i] = 0;
  }
  const bins = [0, 1, 2, 3, 7, 100, 1e3, 2048, 3071, 3072, 4e3, 6e3, 6143];
  const ref = naiveDft(re, im, n, bins);
  const f = new FFT(n);
  const r2 = re.slice(), i2 = im.slice();
  f.forward(r2, i2);
  let worst = 0, worstBin = -1;
  for (const k of bins) {
    const d = Math.hypot(r2[k] - ref.re[k], i2[k] - ref.im[k]);
    if (d > worst) {
      worst = d;
      worstBin = k;
    }
  }
  check(
    `n=6144 factors=[${f.factors}] spot bins`,
    worst < 1e-8,
    `worst=${worst.toExponential(2)} @bin ${worstBin}`
  );
}
console.log("--- 2) FFT 正逆往返 ---");
for (const n of [60, 3072, 4096, 6144]) {
  const g = rnd(777 + n);
  const re = new Float64Array(n), im = new Float64Array(n);
  const or_ = new Float64Array(n), oi = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    re[i] = g();
    im[i] = g() * 0.3;
    or_[i] = re[i];
    oi[i] = im[i];
  }
  const f = new FFT(n);
  f.forward(re, im);
  f.inverse(re, im);
  const d = maxAbsDiff(re, or_, 0, n), d2 = maxAbsDiff(im, oi, 0, n);
  check(
    `roundtrip n=${n}`,
    d.m < 1e-12 && d2.m < 1e-12,
    `maxdiff=${Math.max(d.m, d2.m).toExponential(2)}`
  );
}
console.log("--- 3) STFT 帧 vs 朴素 DFT（校验分帧/加窗/reflect 补边） ---");
{
  const n_fft = 6144, hop = 1024, N = 2e4;
  const g = rnd(4242);
  const x = new Float64Array(N);
  for (let i = 0; i < N; i++) x[i] = g() * 0.4;
  const st = new Stft({ n_fft, hop_length: hop, win_length: n_fft, window_type: "hann", center: true });
  const got = st.compute(x, N);
  const pad = n_fft / 2, bins = n_fft / 2 + 1;
  const padded = new Float64Array(N + 2 * pad);
  padded.set(x, pad);
  for (let i = 0; i < pad; i++) {
    padded[i] = x[pad - i];
    padded[pad + N + i] = x[N - 2 - i];
  }
  const w = st.window;
  let worst = 0, worstInfo = "";
  for (const fr of [0, 1, 5]) {
    const frame = new Float64Array(n_fft);
    for (let k = 0; k < n_fft; k++) frame[k] = padded[fr * hop + k] * w[k];
    const ref = naiveDft(
      frame,
      new Float64Array(n_fft),
      n_fft,
      [0, 1, 17, 100, 512, 1e3, 2048, 3072]
    );
    for (const k of [0, 1, 17, 100, 512, 1e3, 2048, 3072]) {
      const b = fr * bins;
      const d = Math.hypot(got.real[b + k] - ref.re[k], got.imag[b + k] - ref.im[k]);
      if (d > worst) {
        worst = d;
        worstInfo = `frame ${fr} bin ${k}`;
      }
    }
  }
  check("stft frames match naive DFT", worst < 1e-8, `worst=${worst.toExponential(2)} @${worstInfo}`);
  check("stft num_frames", got.num_frames === 1 + Math.floor((N + n_fft - n_fft) / hop), `got ${got.num_frames}`);
  check("stft imag[0]=imag[nyq]=0", got.imag[0] === 0 && got.imag[n_fft / 2] === 0, "");
}
console.log("--- 4) STFT/iSTFT 往返恒等 ---");
for (const [n_fft, hop] of [[6144, 1024], [4096, 1024], [2048, 512]]) {
  const N = 4e4;
  const g = rnd(31337 + n_fft);
  const x = new Float64Array(N);
  for (let i = 0; i < N; i++) x[i] = g() * 0.5;
  const cfg = { n_fft, hop_length: hop, win_length: n_fft, window_type: "hann", center: true };
  const s = new Stft(cfg).compute(x, N);
  const y = new IStft(cfg).compute(s.real, s.imag, s.num_frames);
  const from = 2 * n_fft, to = y.length - 2 * n_fft;
  const d = maxAbsDiff(y, x, from, to);
  check(
    `roundtrip n_fft=${n_fft} hop=${hop}`,
    d.m < 1e-9,
    `maxdiff=${d.m.toExponential(2)} len ${y.length} vs ${N} @${d.at}`
  );
}
console.log(fails === 0 ? "\nALL PASS" : `
${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
