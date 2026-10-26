"use strict";
const fs = require("fs");
const path = require("path");
const { readOnnxMetadata, parseUvrMeta } = require("../src/onnx-meta");
const { requireDep } = require("../src/deps");
const { decodeAudio } = require("../src/decode");
const { UvrSeparator } = require("../src/uvr");
const { writeWav16, writeWavFloat32 } = require("../src/wav");
const { resample } = require("../src/resample");
const MODEL = process.env.TSUMU_MODEL || path.join(__dirname, "..", "models", "UVR-MDX-NET-Voc_FT.onnx");
const AUDIO = process.env.TSUMU_AUDIO || process.argv[2] || "";
const OUT = path.join(__dirname, "..", "out");
const PROVIDER = process.env.TSUMU_PROVIDER || "cpu";
if (!AUDIO || !fs.existsSync(AUDIO)) {
  console.error("用法: node test/separate.js <音频文件>   [TSUMU_SECONDS=40 可只跑前 N 秒]");
  process.exit(1);
}
function rms(a, from, to) {
  let s = 0;
  const n = Math.min(to, a.length) - from;
  for (let i = from; i < to && i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s / Math.max(1, n));
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const props = readOnnxMetadata(MODEL);
  const meta = parseUvrMeta(props, null);
  console.log(`model   : ${path.basename(MODEL)}  n_fft=${meta.nFft} dim_f=${meta.dimF} dim_t=${meta.dimT} hop=${meta.hopLength} sr=${meta.sampleRate}`);
  const ort = requireDep("onnxruntime-node");
  const t0 = Date.now();
  const sessOpts = {
    executionProviders: PROVIDER === "dml" ? ["dml", "cpu"] : ["cpu"],
    graphOptimizationLevel: "all"
  };
  const threads = Number(process.env.TSUMU_THREADS || 0);
  if (threads > 0) sessOpts.intraOpNumThreads = threads;
  const sess = await ort.InferenceSession.create(MODEL, sessOpts);
  console.log(`provider: ${PROVIDER}   load=${Date.now() - t0}ms`);
  const ta = Date.now();
  const audioRaw = await decodeAudio(AUDIO);
  let audio = audioRaw;
  const sec = audio.numFrames / audio.sampleRate;
  console.log(`audio   : ${path.basename(AUDIO)}  sr=${audio.sampleRate} ch=${audio.numChannels} dur=${sec.toFixed(2)}s  decode=${Date.now() - ta}ms`);
  if (audio.sampleRate !== meta.sampleRate) {
    const tr = Date.now();
    const rs = resample(audio.channels, audio.sampleRate, meta.sampleRate);
    audio = {
      sampleRate: rs.sampleRate,
      channels: rs.channels,
      numFrames: rs.channels[0].length,
      numChannels: rs.channels.length
    };
    console.log(`重采样 ${audioRaw.sampleRate} -> ${meta.sampleRate}  用时 ${Date.now() - tr}ms`);
  }
  if (process.env.TSUMU_SECONDS) {
    const k = Math.floor(Number(process.env.TSUMU_SECONDS) * audio.sampleRate);
    if (k < audio.numFrames) {
      audio.channels = audio.channels.map((c) => c.subarray(0, k));
      audio.numFrames = k;
      console.log(`!! 截取前 ${process.env.TSUMU_SECONDS}s 做验证`);
    }
  }
  const sep = new UvrSeparator(meta, ort, sess);
  const t1 = Date.now();
  const res = await sep.separate(audio, (i, n) => {
    process.stderr.write(`  chunk ${i}/${n}  ${((Date.now() - t1) / 1e3).toFixed(1)}s\r`);
  });
  process.stderr.write("\n");
  const elapsed = (Date.now() - t1) / 1e3;
  console.log(`
=== 结果 ===`);
  console.log(`  总耗时 ${elapsed.toFixed(2)}s   RTF=${(elapsed / sec).toFixed(3)}`);
  console.log(`  分项: stft=${(sep.timings.stft / 1e3).toFixed(2)}s  onnx=${(sep.timings.onnx / 1e3).toFixed(2)}s  istft=${(sep.timings.istft / 1e3).toFixed(2)}s`);
  console.log(`  chunks=${sep.timings.chunks}  总帧数=${sep.timings.frames}`);
  const v = res.vocals[0], nv = res.nonVocals[0], mix = audio.channels[0];
  console.log(`  长度: mix=${mix.length} vocals=${v.length} nonVocals=${nv.length}`);
  const mid = Math.floor(mix.length / 2);
  const win = 44100;
  console.log(`  中段 1s RMS: mix=${rms(mix, mid, mid + win).toFixed(5)} vocals=${rms(v, mid, mid + win).toFixed(5)} nonVocals=${rms(nv, mid, mid + win).toFixed(5)}`);
  let peakV = 0, peakN = 0;
  for (let i = 0; i < v.length; i++) {
    const a = Math.abs(v[i]);
    if (a > peakV) peakV = a;
  }
  for (let i = 0; i < nv.length; i++) {
    const a = Math.abs(nv[i]);
    if (a > peakN) peakN = a;
  }
  console.log(`  peak: vocals=${peakV.toFixed(4)} nonVocals=${peakN.toFixed(4)}`);
  let maxErr = 0;
  for (let i = 0; i < v.length; i++) {
    const e = Math.abs(v[i] + nv[i] - mix[i]);
    if (e > maxErr) maxErr = e;
  }
  console.log(`  vocals+nonVocals vs mix 最大误差 = ${maxErr.toExponential(2)}`);
  const base = path.join(OUT, path.basename(AUDIO).replace(/\.[^.]+$/, ""));
  writeWav16(`${base}.vocals.wav`, res.vocals, res.sampleRate);
  writeWav16(`${base}.non_vocals.wav`, res.nonVocals, res.sampleRate);
  writeWavFloat32(`${base}.vocals.f32.wav`, res.vocals, res.sampleRate);
  for (const f of [`${base}.vocals.wav`, `${base}.non_vocals.wav`, `${base}.vocals.f32.wav`]) {
    console.log(`  写出 ${f}  ${(fs.statSync(f).size / 1048576).toFixed(1)} MB`);
  }
})();
