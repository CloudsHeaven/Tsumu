"use strict";
const fs = require("fs");
function encodeWav16(channels, sampleRate) {
  const numCh = channels.length;
  const numFrames = channels[0].length;
  for (const c of channels) if (c.length !== numFrames) throw new Error("wav: channel length mismatch");
  const dataBytes = numFrames * numCh * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(numCh, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * numCh * 2, 28);
  buf.writeUInt16LE(numCh * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataBytes, 40);
  let o = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numCh; c++) {
      let v = channels[c][i];
      v = v < -1 ? -1 : v > 1 ? 1 : v;
      buf.writeInt16LE(Math.round(v * 32767), o);
      o += 2;
    }
  }
  return buf;
}
function writeWav16(file, channels, sampleRate) {
  fs.writeFileSync(file, encodeWav16(channels, sampleRate));
}
function writeWavFloat32(file, channels, sampleRate) {
  const numCh = channels.length;
  const numFrames = channels[0].length;
  const dataBytes = numFrames * numCh * 4;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20);
  buf.writeUInt16LE(numCh, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * numCh * 4, 28);
  buf.writeUInt16LE(numCh * 4, 32);
  buf.writeUInt16LE(32, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataBytes, 40);
  let o = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numCh; c++) {
      buf.writeFloatLE(channels[c][i], o);
      o += 4;
    }
  }
  fs.writeFileSync(file, buf);
}
module.exports = { encodeWav16, writeWav16, writeWavFloat32 };
