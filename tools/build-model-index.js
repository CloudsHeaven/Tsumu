"use strict";
const fs = require("fs");
const path = require("path");
const MANUAL = {
  maou: {

    labels: [
      { ifAny: ["短发", "罗马卷", "丸子头"], label: "发型", key: "l2d.slot.hair" },
      { ifAny: ["手柄", "看书", "麦克风", "水晶球", "抱手臂", "提裙子"], label: "手中道具 / 姿势", key: "l2d.slot.prop" },
      { ifAny: ["大小变-小", "大小变-中"], label: "体型", key: "l2d.slot.body" }
    ],

    join: {

    },

    exclude: ["大小变-小", "大小变-中"]
  }
};
function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function listFiles(dir, re) {
  return fs.readdirSync(dir).filter((f) => re.test(f)).sort();
}
function loadParamNames(dir, modelStem) {
  const out = {};
  const f = listFiles(dir, /\.cdi3\.json$/)[0];
  if (!f) return out;
  try {
    const j = readJson(path.join(dir, f));
    (j.Parameters || []).forEach((p) => {
      out[p.Id] = p.Name || "";
    });
  } catch (e) {
  }
  return out;
}
function prefixUnion(names, union) {
  for (let i = 0; i < names.length; i++) {
    for (let k = i + 1; k < names.length; k++) {
      const a = names[i], b = names[k];
      let n = 0;
      while (n < a.length && n < b.length && a[n] === b[n]) n++;
      const pre = a.slice(0, n);
      if (n >= 2 && (n >= 3 || pre === a || pre === b)) union(a, b);
    }
  }
}
function deriveModifiers(exprs) {
  const names = exprs.map((e) => e.id);
  const mods = [];
  names.forEach((a) => {
    let best = null;
    names.forEach((b) => {
      if (a === b) return;
      if (a.length > b.length && a.indexOf(b) === 0) {
        if (!best || b.length > best.length) best = b;
      }
    });
    if (best) mods.push({ name: a, base: best });
  });
  return mods;
}
function deriveSlots(exprs) {
  const byVal = {};
  exprs.forEach((e) => e.params.forEach((p) => {
    byVal[p.id] = byVal[p.id] || {};
    (byVal[p.id][p.value] = byVal[p.id][p.value] || []).push(e.id);
  }));
  const hard = [];
  Object.keys(byVal).forEach((pid) => {
    const vals = Object.keys(byVal[pid]);
    if (vals.length < 2) return;
    const groups2 = vals.map((v) => byVal[pid][v]);
    for (let i = 0; i < groups2.length; i++) {
      for (let k = i + 1; k < groups2.length; k++) {
        groups2[i].forEach((a) => groups2[k].forEach((b) => hard.push([a, b])));
      }
    }
  });
  const shared = {};
  Object.keys(byVal).forEach((pid) => {
    const vals = Object.keys(byVal[pid]);
    const users = vals.reduce((n, v) => n + byVal[pid][v].length, 0);
    if (users >= 2 && vals.length === 1) shared[pid] = true;
  });
  const parent = {};
  exprs.forEach((e) => {
    parent[e.id] = e.id;
  });
  const find = (a) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  hard.forEach(([a, b]) => union(a, b));
  prefixUnion(exprs.map((e) => e.id), union);
  const sigOf = {};
  exprs.forEach((e) => {
    sigOf[e.id] = e.params.filter((p) => shared[p.id]).map((p) => p.id).sort().join("|");
  });
  const sigs = [...new Set(Object.values(sigOf))].filter((s) => s);
  const sigSets = sigs.map((s) => ({ s, set: new Set(s.split("|")) }));
  sigs.forEach((s) => {
    const ids = exprs.filter((e) => sigOf[e.id] === s).map((e) => e.id);
    for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
  });
  for (let i = 0; i < sigSets.length; i++) {
    for (let k = i + 1; k < sigSets.length; k++) {
      const a = sigSets[i].set, b = sigSets[k].set;
      let sub = true, sup = true;
      a.forEach((x) => {
        if (!b.has(x)) sub = false;
      });
      b.forEach((x) => {
        if (!a.has(x)) sup = false;
      });
      if (sub || sup) {
        const idsA = exprs.filter((e) => sigOf[e.id] === sigSets[i].s).map((e) => e.id);
        const idsB = exprs.filter((e) => sigOf[e.id] === sigSets[k].s).map((e) => e.id);
        if (idsA[0] && idsB[0]) union(idsA[0], idsB[0]);
      }
    }
  }
  const groups = {};
  exprs.forEach((e) => {
    const r = find(e.id);
    (groups[r] = groups[r] || []).push(e.id);
  });
  return Object.values(groups).filter((g) => g.length >= 2);
}
function autoLabel(members, sigParams, paramNames) {
  let pre = members[0];
  members.slice(1).forEach((m) => {
    let i = 0;
    while (i < pre.length && i < m.length && pre[i] === m[i]) i++;
    pre = pre.slice(0, i);
  });
  pre = pre.replace(/[-_0-9LRA-Za-z]+$/, "");
  if (pre.length >= 2) return pre;
  const names = sigParams.map((p) => paramNames[p]).filter(Boolean).slice(0, 2);
  return names.length ? names.join(" / ") : "（未命名组）";
}
function build(dir) {
  const modelDir = path.resolve(dir);
  const folder = path.basename(modelDir);
  const modelJsonFile = listFiles(modelDir, /\.model3\.json$/)[0];
  if (!modelJsonFile) throw new Error("目录里找不到 .model3.json: " + modelDir);
  const modelJson = readJson(path.join(modelDir, modelJsonFile));
  const stem = modelJsonFile.replace(/\.model3\.json$/, "");
  const fr = modelJson.FileReferences || {};
  const paramNames = loadParamNames(modelDir, stem);
  const manual0 = MANUAL[folder] || {};
  const excluded = {};
  (manual0.exclude || []).forEach((n) => {
    excluded[n] = 1;
  });
  const exprs = [];
  listFiles(modelDir, /\.exp3\.json$/).forEach((f) => {
    const j = readJson(path.join(modelDir, f));
    const id = f.replace(/\.exp3\.json$/, "");
    if (excluded[id]) return;
    exprs.push({
      id,
      name: id,
      file: f,
      params: (j.Parameters || []).map((p) => ({
        id: p.Id,
        name: paramNames[p.Id] || "",
        value: p.Value,
        blend: p.Blend || "Add"
      })),
      fadeIn: j.FadeInTime != null ? j.FadeInTime : null
    });
  });
  const motions = [];
  listFiles(modelDir, /\.motion3\.json$/).forEach((f) => {
    const j = readJson(path.join(modelDir, f));
    const curves = j.Curves || [];
    const seen = {};
    curves.forEach((c) => {
      if (c.Target === "Parameter" && !seen[c.Id]) seen[c.Id] = 1;
    });
    motions.push({
      id: f.replace(/\.motion3\.json$/, ""),
      name: f.replace(/\.motion3\.json$/, ""),
      file: f,
      duration: j.Meta && j.Meta.Duration || 0,
      loop: !!(j.Meta && j.Meta.Loop),
      params: Object.keys(seen).map((pid) => ({ id: pid, name: paramNames[pid] || "" }))
    });
  });
  const manual = MANUAL[folder] || {};
  const mods = deriveModifiers(exprs);
  const modNames = {};
  mods.forEach((m) => {
    modNames[m.name] = m.base;
  });
  const base = exprs.filter((e) => !modNames[e.id]);
  const groups = deriveSlots(base);
  if (manual.join) {
    Object.keys(manual.join).forEach((member) => {
      const anchor = manual.join[member];
      const g = groups.find((x) => x.indexOf(anchor) >= 0);
      if (g && g.indexOf(member) < 0) g.push(member);
    });
  }
  const slots = groups.map((members, i) => {
    members.sort();
    const sig = {};
    exprs.filter((e) => members.indexOf(e.id) >= 0).forEach((e) => e.params.forEach((p) => {
      sig[p.id] = 1;
    }));
    const common = Object.keys(sig).filter((pid) => members.every((m) => {
      const e = exprs.find((x) => x.id === m);
      return e && e.params.some((p) => p.id === pid);
    }));
    const hit = (manual.labels || []).find((l) => l.ifAny.some((n) => members.indexOf(n) >= 0));
    return {
      id: "slot" + (i + 1),
      label: hit && hit.label || autoLabel(members, common, paramNames),

      labelKey: hit && hit.key || null,
      members,
      sharedParams: common.map((pid) => ({ id: pid, name: paramNames[pid] || "" }))
    };
  });
  const slotOf = {};
  slots.forEach((s) => s.members.forEach((m) => {
    slotOf[m] = s.id;
  }));
  exprs.forEach((e) => {
    e.slot = slotOf[e.id] || null;
    if (modNames[e.id]) e.base = modNames[e.id];
  });
  let prevVerified = null, prevAt = null;
  try {
    const old = JSON.parse(fs.readFileSync(path.join(modelDir, "tsumu.index.json"), "utf8"));
    if (old && old.expressions) {
      prevVerified = {};
      old.expressions.forEach((e) => {
        if (e.verified) prevVerified[e.name || e.id] = e.verified;
      });
      prevAt = old.verifiedAt || null;
    }
  } catch (e) {
    prevVerified = null;
  }
  if (prevVerified) {
    let carried = 0;
    exprs.forEach((e) => {
      if (prevVerified[e.id]) {
        e.verified = prevVerified[e.id];
        carried++;
      }
    });
    exprs.forEach((e) => {
      if (!e.verified) return;
      const v = e.verified;
      delete e.verified;
      e.verified = v;
    });
    if (carried) console.log("（保留已有实测数据 " + carried + " 条）");
  }
  return {
    version: 1,
    generatedBy: "tsumu/tools/build-model-index.js",
    model: stem,
    source: {
      model3: modelJsonFile,
      declaredExpressions: (fr.Expressions || []).length,
      declaredMotions: Object.keys(fr.Motions || {}).length,
      scanned: true
    },
    slots,
    modifiers: mods,
    expressions: exprs,
    motions,
    verifiedAt: prevAt || null
  };
}
if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("用法: node tools/build-model-index.js <模型目录> [--check]");
    process.exit(1);
  }
  const checkOnly = process.argv.indexOf("--check") >= 0;
  let idx;
  try {
    idx = build(dir);
  } catch (e) {
    console.error("失败: " + e.message);
    process.exit(1);
  }
  console.log("模型: " + idx.model + "   （model3.json 声明: 表情 " + idx.source.declaredExpressions + " 个 / 动作组 " + idx.source.declaredMotions + " 个）");
  console.log("");
  console.log("槽位（互斥组）:");
  idx.slots.forEach((s) => {
    console.log("  [" + s.label + "]  " + s.members.join(" / "));
    console.log("      共享参数: " + s.sharedParams.map((p) => p.id + (p.name ? "(" + p.name + ")" : "")).join(", "));
  });
  console.log("");
  console.log("不成组的（可独立叠加）: " + idx.expressions.filter((e) => !e.slot && !e.base).map((e) => e.name).join(" / "));
  if (idx.modifiers.length) {
    console.log("");
    console.log("修饰项（必须先开基础项，否则单独播没有效果）:");
    idx.modifiers.forEach((m) => console.log("  " + m.name + "  ← 需要先开「" + m.base + "」"));
  }
  console.log("");
  console.log("表情 " + idx.expressions.length + " 个，动作 " + idx.motions.length + " 个:");
  idx.motions.forEach((m) => console.log("  动作 " + m.name + "  " + m.duration + "s  循环=" + m.loop + "  参数 " + m.params.length + " 个"));
  if (checkOnly) {
    console.log("\n（--check：没有写文件）");
    process.exit(0);
  }
  const out = path.join(path.resolve(dir), "tsumu.index.json");
  fs.writeFileSync(out, JSON.stringify(idx, null, 1) + "\n", "utf8");
  console.log("\n已写出: " + out + "  (" + fs.statSync(out).size + " 字节)");
}
module.exports = { build };
