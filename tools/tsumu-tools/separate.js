#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const { readOnnxMetadata, parseUvrMeta } = require("./src/onnx-meta");
const { requireDep } = require("./src/deps");
const { decodeAudio } = require("./src/decode");
const { collectInputs, findModel, outputsFor } = require("./src/scan");
const { UvrSeparator } = require("./src/uvr");
const { writeWav16 } = require("./src/wav");
const { resample, toMono } = require("./src/resample");
const { computeEnvelope, writeEnv } = require("./src/env");
const APP_SAMPLE_RATE = 16e3;
function parseArgs(argv) {
  const o = { inputs: [], model: null, gpu: false, threads: 0, stems: false, force: false, envRate: 60, list: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--model") o.model = argv[++i];
    else if (a === "--gpu") o.gpu = true;
    else if (a === "--threads") o.threads = Number(argv[++i]);
    else if (a === "--stems") o.stems = true;
    else if (a === "--force") o.force = true;
    else if (a === "--env-rate") o.envRate = Number(argv[++i]);
    else if (a === "--list") o.list = true;
    else if (a.startsWith("--")) throw new Error("unknown option: " + a);
    else o.inputs.push(a);
  }
  return o;
}
function fmtBytes(n) {
  return (n / 1048576).toFixed(2) + " MB";
}
(async () => {
  const opt = parseArgs(process.argv.slice(2));
  if (!opt.inputs.length) {
    console.log(fs.readFileSync(__filename, "utf8").split("*/")[0].replace(/^\/\*\*?|\s*\*\s?/gm, "").trim());
    process.exit(1);
  }
  const model = findModel(opt.model);
  const meta = parseUvrMeta(readOnnxMetadata(model), null);
  const files = opt.inputs.flatMap(collectInputs);
  console.log(`模型 : ${path.basename(model)}   n_fft=${meta.nFft} dim_f=${meta.dimF} dim_t=${meta.dimT} hop=${meta.hopLength}`);
  console.log(`后端 : ${opt.gpu ? "DirectML (GPU)" : "CPU"}${opt.threads ? `  threads=${opt.threads}` : ""}`);
  console.log(`待处理: ${files.length} 个文件`);
  if (opt.list) {
    files.forEach((f) => console.log("  " + f));
    return;
  }
  if (!files.length) return;
  const started = Date.now();
  let done = 0, skipped = 0, failed = 0;
  let sess = null, sep = null;
  const ensureModel = async () => {
    if (sess) return;
    const ort = requireDep("onnxruntime-node");
    const sessOpts = {
      executionProviders: opt.gpu ? ["dml", "cpu"] : ["cpu"],
      graphOptimizationLevel: "all"
    };
    if (opt.threads) sessOpts.intraOpNumThreads = opt.threads;
    sess = await ort.InferenceSession.create(model, sessOpts);
    sep = new UvrSeparator(meta, ort, sess);
  };
  for (const file of files) {
    const { dir, base, envPath, wavPath, accPath } = outputsFor(file);
    if (!opt.force && fs.existsSync(envPath) && fs.existsSync(wavPath)) {
      console.log(`跳过（已存在，--force 可重算）: ${base}`);
      skipped++;
      continue;
    }
    const t0 = Date.now();
    try {
      await ensureModel();
      const audio = await decodeAudio(file);
      if (audio.channels.length === 1) audio.channels.push(audio.channels[0]);
      let input = audio;
      if (audio.sampleRate !== meta.sampleRate) {
        console.log(`  重采样 ${audio.sampleRate} -> ${meta.sampleRate}`);
        input = resample(audio.channels, audio.sampleRate, meta.sampleRate);
      }
      process.stdout.write(`分离中 ${base}  (${(audio.numFrames / audio.sampleRate).toFixed(1)}s)`);
      const res = await sep.separate(input, (i, n) => {
        process.stdout.write(`\r分离中 ${base}  块 ${i}/${n}  ${((Date.now() - t0) / 1e3).toFixed(0)}s   `);
      });
      const monoSrc = toMono(res.vocals);
      const mono16 = res.sampleRate === APP_SAMPLE_RATE ? monoSrc : resample([monoSrc], res.sampleRate, APP_SAMPLE_RATE).channels[0];
      writeWav16(wavPath, [mono16], APP_SAMPLE_RATE);
      const env = computeEnvelope(mono16, APP_SAMPLE_RATE, opt.envRate);
      writeEnv(envPath, env);
      if (opt.stems) {
        const accMono = toMono(res.nonVocals);
        const acc16 = resample([accMono], res.sampleRate, APP_SAMPLE_RATE).channels[0];
        writeWav16(accPath, [acc16], APP_SAMPLE_RATE);
      }
      done++;
      const el = (Date.now() - t0) / 1e3;
      console.log(`\r完成 ${base}  ${el.toFixed(1)}s  RTF=${(el / (audio.numFrames / audio.sampleRate)).toFixed(2)}  env=${fmtBytes(fs.statSync(envPath).size)} wav=${fmtBytes(fs.statSync(wavPath).size)}   `);
    } catch (e) {
      failed++;
      console.log(`
失败 ${base}: ${e.message}`);
      if (process.env.TSUMU_TOOLS_DEBUG) console.error(e.stack);
    }
  }
  const total = (Date.now() - started) / 1e3;
  console.log(`
合计 ${done} 成功 / ${skipped} 跳过 / ${failed} 失败   总耗时 ${total.toFixed(1)}s`);
  if (sep) {
    const t = sep.timings;
    console.log(`分项: stft=${(t.stft / 1e3).toFixed(1)}s  onnx=${(t.onnx / 1e3).toFixed(1)}s  istft=${(t.istft / 1e3).toFixed(1)}s`);
  }
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("错误: " + e.message);
  if (process.env.TSUMU_TOOLS_DEBUG) console.error(e.stack);
  process.exit(2);
});
