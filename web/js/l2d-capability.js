"use strict";
(function(global) {
  var D = typeof document !== "undefined";
  var EMOTION_EXPR = [
    { our: "laugh", label: "大笑", file: "捂嘴" },
    { our: "tease", label: "卖关子", file: "嘘" },
    { our: "sad", label: "难过", file: "流泪" },
    { our: "shy", label: "害羞", file: "脸红" },
    { our: "angry", label: "生气", file: "抱手臂" },
    { our: "tired", label: "疲惫", file: "熬夜" },
    { our: "thinking", label: "沉思", file: "看书" }
  ];
  var POSE_PROP = [
    { forWhat: "音乐借姿势", file: "麦克风" },
    { forWhat: "ASMR 借姿势", file: "提裙子" },
    { forWhat: "天气道具", file: "水晶球" },
    { forWhat: "联网检索道具", file: "看书" }
  ];
  var MOTION_DEP = [
    { forWhat: "番茄钟睡着动作", name: "sleep" },
    { forWhat: "crying 的循环动作", name: '(名含"流泪"或"汗"的动作)' }
  ];
  var STD_PARAMS = [
    { id: "ParamEyeLOpen", feature: "眨眼" },
    { id: "ParamEyeROpen", feature: "眨眼" },
    { id: "ParamMouthOpenY", feature: "口型随语音张合" },
    { id: "ParamEyeBallX", feature: "视线跟随（左右）" },
    { id: "ParamEyeBallY", feature: "视线跟随（上下）" },
    { id: "ParamAngleX", feature: "头部摆动 / 呼吸" },
    { id: "ParamAngleY", feature: "头部摆动 / 呼吸" },
    { id: "ParamAngleZ", feature: "头部摆动 / 呼吸" },
    { id: "ParamBodyAngleX", feature: "身体摆动 / 呼吸" },
    { id: "ParamBreath", feature: "呼吸" }
  ];
  var FACE_PARAMS = [
    { id: "ParamMouthForm", feature: "笑容嘴形（开心）" },
    { id: "ParamEyeLSmile", feature: "笑眼（开心）" },
    { id: "ParamEyeRSmile", feature: "笑眼（开心）" },
    { id: "Param163", feature: "张嘴五官联动（惊讶 · 本模型自定义）", custom: true }
  ];
  function toSet(list) {
    var s = {};
    (Array.isArray(list) ? list : []).forEach(function(x) {
      if (x) s[String(x)] = true;
    });
    return s;
  }
  function has(hay, needle) {
    return Object.prototype.hasOwnProperty.call(hay, needle);
  }
  function report(info) {
    var out = {
      ready: !!(info && info.ready),
      model: info && info.model || "",
      paramCount: info && info.paramCount || 0,
      expressionCount: info && info.expressions && info.expressions.length || 0,
      motionCount: info && info.motions && info.motions.length || 0,
      textures: info && info.textures || null,
      slots: info && info.slots || [],
      fromIndex: !!(info && info.fromIndex),
      area: [],

      summary: {}
    };
    if (!info) {
      out.summary = { auto: 0, face: 0, missing: 0, params: 0 };
      return out;
    }
    var params = toSet(info.params);
    var exprs = toSet(info.expressions);
    var motionText = (info.motions || []).join(" | ");
    var autoOk = [], autoMissing = [];
    var seenFeature = {};
    STD_PARAMS.forEach(function(p) {
      if (seenFeature[p.feature]) return;
      seenFeature[p.feature] = true;
      var hasAll = true, any = false;
      STD_PARAMS.forEach(function(q) {
        if (q.feature !== p.feature) return;
        any = true;
        if (!has(params, q.id)) hasAll = false;
      });
      if (any && hasAll) autoOk.push(p.feature);
      else autoMissing.push(p.feature);
    });
    out.area.push({
      key: "auto",
      title: "通用参数（标准参数，多数模型具备）",
      ok: autoOk,
      missing: autoMissing
    });
    var faceOk = [], faceMissing = [];
    FACE_PARAMS.forEach(function(p) {
      if (has(params, p.id)) faceOk.push(p.feature);
      else faceMissing.push(p.feature);
    });
    out.area.push({
      key: "face",
      title: "表情参数（按本项目参数命名）",
      ok: faceOk,
      missing: faceMissing
    });
    var exprOk = [], exprMissing = [];
    EMOTION_EXPR.forEach(function(e) {
      var hit = has(exprs, e.file);
      if (hit) exprOk.push(e.label + "（" + e.file + "）");
      else exprMissing.push(e.label + "（需同名差分「" + e.file + "」）");
    });
    out.area.push({
      key: "emotion",
      title: "情绪差分（需模型内含同名差分）",
      ok: exprOk,
      missing: exprMissing,
      note: "缺少对应差分时，该情绪仅以脸部参数表现，不报错"
    });
    var propOk = [], propMissing = [];
    POSE_PROP.forEach(function(p) {
      if (has(exprs, p.file)) propOk.push(p.forWhat + "（" + p.file + "）");
      else propMissing.push(p.forWhat + "（需「" + p.file + "」）");
    });
    out.area.push({
      key: "prop",
      title: "道具与借姿势（按名称匹配）",
      ok: propOk,
      missing: propMissing
    });
    var moOk = [], moMissing = [];
    if (/sleep/i.test(motionText)) moOk.push("番茄钟睡眠动作（sleep）");
    else moMissing.push("番茄钟睡眠动作（需名为 sleep 的动作）");
    if (/流泪|汗/.test(motionText)) moOk.push("crying 循环动作（名称含「流泪」或「汗」）");
    else moMissing.push("crying 循环动作（需名称含「流泪」或「汗」）");
    out.area.push({
      key: "motion",
      title: "特定动作（按动作名匹配）",
      ok: moOk,
      missing: moMissing
    });
    var hairOk = out.slots.some(function(s) {
      return /发型/.test(String(s)) && !/\(0\)/.test(String(s));
    });
    out.area.push({
      key: "hair",
      title: "发型槽位",
      ok: hairOk ? ["具备发型槽（设置页显示「发型」）"] : [],
      missing: hairOk ? [] : ["无发型槽 ⇒ 设置页的「发型」整节隐藏"]
    });
    out.area.push({
      key: "index",
      title: "模型清单（tsumu.index.json）",
      ok: out.fromIndex ? ["已提供清单（表情/动作/槽位信息完整）"] : [],
      missing: out.fromIndex ? [] : ["未提供清单 ⇒ 表情/动作面板可能列不全（回退读取 model3.json）"]
    });
    var okAll = 0, missAll = 0;
    out.area.forEach(function(a) {
      okAll += a.ok.length;
      missAll += a.missing.length;
    });
    out.summary = {
      auto: autoOk.length,
      autoMissing: autoMissing.length,
      face: faceOk.length,
      faceMissing: faceMissing.length,
      ok: okAll,
      missing: missAll,
      params: out.paramCount,
      expressions: out.expressionCount,
      motions: out.motionCount
    };
    return out;
  }
  var API = { report, EMOTION_EXPR, POSE_PROP, MOTION_DEP, STD_PARAMS, FACE_PARAMS };
  if (D) global.L2dCapability = API;
  else global.__capReport = report;
})(typeof window !== "undefined" ? window : globalThis);
