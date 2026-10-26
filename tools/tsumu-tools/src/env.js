"use strict";
const fs = require("fs");
const MAGIC = "TSUMUENV";
const VERSION = 1;
const HEADER_BYTES = 32;
function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx];
}
function computeEnvelope(mono, sampleRate, rateHz = 60) {
  const hop = Math.max(1, Math.round(sampleRate / rateHz));
  const count = Math.max(1, Math.ceil(mono.length / hop));
  const rms = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const s = i * hop;
    const e = Math.min(s + hop, mono.length);
    let acc = 0;
    for (let j = s; j < e; j++) acc += mono[j] * mono[j];
    rms[i] = Math.sqrt(acc / Math.max(1, e - s));
  }
  const sorted = Array.from(rms).sort((a, b) => a - b);
  return {
    rateHz,
    count,
    rms,
    refRms: percentile(sorted, 0.95),
    peakRms: sorted[sorted.length - 1] || 0
  };
}
function encodeEnv(env) {
  const { rateHz, count, rms, refRms, peakRms } = env;
  const buf = Buffer.alloc(HEADER_BYTES + count * 4);
  buf.write(MAGIC, 0, "ascii");
  buf.writeUInt32LE(VERSION, 8);
  buf.writeUInt32LE(rateHz, 12);
  buf.writeUInt32LE(count, 16);
  buf.writeUInt32LE(0, 20);
  buf.writeFloatLE(refRms, 24);
  buf.writeFloatLE(peakRms, 28);
  for (let i = 0; i < count; i++) buf.writeFloatLE(rms[i], HEADER_BYTES + i * 4);
  return buf;
}
function writeEnv(file, env) {
  fs.writeFileSync(file, encodeEnv(env));
}
function readEnv(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString("ascii", 0, 8) !== MAGIC) throw new Error("env: bad magic");
  const version = buf.readUInt32LE(8);
  if (version !== VERSION) throw new Error("env: unsupported version " + version);
  const rateHz = buf.readUInt32LE(12);
  const count = buf.readUInt32LE(16);
  const refRms = buf.readFloatLE(24);
  const peakRms = buf.readFloatLE(28);
  const rms = new Float32Array(count);
  for (let i = 0; i < count; i++) rms[i] = buf.readFloatLE(HEADER_BYTES + i * 4);
  return { rateHz, count, rms, refRms, peakRms, version };
}
module.exports = { computeEnvelope, encodeEnv, writeEnv, readEnv, MAGIC, HEADER_BYTES };
