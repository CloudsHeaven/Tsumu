"use strict";
const path = require("path");
const { decodeAudio } = require("../src/decode");
const { Stft } = require("../src/stft");
const DIR = path.join(__dirname, "..", "out");
const NAME = process.argv[2];
if (!NAME) {
  console.error("用法: node test/analyze.js <曲名>   （读 out/<曲名>.vocals.wav 与 .non_vocals.wav）");
  process.exit(1);
}
function bandFraction(windows, sampleRate, lo, hi) {
  const nFft = 16384;
  const st = new Stft({ n_fft: nFft, hop_length: nFft / 2, win_length: nFft, window_type: "hann", center: false });
  const bins = nFft / 2 + 1;
  const hzPerBin = sampleRate / nFft;
  let inBand = 0, total = 0;
  for (const w of windows) {
    const s = st.compute(w, w.length);
    for (let f = 0; f < s.num_frames; f++) {
      for (let k = 1; k < bins; k++) {
        const p = s.real[f * bins + k] ** 2 + s.imag[f * bins + k] ** 2;
        total += p;
        const hz = k * hzPerBin;
        if (hz >= lo && hz < hi) inBand += p;
      }
    }
  }
  return total > 0 ? inBand / total : 0;
}
(async () => {
  const v = await decodeAudio(path.join(DIR, `${NAME}.vocals.wav`));
  const nv = await decodeAudio(path.join(DIR, `${NAME}.non_vocals.wav`));
  const sr = v.sampleRate;
  const n = Math.min(v.numFrames, nv.numFrames);
  const mix = new Float32Array(n);
  for (let i = 0; i < n; i++) mix[i] = v.channels[0][i] + nv.channels[0][i];
  const rms = (a) => {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * a[i];
    return Math.sqrt(s / a.length);
  };
  console.log(`采样率 ${sr}  时长 ${(n / sr).toFixed(1)}s`);
  console.log(`整体 RMS:  mix=${rms(mix).toFixed(5)}  vocals=${rms(v.channels[0].subarray(0, n)).toFixed(5)}  nonVocals=${rms(nv.channels[0].subarray(0, n)).toFixed(5)}`);
  const WIN = 16384;
  const count = Math.max(1, Math.min(24, Math.floor(n / WIN)));
  const pick = (ch) => {
    const out = [];
    for (let i = 0; i < count; i++) {
      const off = Math.floor(i * (n - WIN) / Math.max(1, count - 1));
      out.push(ch.subarray(off, off + WIN));
    }
    return out;
  };
  const bands = [[0, 150], [150, 400], [400, 1e3], [1e3, 4e3], [4e3, 8e3], [8e3, sr / 2]];
  const rows = [
    ["vocals", bandBands(pick(v.channels[0]), v.channels[0])],
    ["nonVocals", bandBands(pick(nv.channels[0]), nv.channels[0])],
    ["mix", bandBands(pick(mix), mix)]
  ];
  function bandBands(wins, _ref) {
    return bands.map(([lo, hi]) => bandFraction(wins, sr, lo, hi));
  }
  console.log("\n频带能量占比:");
  console.log("  频带(Hz)      " + rows.map((r) => r[0].padStart(10)).join(""));
  for (let b = 0; b < bands.length; b++) {
    const label = `${bands[b][0]}-${bands[b][1]}`;
    console.log("  " + label.padEnd(14) + rows.map((r) => (r[1][b] * 100).toFixed(2).padStart(9) + "%").join(""));
  }
  const step = sr * 5;
  console.log("\n每 5 秒 RMS（mix / vocals）:");
  let line = "";
  for (let s = 0; s + step <= n; s += step) {
    line += `${rms(mix.subarray(s, s + step)).toFixed(3)}/${rms(v.channels[0].subarray(s, s + step)).toFixed(3)}  `;
    if (line.length > 110) {
      console.log("  " + line);
      line = "";
    }
  }
  if (line) console.log("  " + line);
})();
