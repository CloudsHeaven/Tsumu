"use strict";
const fs = require("fs");
const path = require("path");
const { readOnnxMetadata, parseUvrMeta } = require("../src/onnx-meta");
const { requireDep } = require("../src/deps");
const { decodeAudio } = require("../src/decode");
const { UvrSeparator } = require("../src/uvr");
const { encodeWav16 } = require("../src/wav");
const { resample, toMono } = require("../src/resample");
const { computeEnvelope, encodeEnv } = require("../src/env");
const { collectInputs, findModel, describe, outputsFor } = require("../src/scan");
const APP_SAMPLE_RATE = 16e3;
const FORCE_DELEGATE = process.env.TSUMU_FORCE_DELEGATE === "1";
function send(ev) {
  if (process.send) process.send({ type: "ev", ev });
  else console.log("[ev] " + JSON.stringify(ev));
}
let writeSeq = 0;
const pendingWrites =  new Map();
function delegateWrite(file, buf) {
  return new Promise((resolve, reject) => {
    const id = ++writeSeq;
    pendingWrites.set(id, { resolve, reject });
    process.send({ type: "delegate-write", id, path: file, data: buf });
    setTimeout(() => {
      if (pendingWrites.has(id)) {
        pendingWrites.delete(id);
        reject(new Error("主进程写文件超时: " + file));
      }
    }, 6e4);
  });
}
process.on("message", (m) => {
  if (!m) return;
  if (m.cmd === "run") {
    run(m.opt);
    return;
  }
  if (m.cmd === "write-done") {
    const p = pendingWrites.get(m.id);
    if (!p) return;
    pendingWrites.delete(m.id);
    if (m.ok) p.resolve();
    else p.reject(new Error(m.error || "写文件失败"));
  }
});
async function writeOut(file, buf) {
  if (FORCE_DELEGATE && typeof process.send === "function") {
    await delegateWrite(file, buf);
    return "main(forced)";
  }
  try {
    fs.writeFileSync(file, buf);
    return "worker";
  } catch (e) {
    if ((e.code === "EPERM" || e.code === "EACCES") && typeof process.send === "function") {
      send({ type: "note", text: "worker 写不了（" + e.code + "），改由主进程落盘: " + path.basename(file) });
      await delegateWrite(file, buf);
      return "main";
    }
    throw e;
  }
}
async function run(opt) {
  const started = Date.now();
  let ok = 0, failed = 0, skipped = 0;
  try {
    const model = findModel(process.env.TSUMU_MODEL || null);
    const meta = parseUvrMeta(readOnnxMetadata(model), null);
    const all = collectInputs(opt.dir);
    const todo = [];
    for (const f of all) {
      const d = describe(f);
      if (d.done && !opt.force) {
        skipped++;
        send({ type: "file", name: d.name, status: "skip" });
      } else todo.push(f);
    }
    send({ type: "plan", total: all.length, todo: todo.length, skipped });
    if (!todo.length) {
      send({ type: "done", ok: 0, failed: 0, skipped, seconds: (Date.now() - started) / 1e3, nothing: true });
      return;
    }
    send({ type: "step", text: "加载模型…" });
    const ort = requireDep("onnxruntime-node");
    const sessOpts = {
      executionProviders: opt.gpu ? ["dml", "cpu"] : ["cpu"],
      graphOptimizationLevel: "all"
    };
    if (opt.threads) sessOpts.intraOpNumThreads = opt.threads;
    const sess = await ort.InferenceSession.create(model, sessOpts);
    const sep = new UvrSeparator(meta, ort, sess);
    for (let k = 0; k < todo.length; k++) {
      const file = todo[k];
      const { envPath, wavPath, accPath } = outputsFor(file);
      const name = path.basename(file);
      const t0 = Date.now();
      send({ type: "file", name, index: k + 1, total: todo.length, status: "start" });
      try {
        const audio = await decodeAudio(file);
        if (audio.channels.length === 1) audio.channels.push(audio.channels[0]);
        const duration = audio.numFrames / audio.sampleRate;
        let input = audio;
        if (audio.sampleRate !== meta.sampleRate) {
          send({ type: "step", text: `重采样 ${audio.sampleRate} → ${meta.sampleRate}…` });
          input = resample(audio.channels, audio.sampleRate, meta.sampleRate);
        }
        send({ type: "step", text: `分离中（${duration.toFixed(1)} 秒音频）…`, duration });
        const res = await sep.separate(input, (i, n) => {
          send({ type: "chunk", index: k + 1, total: todo.length, i, n, seconds: (Date.now() - t0) / 1e3 });
        });
        const mono = toMono(res.vocals);
        const mono16 = res.sampleRate === APP_SAMPLE_RATE ? mono : resample([mono], res.sampleRate, APP_SAMPLE_RATE).channels[0];
        const wavBuf = encodeWav16([mono16], APP_SAMPLE_RATE);
        const envBuf = encodeEnv(computeEnvelope(mono16, APP_SAMPLE_RATE, 60));
        const wavBy = await writeOut(wavPath, wavBuf);
        const envBy = await writeOut(envPath, envBuf);
        if (opt.stems) {
          const acc = toMono(res.nonVocals);
          const acc16 = resample([acc], res.sampleRate, APP_SAMPLE_RATE).channels[0];
          await writeOut(accPath, encodeWav16([acc16], APP_SAMPLE_RATE));
        }
        ok++;
        send({
          type: "file-done",
          name,
          seconds: (Date.now() - t0) / 1e3,
          duration,
          envBytes: envBuf.length,
          wavBytes: wavBuf.length,
          writtenBy: envBy === "worker" && wavBy === "worker" ? "worker" : envBy + "/" + wavBy
        });
      } catch (e) {
        failed++;
        send({ type: "file-error", name, message: e.message });
      }
    }
    send({ type: "done", ok, failed, skipped, seconds: (Date.now() - started) / 1e3 });
  } catch (e) {
    send({ type: "error", message: e.message });
  }
}
if (typeof process.send !== "function") {
  const argv = process.argv.slice(2);
  const opt = {
    dir: argv.find((a) => !a.startsWith("--")) || "",
    force: argv.includes("--force"),
    stems: argv.includes("--stems"),
    gpu: argv.includes("--gpu")
  };
  if (!opt.dir) {
    console.error('用法: node electron/worker.js "<音乐文件夹>" [--force] [--stems]');
    process.exit(2);
  }
  run(opt).then(() => process.exit(0)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
