"use strict";
const { readOnnxMetadata, parseUvrMeta } = require("../src/onnx-meta");
const { requireDep } = require("../src/deps");
const { decodeAudio } = require("../src/decode");
const { Stft, IStft } = require("../src/stft");
const { FFT } = require("../src/fft");
const MODEL = process.argv[2] || require("path").join(__dirname, "..", "models", "UVR-MDX-NET-Voc_FT.onnx");
const AUDIO = process.argv[3] || "";
if (!AUDIO || !require("fs").existsSync(AUDIO)) {
  console.error("用法: node test/inspect.js [模型.onnx] <音频文件>");
  process.exit(1);
}
(async () => {
  console.log("=== 1) ONNX metadata_props ===");
  const props = readOnnxMetadata(MODEL);
  for (const k of Object.keys(props).sort()) console.log(`  ${k} = ${props[k]}`);
  console.log("\n=== 2) onnxruntime session ===");
  const ort = requireDep("onnxruntime-node");
  const t0 = Date.now();
  const sess = await ort.InferenceSession.create(MODEL, { executionProviders: ["cpu"], graphOptimizationLevel: "all" });
  console.log(`  loaded in ${Date.now() - t0} ms`);
  console.log("  inputNames :", sess.inputNames.join(", "));
  console.log("  outputNames:", sess.outputNames.join(", "));
  for (const key of ["inputMetadata", "outputMetadata"]) {
    try {
      if (sess[key]) console.log(`  ${key}:`, JSON.stringify(sess[key]));
    } catch (e) {
      console.log(`  ${key}: (error ${e.message})`);
    }
  }
  const shapeOf = (meta2) => {
    const pick = (o) => o && o.dim ? o.dim.map(Number) : o && o.shape ? o.shape.map(Number) : null;
    return { input: pick(meta2.inputMetadata && meta2.inputMetadata[0]) || pick(meta2.inputMetadata), output: pick(meta2.outputMetadata) };
  };
  let shapes = null;
  try {
    shapes = shapeOf(sess);
  } catch (e) {
  }
  console.log("\n=== 3) 推导出的推理参数 ===");
  const meta = parseUvrMeta(props, shapes);
  console.log(" ", JSON.stringify(meta, null, 2).replace(/\n/g, "\n  "));
  console.log("\n=== 4) 真实 mp3 解码 ===");
  const t1 = Date.now();
  const audio = await decodeAudio(AUDIO);
  const sec = audio.numFrames / audio.sampleRate;
  console.log(`  ${AUDIO}`);
  console.log(`  sampleRate=${audio.sampleRate} channels=${audio.numChannels} frames=${audio.numFrames} duration=${sec.toFixed(2)}s  decode=${Date.now() - t1}ms`);
  console.log(`  channelData types: ${audio.channels.map((c) => c.constructor.name).join(", ")}`);
  let peak = 0;
  for (const c of audio.channels) for (let i = 0; i < c.length; i++) {
    const a = Math.abs(c[i]);
    if (a > peak) peak = a;
  }
  console.log(`  peak=${peak.toFixed(4)}`);
  console.log("\n=== 5) FFT 尺寸可达性 ===");
  try {
    const f = new FFT(meta.nFft);
    console.log(`  FFT(${meta.nFft}) ok, factors=[${f.factors}]`);
  } catch (e) {
    console.log("  FFT FAILED:", e.message);
  }
  const cfg = { n_fft: meta.nFft, hop_length: meta.hopLength, win_length: meta.winLength, window_type: meta.windowType, center: meta.center };
  const st = new Stft(cfg);
  console.log(`  window[0..3]=[${Array.from(st.window.slice(0, 4)).map((v) => v.toFixed(4))}]  win[1]=${st.window[1].toFixed(6)} (周期 hann 期望 ${(0.5 - 0.5 * Math.cos(2 * Math.PI / meta.nFft)).toFixed(6)})`);
})();
