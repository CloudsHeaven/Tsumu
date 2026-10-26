"use strict";
const fs = require("fs");
const path = require("path");
const { importDep } = require("./deps");
function asMonoOrStereo(channels, sampleRate, extra) {
  const numFrames = channels[0].length;
  for (const c of channels) {
    if (c.length !== numFrames) throw new Error("decode: channel length mismatch");
  }
  return Object.assign({ sampleRate, channels, numFrames, numChannels: channels.length }, extra || {});
}
async function decodeMp3(buf) {
  const mod = await importDep("mpg123-decoder");
  const dec = new mod.MPEGDecoder();
  await dec.ready;
  try {
    const r = dec.decode(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
    const errors = (r.errors || []).map((e) => e && e.message ? e.message : String(e));
    if (!r || !r.channelData || !r.channelData.length || !r.samplesDecoded) {
      throw new Error("decode: mpg123 没解出音频" + (errors.length ? " (" + errors.join("; ") + ")" : ""));
    }
    return asMonoOrStereo(r.channelData, r.sampleRate, { errors });
  } finally {
    dec.free();
  }
}
function decodeWav(buf) {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("decode: not a RIFF/WAVE file");
  }
  let p = 12, fmt = null, data = null;
  while (p + 8 <= buf.length) {
    const id = buf.toString("ascii", p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    const body = p + 8;
    if (id === "fmt ") {
      let format2 = buf.readUInt16LE(body);
      const channels2 = buf.readUInt16LE(body + 2);
      const sampleRate2 = buf.readUInt32LE(body + 4);
      const bits2 = buf.readUInt16LE(body + 14);
      if (format2 === 65534 && size >= 40) format2 = buf.readUInt16LE(body + 24);
      fmt = { format: format2, channels: channels2, sampleRate: sampleRate2, bits: bits2 };
    } else if (id === "data") {
      data = buf.subarray(body, Math.min(body + size, buf.length));
    }
    p = body + size + size % 2;
    if (fmt && data) break;
  }
  if (!fmt || !data) throw new Error("decode: wav missing fmt or data chunk");
  const { format, channels, sampleRate, bits } = fmt;
  const bytesPer = bits / 8;
  const numFrames = Math.floor(data.length / (bytesPer * channels));
  const out = [];
  for (let c = 0; c < channels; c++) out.push(new Float32Array(numFrames));
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < channels; c++) {
      const o = (i * channels + c) * bytesPer;
      let v;
      if (format === 3) v = data.readFloatLE(o);
      else if (bits === 16) v = data.readInt16LE(o) / 32768;
      else if (bits === 24) v = ((data[o] | data[o + 1] << 8 | data[o + 2] << 16 << 8) >> 8) / 8388608;
      else if (bits === 32) v = data.readInt32LE(o) / 2147483648;
      else throw new Error("decode: unsupported wav bits " + bits);
      out[c][i] = v;
    }
  }
  return asMonoOrStereo(out, sampleRate, { bits, format });
}
const SUPPORTED = [".mp3", ".wav", ".mpeg", ".mpga"];
async function decodeAudio(file) {
  if (!fs.existsSync(file)) throw new Error("decode: file not found: " + file);
  const ext = path.extname(file).toLowerCase();
  const buf = fs.readFileSync(file);
  if (ext === ".wav") return decodeWav(buf);
  if (ext === ".mp3" || ext === ".mpeg" || ext === ".mpga") return decodeMp3(buf);
  throw new Error(`decode: unsupported extension "${ext}" (supported: ${SUPPORTED.join(" ")})`);
}
module.exports = { decodeAudio, decodeMp3, decodeWav, SUPPORTED };
