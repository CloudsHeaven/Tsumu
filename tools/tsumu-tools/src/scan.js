"use strict";
const fs = require("fs");
const path = require("path");
const { SUPPORTED } = require("./decode");
function isDerived(name) {
  return /\.(vocals|non_vocals|accompaniment|instrumental)\./i.test(name) || /\.env$/i.test(name);
}
function collectInputs(p) {
  const st = fs.statSync(p);
  if (st.isFile()) return [p];
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (SUPPORTED.includes(path.extname(e.name).toLowerCase()) && !isDerived(e.name)) out.push(full);
    }
  };
  walk(p);
  return out.sort();
}
function findModel(explicit) {
  if (explicit) {
    if (!fs.existsSync(explicit)) throw new Error("模型不存在: " + explicit);
    return explicit;
  }
  const d = path.join(__dirname, "..", "models");
  if (!fs.existsSync(d)) throw new Error("找不到 models 目录: " + d);
  const hit = fs.readdirSync(d).filter((f) => f.toLowerCase().endsWith(".onnx")).sort();
  if (!hit.length) throw new Error("models 目录里没有 .onnx 模型: " + d);
  return path.join(d, hit[0]);
}
function outputsFor(file) {
  const dir = path.dirname(file);
  const base = path.basename(file).replace(/\.[^.]+$/, "");
  return {
    dir,
    base,
    envPath: path.join(dir, `${base}.vocals.env`),
    wavPath: path.join(dir, `${base}.vocals.wav`),
    accPath: path.join(dir, `${base}.non_vocals.wav`)
  };
}
function describe(file) {
  const o = outputsFor(file);
  const st = fs.statSync(file);
  const hasEnv = fs.existsSync(o.envPath);
  const hasWav = fs.existsSync(o.wavPath);
  return {
    path: file,
    name: path.basename(file),
    dir: path.dirname(file),
    base: o.base,
    size: st.size,
    hasEnv,
    hasWav,

    done: hasEnv && hasWav
  };
}
module.exports = { isDerived, collectInputs, findModel, outputsFor, describe, SUPPORTED };
