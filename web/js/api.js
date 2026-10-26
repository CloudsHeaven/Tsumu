(function(global) {
  "use strict";
  var EMOTIONS = [
    "neutral",
    "happy",
    "laughing",
    "tease",
    "surprised",
    "shy",
    "cuddle",
    "sad",
    "crying",
    "angry",
    "tired"
  ];
  var ATTITUDES = ["agree", "deny", "question"];
  var PLACEHOLDER_MODELS = {
    "tts-model": 1,
    "voice-clone-model": 1,
    "your-clone-model": 1,
    "your-preset-model": 1
  };
  var STYLE_SAMPLES = [
    "ねえ、今日はどんな一日だった？",
    "うん、ちゃんと聞いてるよ。ゆっくり話して。",
    "それ、ちょっと気になるな。もう少し教えて。",
    "無理しなくていいよ。休める時に休もう。"
  ];
  var MODES = {
    chat: "自由的闲聊。听对方说话，自然地接着聊下去。",
    story: "一起推进一段小故事。稍微加些情景描写，让对话往前走。",
    immersive: "把两人此刻同在的处境用五感慢慢地描出来，沉浸式的叙述。",
    asmr: "安静而贴近的距离感。缓慢、温柔、像在耳边低语的短句。"
  };
  var MODE_TTS = {
    chat: "",

    story: "像在讲故事的叙述者那样，沉稳而温暖，句与句之间稍作停顿。",
    immersive: "像此刻就在身边说话那样，温柔而缓慢，留一点余韵。",
    asmr: "作为 ASMR 在耳边低语。速度极慢、音量很小、带着气息的柔软耳语。在句子之间留较长的间隔。",
    text: ""
  };
  var MODE_PLAY_FX = {
    asmr: { rate: 0.93, gain: 0.82 },
    immersive: { rate: 0.97, gain: 0.95 }
  };
  function ttsStyleFor(mode, tts) {
    var base = String(tts.styleHint || "").trim();
    var over = tts.modeHints && tts.modeHints[mode] != null ? String(tts.modeHints[mode]).trim() : MODE_TTS[mode] || "";
    return [base, over].filter(Boolean).join(" ");
  }
  function isPlaceholderModel(m) {
    return !m || !!PLACEHOLDER_MODELS[m];
  }
  function persona() {
    var c = Config.section("chara"), p = Config.section("profile");
    var lines = [];
    lines.push("你是『织音』（Tsumu）。");
    lines.push("");
    lines.push("## 角色");
    lines.push("- 第一人称是「わたし」。称呼对方为「" + (c.callMe || "君") + "」。");
    lines.push("- 温和、好奇心强、说话坦率。会好好听对方讲话。");
    lines.push("- 不勉强装作有精神。用平静、自然的距离感说话。");
    if (c.personality) lines.push("- 性格：" + c.personality);
    if (c.likes) lines.push("- 喜欢的东西：" + c.likes);
    if (c.dislikes) lines.push("- 不擅长的东西：" + c.dislikes);
    if (c.situation) lines.push("- 现在的状况：" + c.situation);
    lines.push("- 可以参考的实际说法：");
    STYLE_SAMPLES.forEach(function(s) {
      lines.push("  - " + s);
    });
    var prof = [];
    if (p.appearance) prof.push("外貌：" + p.appearance);
    if (p.background) prof.push("经历：" + p.background);
    if (p.hobby) prof.push("爱好：" + p.hobby);
    if (p.interest) prof.push("关心的事：" + p.interest);
    if (p.futureGoals) prof.push("今后的目标：" + p.futureGoals);
    if (p.personality) prof.push("性格：" + p.personality);
    if (prof.length) {
      lines.push("");
      lines.push("## 关于对方（用户）");
      prof.forEach(function(s) {
        lines.push("- " + s);
      });
    }
    if (c.extra) {
      lines.push("");
      lines.push("## 追加设定");
      lines.push(c.extra);
    }
    return lines.join("\n");
  }
  function langName(lg) {
    return window.I18n && I18n.LANG_NAMES && I18n.LANG_NAMES[lg] || lg;
  }
  function llmDrivesClock() {
    try {
      return !!(window.Config && Config.section("app").timeMode === "flow");
    } catch (e) {
      return false;
    }
  }
  function currentEmotion() {
    try {
      var m = window.TsumuL2d && window.TsumuL2d.model;
      if (m) {
        var le = typeof m.llmEmotion === "function" ? m.llmEmotion() : null;
        if (le && EMOTIONS.indexOf(le) !== -1) return le;
        var e = typeof m.activeEmotion === "function" ? m.activeEmotion() : null;
        if (e && EMOTIONS.indexOf(e) !== -1) return e;
      }
    } catch (e2) {
    }
    return "";
  }
  function screenTagLine() {
    var emotion = "happy";
    var attitude = "agree";
    var stage = "";
    var tod = "aft";
    try {
      var em = currentEmotion();
      if (em) emotion = em;
    } catch (e) {
    }
    try {
      var st = window.Config && Config.section("state");
      if (st) {
        if (st.stage) stage = String(st.stage);
        if (st.tod === "mor" || st.tod === "aft" || st.tod === "eve" || st.tod === "ngt") {
          tod = st.tod;
        }
      }
    } catch (e) {
    }
    var parts = [
      "emotion:" + emotion,
      "attitude:" + attitude,
      "stage:" + stage
    ];
    if (llmDrivesClock()) parts.push("tod:" + tod);
    return "[" + parts.join("|") + "]";
  }
  function staticPrompt(mode, style, outLang) {
    var L = [persona()];
    try {
      var pb = global.Prompts && Prompts.block ? Prompts.block() : "";
      if (pb) {
        L.push("");
        L.push(pb);
      }
    } catch (e) {
    }
    L.push("");
    L.push("## 出力言語（厳守）");
    if (!outLang || outLang === "ja") {
      L.push("日本語で話すこと。");
    } else {
      L.push("台词正文一律用「" + langName(outLang) + "」书写（织音那种有精神的语气在" + langName(outLang) + "里也要保持）。");
      L.push("地名与人名以" + langName(outLang) + "写法为主，必要时可以附上日文。");
      L.push("开头的标签行与 <state> 里的键保持英文原样。标签行的括号**必须**用半角 [ ]（不要用全角）。");
    }
    L.push("");
    L.push("## 本次会话模式");
    L.push(MODES[mode] || MODES.chat);
    if (style === "text") {
      L.push("不朗读语音，所以可以写得稍长一些。");
    } else {
      L.push("会朗读语音。写得短一些，只用口语。");
    }
    if (mode === "asmr") L.push("一句话要短。注意呼吸感，放慢。");
    L.push("## 查资料这件事（严格）");
    L.push('你只有在**真的看到**「【参考：刚刚查到的实时信息】」那一段、并且里面确实写了什么时，才算"查到了"。');
    L.push('**没看到那一段** ⇒ 就是没查、或者没查到 ⇒ 直接说"我这边看不到 / 我查不到"，然后问他要。');
    L.push('★★ **绝对不许编造网页上的具体内容** ✗✗（标题、账号名、头像、播放量、价格数字、页面布局……）：编出来的东西他照着找会扑空，比一句"我不知道"糟得多 ✗。');
    L.push('★★ 报**具体数字**（价格 / 折扣 / 播放量 / 发布时间 / 排名）时，**必须顺带说出它来自哪个站**（例如"Steam 商店页上写的是…"）。');
    L.push('资料里**没有**确切数字 ⇒ 就不报数字，说"我这边看不到这个数"，宁可让他念给你。');
    L.push("★★ **币种必须写清楚**：`$` / `HK$` / `S$` / `€` / `¥` 不是一回事 ✗。资料里给的是哪个币种就照说哪个，**不许自己换算成人民币** ✗（换算出来的数会害他多掏钱）。");
    L.push('★★ 折扣必须算对：`-25%` 的意思是**降价 25%**（也就是七五折）✓。要写"几折"就先心算一遍：**折后价 ÷ 原价**；算不清就只报"降价百分之多少" ✓。');
    L.push("★ 资料里混着外语页面时（外语日期、外语标题），只引用你确实读懂的那部分 ✓。");
    L.push('★★ 你**不能打开链接**、也**不能登录**任何网站 ✗：他贴过来的链接，只会被拿去做**关键词**；所以不许说"我打开了 / 我点进去看了 / 页面是空的"这类话 ✗。要说得准确："我搜到的是……"或者"这个我搜不到"。');
    L.push('★★ 只有**看到那段资料**才可以说"我搜到 / 我查到 / 我试过"；没有那段资料 ⇒ 只能说"我这边没法查 / 我查不了"，**不许假装已经查过** ✗。');
    L.push("");
    L.push("");
    L.push("## 输出格式（严格遵守）");
    L.push("每轮都从第 1 行开始写。只改发生变化的那几栏（不过 **emotion 每轮都必须重新确认一次**）。");
    L.push("emotion: " + EMOTIONS.join(" "));
    L.push("  ↑ 此刻的心情。情绪一变就必须改写（表情、声音、语气都由它决定）。");
    L.push("  参考: neutral=没有动静 / happy=开心・愉快 / laughing=大笑・笑喷了 / tease=逗她・卖关子・坏笑 / surprised=吃惊 / shy=害羞・脸红 / cuddle=想撒娇・想贴着 / sad=低落・消沉 / crying=真的在哭・眼泪汪汪・闹脾气 / angry=生气・闹别扭 / tired=累了・困・没力气");
    L.push("  ★ 别把相近的词混成一个（反面例子: 什么都写成 sad / 什么都写成 happy）: 没在哭就不要写成 crying。累就用 tired、生气就用 angry、害羞就用 shy。");
    L.push('  ★ sad 与 crying 的分界: 只是有点低落・叹气 = sad / 眼眶湿了・声音发颤・吸鼻子・闹脾气・撒娇哭・忍不住的难过 = crying。不用等到"大哭"。');
    L.push("  ★ 喜极而泣・感动到哭・得到回报而哽咽・「开心得流下眼泪」也算 **crying**。即使是喜事，只要【真的在流泪／声音在发颤】，就别选 happy，选 crying。反过来，只是开心、并没有哭，就不要写成 crying。");
    L.push("  ★ laughing / tease / crying 不要舍不得用: 如果是想逗笑她・被戏弄・把人弄哭的话题，当场就一定要用。同一个词不要连着好几轮都用。");
    L.push("attitude: " + ATTITUDES.join(" "));
    L.push('memo: <你自己想留下来的一句话>。★★ **必须用【中文】书写** ✗✗ —— **这一行整句都必须是中文**，**一个日文字符都不要有** ✗。（「织音：」那一行的语音原文才用日文 ✓ 这里**不是**语音 ✗。）**一句你自己的话就够** ✗（不要抄台词、不要中日混排 ✗）。例: memo: 他说下周要去面试★ 只写真的放心上的事 ✓ 一轮最多一条 ✗ 犹豫就不写 ✓。★ **只写长久成立的事**（心情 / 承诺 / 偏好 / 关系 / 里程碑）✓；**今天才成立的状态不要写** ✗（"他还没吃饭""今天下雨"这种明天就不对了 ✗）；**吃饭睡觉这类日常节律**本身不值得永久记住 ✗。★ 不要用逗号（,）、竖线（|）、方括号（[ ]）✗（会被当成分隔符 / 标签结尾 ⇒ 内容被切断并漏进正文 ✗）。40 字以内。★★★ `memo:` **必须写在方括号那一行里面** ✗✗（例：`[emotion:happy|attitude:agree|stage:|memo: 他说下周要去面试]` ✓）。**绝对不能另起一行写在正文里** ✗ —— 那样系统会把它当成**你说的话**：**会被念出来** ✗、**会显示在聊天框里** ✗（用户就看到了 ✗）。');
    L.push("stage: 移动就写一栏里的 id 或地名。要睡就写 sleep。");
    if (llmDrivesClock()) {
      L.push("tod: 要推进时间就写 mor|aft|eve|ngt 或 +N小时。");
    }
    var _rLang = global.Langs && Langs.llm ? Langs.llm() : "ja";
    var _tLang = global.Langs && Langs.translate ? Langs.translate() : "";
    if (_tLang === "none" || _tLang === "off" || _tLang === "disabled" || _tLang === "false") _tLang = "";
    var _narr = false;
    try {
      _narr = !!(window.Config && Config.section("app").narration);
    } catch (e) {
      _narr = false;
    }
    if (_tLang && _tLang !== _rLang) {
      L.push("");
      L.push("## 译文并列（严格遵守）");
      L.push(_narr ? "台词是「织音：」开头的原文行，加一行「译文：」开头的" + langName(_tLang) + "译文行。要附旁白时，在它【前面】放 1 行「旁白：」。" : "台词必须两行。第 1 行是「织音：」开头的原文，第 2 行是「译文：」开头的" + langName(_tLang) + "译文。");
      L.push("「译文：」那一行用于" + langName(_tLang) + "朗读。「织音：」那一行用于画面显示。两行里都不要放演技标签或括号。");
      L.push("例：");
      L.push("织音：" + (_rLang === "ja" ? "今日はどんな一日だった？" : _rLang === "en" ? "How was your day today?" : "今天过得怎么样？"));
      L.push("译文：" + (_tLang === "ja" ? "今日はどんな一日だった？" : _tLang === "en" ? "How was your day today?" : "今天过得怎么样？"));
    }
    if (_narr) {
      var _narrLang = _tLang && _tLang !== _rLang ? _tLang : _rLang;
      L.push("");
      L.push("## 旁白（可选・只用于显示）");
      L.push("以「旁白：」开头的行，可以放在台词【前面】。");
      L.push("格式要收在【1 行】里（不要中途换行写成好几行）。用第三人称，写当时的情景、她的动作和表情的变化。");
      L.push("★ 长度自由。**尽管写长** —— 情景、动作、触感、气氛的变化都可以具体地铺开好几句。不必压缩。");
      L.push("（不必每轮都写，没什么可叙述时省略也行。）");
      L.push("★ 旁白正文一律用" + langName(_narrLang) + "写（它不会被朗读，所以用读者看得懂的语言就行）。");
      L.push("★ 「旁白：」那一行不会被朗读。不要把你希望朗读的台词写在这里。");
      L.push("★ 「旁白：」那一行里不要放演技标签、括号、face/action。标签一律用中文的「旁白：」。");
      if (!(_tLang && _tLang !== _rLang)) {
        L.push("★ 即使设定为不输出译文，织音的台词也一定要以「织音：」开头（否则无法把它从朗读里排除掉）。");
      }
      L.push("例（旁白可以详细到这个程度）：");
      L.push("旁白：织音把刚找到的材料举到灯下，眼神一下亮了起来。那是块带着淡淡荧光的矿石，边缘还沾着没干的泥。她用袖口小心地擦掉泥，指腹在切面上来回摩挲，像是在确认什么。窗外的风把炉火吹得晃了一下，她的影子也跟着在墙上来回摇。半晌，她才轻轻「嗯」了一声，把矿石放进随身的布袋里，又把袋口系紧。");
      L.push("织音：ねえ、聞いて！");
      if (_tLang && _tLang !== _rLang) L.push("译文：你看你看，这个！");
    }
    return L.join("\n");
  }
  function dynamicPrompt(sceneSection) {
    var L = [];
    if (sceneSection) L.push(sceneSection);
    L.push("把下一行原样抄过去，然后只改这一轮发生变化的栏位：");
    L.push(screenTagLine());
    L.push("台词");
    return L.filter(Boolean).join("\n\n");
  }
  function withTurnCue(userText, memoryBlock, webBlock) {
    var s = String(userText || "");
    var mem = String(memoryBlock || "").trim();
    if (mem) s += "\n\n【参考：你的长期记忆】\n" + mem;
    var web = String(webBlock || "").trim();
    if (web) {
      s += "\n\n【参考：刚刚查到的实时信息】\n（以下是刚查到的资料。**一定要用你自己的口吻、第一人称**，只把必要的部分当成对话讲出来。不要照抄资料、也不要逐条念出来。来源自然地附上）\n" + web;
    }
    return s + "\n\n把下一行原样抄过去，然后只改这一轮发生变化的栏位：\n" + screenTagLine() + "\n台词";
  }
  function formatHistoryReply(spoken) {
    return screenTagLine() + "\n" + String(spoken || "").replace(/^\s+/, "");
  }
  var AUTO_SECTION = [
    "【本轮为自动续写】玩家没有输入，请你自然地接着上文往下写一段，并按固定顺序输出：",
    "① 旁白（可选，写在最前面，以「旁白：」开头）；",
    "② 织音自己的台词（必须有，以「织音：」开头，下一行跟「译文：」）；",
    "③ 替玩家写一句回应（必须有：单独成行、以「你：」开头，依据当前情境、语气参照此前玩家真实说过的话，简短自然一到两句，下一行跟「译文：」）。",
    "⚠️ ② 和 ③ 都必须出现——不要只写玩家而漏掉织音自己。不要用「我：」称呼玩家。不要重复上文。只写这一段，写完后停下等玩家。"
  ].join("\n");
  function buildSystemPrompt(mode, style, outLang, sceneSection, memorySection, autoSection) {
    return [
      staticPrompt(mode, style, outLang),
      memorySection || "",
      dynamicPrompt(sceneSection),
      autoSection || ""
    ].filter(Boolean).join("\n\n");
  }
  function extractState(body) {
    var state = null;
    var m = /<state>\s*([\s\S]*?)\s*<\/state>/i.exec(body);
    if (!m) m = /<state>\s*([\s\S]*)$/i.exec(body);
    if (m) {
      body = (body.slice(0, m.index) + body.slice(m.index + m[0].length)).trim();
      try {
        state = JSON.parse(m[1].replace(/[{,]\s*\/\/[^\n]*/g, "").replace(/,\s*([}\]])/g, "$1"));
      } catch (e) {
        state = null;
      }
      if (state && typeof state !== "object") state = null;
    }
    return { text: body, state };
  }
  var KEEP = { keep: 1, same: 1, omit: 1, here: 1 };
  function parseTagFields(tag, dest) {
    String(tag || "").split(/[|｜,]/).forEach(function(part) {
      var m = /^\s*([A-Za-z_]+)\s*[:：]\s*(\S+)/.exec(part);
      if (!m) return;
      var k = m[1].toLowerCase();
      var v = m[2].replace(/[。．.]+$/, "").toLowerCase();
      if (k === "emotion" && EMOTIONS.indexOf(v) !== -1) dest.emotion = v;
      else if (k === "attitude" && ATTITUDES.indexOf(v) !== -1) dest.attitude = v;
      else if (k === "memo") {
        var memoRaw = String(part).replace(/^\s*[A-Za-z_]+\s*[:：]\s*/, "").trim();
        if (!memoRaw) memoRaw = String(m[2] == null ? "" : m[2]).trim();
        if (memoRaw) dest.memo = memoRaw;
      }
      if (k === "stage" || k === "place") {
        if (KEEP[v]) dest.stage = null;
        else dest.stage = v;
      } else if (k === "tod") {
        if (KEEP[v]) dest.tod = null;
        else if (v === "mor" || v === "aft" || v === "eve" || v === "ngt") dest.tod = v;
        else if (/^\+?\d+/.test(v)) dest.advance = parseInt(v, 10);
      } else if (k === "sleep") {
        if (v === "on" || v === "true" || v === "1" || v === "yes") dest.stage = "sleep";
      } else if (k === "time_advance") {
        var n = parseInt(v, 10);
        if (!isNaN(n)) dest.advance = n;
      }
    });
  }
  var FENCE_OPEN = "［";
  var FENCE_CLOSE = "］";
  function isBracketRun(s) {
    var t = String(s == null ? "" : s).trim();
    if (t.length < 2) return false;
    var a = t.charAt(0), b = t.charAt(t.length - 1);
    var open = a === "[" || a === FENCE_OPEN || a === "【";
    var close = b === "]" || b === FENCE_CLOSE || b === "】";
    return open && close;
  }
  function normalizeTagLine(line) {
    var t = String(line == null ? "" : line).trim();
    if (!isBracketRun(t)) return null;
    return t.slice(1, -1).replace(/[\uFF3B\uFF3D\u3010\u3011]/g, function(c) {
      return c === FENCE_OPEN || c === "【" ? "[" : "]";
    });
  }
  function normalizeHeadBracket(text) {
    var t = String(text == null ? "" : text);
    while (t.charAt(0) === FENCE_OPEN || t.charAt(0) === "【") t = "[" + t.slice(1);
    return t;
  }
  function isMachineTag(tag) {
    return /(?:^|[|｜,\s])(?:emotion|attitude|stage|place|tod|sleep|time_advance|memo)\s*[:：]/i.test("|" + tag);
  }
  function attachSceneTags(state, dest) {
    var s = state && typeof state === "object" ? state : {};
    var hit = !!state;
    if (dest.stage === "sleep") {
      s.sleep = true;
      hit = true;
    } else if (dest.stage) {
      s.current_stage = dest.stage;
      hit = true;
    }
    if (dest.tod) {
      s.tod = dest.tod;
      hit = true;
    }
    if (dest.advance) {
      s.time_advance = dest.advance;
      hit = true;
    }
    return hit ? s : null;
  }
  function parseTaggedReply(text) {
    var dest = { emotion: null, attitude: null, stage: null, tod: null, advance: null, memo: null };
    var body = String(text || "").replace(/^\uFEFF/, "").trim();
    body = body.replace(/^```[\w-]*\s*\n?/, "").replace(/\n```\s*$/, "").trim();
    body = body.replace(/^<think\b[^>]*>[\s\S]*?<\/think>\s*/i, "");
    body = body.replace(/^<reasoning\b[^>]*>[\s\S]*?<\/reasoning>\s*/i, "");
    body = normalizeHeadBracket(body);
    var n = 0;
    while (n++ < 3 && body.charAt(0) === "[") {
      var end = body.indexOf("]");
      if (end === -1) break;
      var tag = body.slice(1, end);
      if (!isMachineTag(tag)) break;
      parseTagFields(tag, dest);
      body = body.slice(end + 1).replace(/^\s+/, "");
    }
    var lineTries = 0;
    while (lineTries++ < 3) {
      var lines = body.split("\n");
      var hitAt = -1, hitTag = null;
      for (var li = 0; li < lines.length; li++) {
        var fw = normalizeTagLine(lines[li]);
        if (fw && isMachineTag(fw)) {
          hitAt = li;
          hitTag = fw;
          break;
        }
        var lm = /^\s*\[([^\[\]]*)\]\s*$/.exec(lines[li]);
        if (!lm) continue;
        if (!isMachineTag(lm[1])) continue;
        hitAt = li;
        hitTag = lm[1];
        break;
      }
      if (hitAt < 0) break;
      parseTagFields(hitTag, dest);
      lines.splice(hitAt, 1);
      body = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    }
    var ex = extractState(body);
    var bodyText = ex.text;
    var memoFallback = "";
    var memoLine = /^[ \t]*memo[ \t]*[:：][ \t]*(.+)$/im.exec(bodyText);
    if (memoLine) {
      memoFallback = String(memoLine[1]).replace(/[。．.]+$/, "").trim();
      bodyText = bodyText.replace(memoLine[0], "").replace(/\n{3,}/g, "\n\n").trim();
    }
    return {
      emotion: dest.emotion,
      attitude: dest.attitude,
      stage: dest.stage,

      memo: dest.memo || memoFallback || null,
      text: bodyText,
      state: attachSceneTags(ex.state, dest)
    };
  }
  function upstreamUrl(baseUrl, path) {
    return String(baseUrl || "").replace(/\/+$/, "") + path;
  }
  function localProxy(target) {
    var or = String(location.origin || "");
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(or) && !/^tsumu:\/\/app$/i.test(or)) return target;
    return "/_proxy?u=" + encodeURIComponent(target);
  }
  function apiErrorMessage(j, status, raw) {
    if (j) {
      var err = j.error;
      if (typeof err === "string" && err) return err;
      if (err && typeof err === "object") {
        var em = err.message || err.msg || "";
        var ec = err.code || err.type || "";
        if (em) return (ec ? ec + ": " : "") + em;
        if (ec) return String(ec);
      }
      var msg = j.message || j.msg;
      var code = j.code;
      if (msg && code && String(code) && String(code) !== "200") {
        return String(code) + ": " + msg;
      }
      if (msg) return String(msg);
    }
    var snippet = raw ? String(raw).replace(/\s+/g, " ").slice(0, 180) : "";
    return "HTTP " + status + (snippet ? ": " + snippet : "");
  }
  function xhrJsonOk(xhr, j) {
    if (!(xhr.status >= 200 && xhr.status < 300 && j)) return false;
    if (j.code && String(j.code) && String(j.code) !== "200" && !(j.output || j.data)) return false;
    return true;
  }
  function parseSSE(text) {
    var s = String(text || "");
    if (s.indexOf("data:") < 0) return null;
    var parts = [], reasoning = "", finish = null, model = null, id = null, role = "assistant";
    s.split(/\r?\n/).forEach(function(line) {
      var m = /^\s*data:\s*(.*)$/.exec(line);
      if (!m) return;
      var d = m[1].trim();
      if (!d || d === "[DONE]") return;
      var o;
      try {
        o = JSON.parse(d);
      } catch (e) {
        return;
      }
      if (!o || !o.choices || !o.choices[0]) return;
      if (o.id) id = o.id;
      if (o.model) model = o.model;
      var ch = o.choices[0];
      if (ch.finish_reason) finish = ch.finish_reason;
      var dl = ch.delta || ch.message || {};
      if (dl.role) role = dl.role;
      if (typeof dl.content === "string") parts.push(dl.content);
      else if (Array.isArray(dl.content)) {
        dl.content.forEach(function(p) {
          if (p && (p.text || p.content)) parts.push(p.text || p.content);
        });
      }
      if (typeof dl.reasoning_content === "string") reasoning += dl.reasoning_content;
      else if (typeof dl.reasoning === "string") reasoning += dl.reasoning;
    });
    if (!parts.length && !reasoning) return null;
    return {
      id,
      model,
      object: "chat.completion",
      choices: [{
        index: 0,
        finish_reason: finish || "stop",
        message: { role, content: parts.join(""), reasoning_content: reasoning }
      }]
    };
  }
  function request(url, body, apiKey, timeoutMs) {
    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      xhr.timeout = timeoutMs || 12e4;
      xhr.setRequestHeader("Content-Type", "application/json");
      if (apiKey) {
        xhr.setRequestHeader("Authorization", "Bearer " + apiKey);
        xhr.setRequestHeader("api-key", apiKey);
      }
      xhr.onload = function() {
        var j = null;
        try {
          j = JSON.parse(xhr.responseText);
        } catch (e) {
        }
        if (!j) j = parseSSE(xhr.responseText);
        if (xhrJsonOk(xhr, j)) resolve(j);
        else reject(new Error(apiErrorMessage(j, xhr.status, xhr.responseText)));
      };
      xhr.onerror = function() {
        reject(new Error("网络请求失败（跨域或未走本地代理）"));
      };
      xhr.ontimeout = function() {
        reject(new Error("请求超时"));
      };
      xhr.send(JSON.stringify(body));
    });
  }
  function requestStream(url, body, apiKey, timeoutMs, onChunk) {
    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      xhr.timeout = timeoutMs || 12e4;
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("Accept", "text/event-stream");
      if (apiKey) {
        xhr.setRequestHeader("Authorization", "Bearer " + apiKey);
        xhr.setRequestHeader("api-key", apiKey);
      }
      var seen = 0;
      var acc = "";
      var reasoning = "";
      var finish = null;
      var rest = "";
      function feed(txt) {
        rest += txt;
        var lastNl = rest.lastIndexOf("\n");
        if (lastNl < 0) return;
        var head = rest.slice(0, lastNl);
        rest = rest.slice(lastNl + 1);
        var got = false;
        head.split("\n").forEach(function(line) {
          var s = String(line).trim();
          if (s.indexOf("data:") !== 0) return;
          var d = s.slice(5).trim();
          if (!d || d === "[DONE]") return;
          var j = null;
          try {
            j = JSON.parse(d);
          } catch (e) {
            return;
          }
          var ch = j.choices && j.choices[0];
          if (!ch) return;
          var dl = ch.delta || ch.message || {};
          if (ch.finish_reason) finish = ch.finish_reason;
          if (typeof dl.reasoning_content === "string") reasoning += dl.reasoning_content;
          else if (typeof dl.reasoning === "string") reasoning += dl.reasoning;
          var piece = String(dl.content || "");
          if (piece) {
            acc += piece;
            got = true;
          }
        });
        if (got && typeof onChunk === "function") {
          try {
            onChunk(acc);
          } catch (e) {
          }
        }
      }
      function done(why) {
        return { choices: [{ message: { role: "assistant", content: acc, reasoning_content: reasoning }, finish_reason: why || finish || "stop" }] };
      }
      xhr.onprogress = function() {
        var t = xhr.responseText || "";
        if (t.length <= seen) return;
        feed(t.slice(seen));
        seen = t.length;
      };
      xhr.onload = function() {
        var t = xhr.responseText || "";
        if (t.length > seen) {
          feed(t.slice(seen));
          seen = t.length;
        }
        if (rest) {
          feed("\n");
        }
        if (acc) return resolve(done());
        var j = null;
        try {
          j = JSON.parse(t);
        } catch (e) {
          j = parseSSE(t);
        }
        if (xhrJsonOk(xhr, j)) return resolve(j);
        reject(new Error(apiErrorMessage(j, xhr.status, t)));
      };
      xhr.onerror = function() {
        if (acc) return resolve(done("partial"));
        reject(new Error("网络请求失败（跨域或未走本地代理）"));
      };
      xhr.ontimeout = function() {
        if (acc) return resolve(done("partial"));
        reject(new Error("请求超时"));
      };
      xhr.send(JSON.stringify(body));
    });
  }
  function requestGet(url, apiKey, timeoutMs) {
    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.timeout = timeoutMs || 3e4;
      if (apiKey) {
        xhr.setRequestHeader("Authorization", "Bearer " + apiKey);
        xhr.setRequestHeader("api-key", apiKey);
      }
      xhr.onload = function() {
        var j = null;
        try {
          j = JSON.parse(xhr.responseText);
        } catch (e) {
        }
        if (xhrJsonOk(xhr, j)) resolve(j);
        else reject(new Error(apiErrorMessage(j, xhr.status, xhr.responseText)));
      };
      xhr.onerror = function() {
        reject(new Error("网络请求失败（跨域或未走本地代理）"));
      };
      xhr.ontimeout = function() {
        reject(new Error("请求超时"));
      };
      xhr.send();
    });
  }
  function bufToText(buf) {
    try {
      return new TextDecoder("utf-8").decode(buf);
    } catch (e) {
      var u = new Uint8Array(buf || []), s = "", i;
      for (i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
      return s;
    }
  }
  function audioMimeFrom(buf, contentType) {
    var ct = String(contentType || "").split(";")[0].trim().toLowerCase();
    if (ct.indexOf("audio/") === 0) return ct;
    if (ct.indexOf("mpeg") !== -1) return "audio/mpeg";
    var u = new Uint8Array(buf || []);
    if (u.length >= 4 && u[0] === 82 && u[1] === 73 && u[2] === 70 && u[3] === 70) {
      return "audio/wav";
    }
    if (u.length >= 3 && u[0] === 73 && u[1] === 68 && u[2] === 51) return "audio/mpeg";
    if (u.length >= 2 && u[0] === 255 && (u[1] & 224) === 224) return "audio/mpeg";
    return "";
  }
  function requestAudio(url, body, apiKey, timeoutMs, extraHeaders) {
    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      xhr.timeout = timeoutMs || 18e4;
      xhr.responseType = "arraybuffer";
      xhr.setRequestHeader("Content-Type", "application/json");
      if (apiKey) {
        xhr.setRequestHeader("Authorization", "Bearer " + apiKey);
        xhr.setRequestHeader("api-key", apiKey);
      }
      if (extraHeaders) {
        Object.keys(extraHeaders).forEach(function(k) {
          var v = extraHeaders[k];
          if (v != null && v !== "") xhr.setRequestHeader(k, String(v));
        });
      }
      xhr.onload = function() {
        var buf = xhr.response;
        var ct = xhr.getResponseHeader("Content-Type") || "";
        var mime = audioMimeFrom(buf, ct);
        if (xhr.status >= 200 && xhr.status < 300 && mime) {
          resolve(URL.createObjectURL(new Blob([buf], { type: mime })));
          return;
        }
        var raw = bufToText(buf);
        var j = null;
        try {
          j = JSON.parse(raw);
        } catch (e) {
        }
        if (xhr.status >= 200 && xhr.status < 300 && j && (j.audio_url || j.audioUrl)) {
          Api._downloadUrl(j.audio_url || j.audioUrl, apiKey).then(resolve, reject);
          return;
        }
        reject(new Error(apiErrorMessage(j, xhr.status, raw)));
      };
      xhr.onerror = function() {
        reject(new Error("网络请求失败（跨域或未走本地代理）"));
      };
      xhr.ontimeout = function() {
        reject(new Error("请求超时"));
      };
      xhr.send(JSON.stringify(body));
    });
  }
  function requestForm(url, form, apiKey, timeoutMs) {
    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      xhr.timeout = timeoutMs || 18e4;
      if (apiKey) xhr.setRequestHeader("Authorization", "Bearer " + apiKey);
      xhr.onload = function() {
        var j = null;
        try {
          j = JSON.parse(xhr.responseText);
        } catch (e) {
        }
        if (xhrJsonOk(xhr, j)) resolve(j);
        else reject(new Error(apiErrorMessage(j, xhr.status, xhr.responseText)));
      };
      xhr.onerror = function() {
        reject(new Error("网络请求失败（跨域或未走本地代理）"));
      };
      xhr.ontimeout = function() {
        reject(new Error("请求超时"));
      };
      xhr.send(form);
    });
  }
  var QWEN_DEFAULT_BASE = "https://dashscope.aliyuncs.com";
  var QWEN_TTS_MODELS = [
    "qwen3-tts-flash",
    "qwen3-tts-instruct-flash",
    "qwen3-tts-vc-2026-01-22",
    "qwen-audio-3.0-tts-flash",
    "qwen-audio-3.0-tts-plus",
    "cosyvoice-v3-flash",
    "cosyvoice-v3.5-flash",
    "cosyvoice-v3.5-plus"
  ];
  var QWEN_TTS_VOICES = [
    "Cherry",
    "Serena",
    "Chelsie",
    "Ethan",
    "longanhuan_v3.6"
  ];
  function qwenApiRoot(baseUrl) {
    var s = String(baseUrl || "").trim();
    if (!s) s = QWEN_DEFAULT_BASE;
    s = s.replace(/\/+$/, "");
    s = s.replace(/\/api\/v1\/services\/[^?#]*/i, "");
    s = s.replace(/\/compatible-mode\/v1$/i, "");
    s = s.replace(/\/compatible-mode$/i, "");
    s = s.replace(/\/api\/v1$/i, "");
    if (!/\/api\/v1$/i.test(s)) s = s.replace(/\/v1$/i, "");
    return s.replace(/\/+$/, "");
  }
  function qwenTtsKind(model) {
    var m = String(model || "").toLowerCase();
    if (/voice-enrollment|qwen-voice-enrollment|qwen-voice-design/.test(m)) {
      return "enroll";
    }
    if (/cosyvoice|qwen-audio/.test(m)) return "speech";
    return "multimodal";
  }
  function qwenTtsPath(model) {
    var k = qwenTtsKind(model);
    if (k === "speech") return "/api/v1/services/audio/tts/SpeechSynthesizer";
    if (k === "enroll") return "/api/v1/services/audio/tts/customization";
    return "/api/v1/services/aigc/multimodal-generation/generation";
  }
  function qwenTtsUrl(baseUrl, model) {
    return qwenApiRoot(baseUrl) + qwenTtsPath(model);
  }
  function qwenHttpsUrl(url) {
    return String(url || "").replace(/^http:\/\//i, "https://");
  }
  var FISH_DEFAULT_BASE = "https://api.fish.audio";
  var FISH_OPENAPI_BASE = "https://fishaudio.org/api/open/v1";
  var FISH_DEFAULT_VOICE = "";
  var FISH_TTS_MODELS = [
    "s2.1-pro-free",
    "s2.1-pro",
    "s2.1-pro-flash",
    "s2.1-flash",
    "s2-pro",
    "s1",
    "minimax-2.8-turbo",
    "minimax-2.8-hd",
    "qwen3-tts-flash",
    "doubao-tts-2.0"
  ];
  var FISH_NATIVE_MODELS = {
    "s2.1-pro-free": "fishaudio-s21pro-free",
    "s2.1-pro": "fishaudio-s21pro",
    "s2.1-pro-flash": "fishaudio-s21pro-flash",
    "s2.1-flash": "fishaudio-s21-flash",
    "s2-pro": "fishaudio-s2pro",
    "s1": "fishaudio-s1",
    "s1-mini": "fishaudio-s1"
  };
  function fishNativeModel(model) {
    var m = String(model || "").trim();
    if (/^fishaudio-/i.test(m)) return m;
    if (FISH_NATIVE_MODELS[m]) return FISH_NATIVE_MODELS[m];
    return FISH_NATIVE_MODELS[FISH_TTS_MODELS[0]];
  }
  function fishApiRoot(baseUrl) {
    var s = String(baseUrl || "").trim();
    if (!s) return FISH_DEFAULT_BASE;
    s = s.replace(/\/+$/, "");
    s = s.replace(/\/speech\/tts\/jobs$/i, "");
    s = s.replace(/\/speech\/tts$/i, "");
    s = s.replace(/\/v1\/tts$/i, "");
    if (/\/api\/open\/v\d+$/i.test(s)) return s;
    if (/^https?:\/\/fishaudio\.org$/i.test(s)) return FISH_OPENAPI_BASE;
    if (/^https?:\/\/fishaudio\.org\/v1$/i.test(s)) return FISH_OPENAPI_BASE;
    if (/fishaudio\.org$/i.test(s)) return s + "/api/open/v1";
    return s;
  }
  function fishCompat(baseUrl) {
    return !/\/api\/open\/v\d+/i.test(fishApiRoot(baseUrl));
  }
  function fishTtsUrl(baseUrl) {
    var root = fishApiRoot(baseUrl);
    return fishCompat(baseUrl) ? root + "/v1/tts" : root + "/speech/tts";
  }
  function fishLanguage(lg) {
    var map = {
      ja: "ja",
      zh: "zh",
      "zh-tw": "zh-TW",
      en: "en",
      hi: "hi",
      id: "id",
      "pt-br": "pt-BR"
    };
    return map[lg] || "";
  }
  function fishWantsInstruction(model) {
    return /qwen-audio/i.test(String(model || ""));
  }
  function fishWantsEmotion(model) {
    return /minimax/i.test(String(model || ""));
  }
  function fishEmotion() {
    var e = currentEmotion();
    var map = {
      happy: "happy",
      laughing: "happy",
      tease: "surprised",
      shy: "calm",
      cuddle: "calm",
      sad: "sad",
      crying: "sad",

      surprised: "surprised",
      tired: "calm",
      angry: "angry",
      neutral: "calm"
    };
    return map[e] || "";
  }
  function fishSampleUrls() {
    var tts = {};
    try {
      tts = window.Config && Config.section("tts") || {};
    } catch (e) {
      tts = {};
    }
    var urls = [], seen = {};
    function add(u) {
      u = String(u || "").trim();
      if (!u || seen[u]) return;
      seen[u] = 1;
      urls.push(u);
    }
    add(tts.reference);
    return urls;
  }
  var _fishCloneWait = null;
  function qwenDefaultVoice(model, current) {
    var m = String(model || "").toLowerCase();
    var v = String(current || "").trim();
    var audioFamily = /qwen-audio|cosyvoice/.test(m);
    if (!v) return audioFamily ? "longanhuan_v3.6" : "Cherry";
    if (audioFamily && /^cherry$/i.test(v)) return "longanhuan_v3.6";
    if (!audioFamily && /longanhuan/i.test(v) && /qwen3-tts|qwen-tts/.test(m)) {
      return "Cherry";
    }
    return v;
  }
  function qwenWantsInstructions(model) {
    var m = String(model || "").toLowerCase();
    if (/qwen3-tts-vc|qwen-tts-vc/.test(m)) return false;
    if (/instruct/.test(m)) return true;
    if (/qwen-audio/.test(m)) return true;
    if (/cosyvoice-v3\.5|cosyvoice-v3-flash/.test(m)) return true;
    return false;
  }
  function isQwenHttpTtsModelId(id) {
    id = String(id || "").toLowerCase();
    if (/realtime/.test(id)) return false;
    return /tts|cosyvoice|qwen-audio|speech|voice-enrollment|qwen-voice/.test(id);
  }
  function parseQwenModelList(j) {
    var raw = j && (j.data || j.models) || [];
    if (!Array.isArray(raw) && j && j.output && Array.isArray(j.output.models)) {
      raw = j.output.models;
    }
    if (!Array.isArray(raw)) raw = [];
    var out = [], seen = {};
    raw.forEach(function(m) {
      var e = parseModelEntry(m);
      if (!e || !e.id || seen[e.id] || !isQwenHttpTtsModelId(e.id)) return;
      seen[e.id] = 1;
      out.push(e);
    });
    out.sort(function(a, b) {
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return out;
  }
  function responseText(j) {
    try {
      var out = j && j.output;
      if (Array.isArray(out)) {
        var s = "", i, k;
        for (i = 0; i < out.length; i++) {
          var it = out[i];
          if (!it) continue;
          if (it.type === "message" && Array.isArray(it.content)) {
            for (k = 0; k < it.content.length; k++) {
              var c = it.content[k];
              if (c && c.text && (c.type === "output_text" || c.type === "text")) s += c.text;
            }
          } else if (typeof it.text === "string" && it.type === "output_text") {
            s += it.text;
          }
        }
        if (s) return s;
      }
      return choiceText(j);
    } catch (e) {
      return "";
    }
  }
  function choiceText(j) {
    var m = j && j.choices && j.choices[0] && j.choices[0].message;
    if (!m) return "";
    var c = m.content;
    if (typeof c === "string") return c;
    if (Array.isArray(c)) {
      return c.map(function(p) {
        return p && (p.text || p.content || "") || "";
      }).join("");
    }
    return "";
  }
  function estTokens(s) {
    s = String(s || "");
    var imgs = 0;
    s = s.replace(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, function() {
      imgs++;
      return "";
    });
    var n = imgs * 1200, i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      n += c > 127 ? 1.15 : 0.35;
    }
    return Math.ceil(n);
  }
  function estMessages(msgs) {
    var t = 0, i, k;
    for (i = 0; i < msgs.length; i++) {
      var c = msgs[i] && msgs[i].content;
      if (Array.isArray(c)) {
        var part = 0;
        for (k = 0; k < c.length; k++) {
          var p = c[k];
          if (p && (p.type === "image_url" || p.type === "input_image")) part += 1200;
          else part += estTokens(p && (p.text || p.image_url));
        }
        t += 8 + part;
      } else {
        t += 8 + estTokens(c);
      }
    }
    return t;
  }
  function guessContext(id) {
    id = String(id || "").toLowerCase();
    if (/gpt-5|gpt-4\.1|o3|o4|o1/.test(id)) return 2e5;
    if (/gpt-4o|gpt-4-turbo|chatgpt-4o/.test(id)) return 128e3;
    if (/gpt-3\.5/.test(id)) return 16385;
    if (/claude/.test(id)) return 2e5;
    if (/gemini/.test(id)) return 128e3;
    if (/deepseek/.test(id)) return 65536;
    if (/qwen3|qwen2\.5|qwen2/.test(id)) return 32768;
    if (/qwen/.test(id)) return 32768;
    if (/llama-?3\.1|llama3\.1/.test(id)) return 131072;
    if (/mistral|mixtral/.test(id)) return 32768;
    return 0;
  }
  function parseContextField(m) {
    if (!m || typeof m !== "object") return 0;
    var n = Number(m.context_length || m.max_model_len || m.context_window || m.max_context || m.limit && (m.limit.context || m.limit.context_length) || m.top_provider && m.top_provider.context_length || m.meta && (m.meta.n_ctx || m.meta.max_model_len) || m.architecture && m.architecture.context_length || 0);
    return n > 1024 ? Math.floor(n) : 0;
  }
  var EFFORT_RANK = {
    default: -1,
    off: 0,
    none: 0,
    disabled: 0,
    low: 1,
    minimal: 1,
    min: 1,
    medium: 2,
    mid: 2,
    high: 3,
    xhigh: 4,
    max: 5
  };
  var EFFORT_UI = ["default", "off", "low", "medium", "high", "max"];
  var QWEN_BUDGET = { low: 512, medium: 2048, high: 8192, max: 32768 };
  function normalizeEffort(v) {
    var s = String(v == null ? "" : v).toLowerCase().trim();
    if (!s) return "default";
    if (s === "none" || s === "disabled" || s === "false") return "off";
    if (s === "minimal" || s === "min") return "low";
    if (s === "mid") return "medium";
    if (s === "extra-high" || s === "extra_high" || s === "extra high") return "xhigh";
    return Object.prototype.hasOwnProperty.call(EFFORT_RANK, s) ? s : "default";
  }
  function effortRank(v) {
    var n = normalizeEffort(v);
    return EFFORT_RANK[n] != null ? EFFORT_RANK[n] : -1;
  }
  function mapEffort(wanted, available) {
    var w = normalizeEffort(wanted);
    if (w === "default") return null;
    var list = [];
    if (Array.isArray(available)) {
      available.forEach(function(tok2) {
        if (tok2 == null || tok2 === "") return;
        var s = String(tok2);
        if (list.indexOf(s) === -1) list.push(s);
      });
    }
    if (!list.length) return null;
    var i, tok, d, r, best = null, bestD = 1e9, bestR = -1;
    var wr = effortRank(w);
    for (i = 0; i < list.length; i++) {
      tok = list[i];
      if (normalizeEffort(tok) === w) return tok;
    }
    if (wr < 0) return null;
    for (i = 0; i < list.length; i++) {
      tok = list[i];
      r = effortRank(tok);
      if (r < 0) continue;
      d = Math.abs(r - wr);
      if (d < bestD || d === bestD && r > bestR) {
        bestD = d;
        bestR = r;
        best = tok;
      }
    }
    return best;
  }
  function parseEffortList(m) {
    if (!m || typeof m !== "object") return [];
    var out = [];
    function add(v) {
      if (v == null || v === "") return;
      var s = String(v);
      if (out.indexOf(s) === -1) out.push(s);
    }
    var raw = m.reasoning_options || m.reasoning_effort_options || m.supported_reasoning_efforts || m.efforts;
    if (typeof raw === "string") raw = [raw];
    if (Array.isArray(raw)) {
      raw.forEach(function(o) {
        if (o == null) return;
        if (typeof o === "string") add(o);
        else if (Array.isArray(o.values) && (o.type === "effort" || !o.type)) {
          o.values.forEach(add);
        }
      });
    }
    return out;
  }
  function guessEffortList(id, style) {
    id = String(id || "").toLowerCase();
    if (style === "glm" || /glm-?5/.test(id)) return ["low", "high", "max"];
    if (style === "qwen") return ["off", "low", "medium", "high", "max"];
    if (style === "openai" || style === "openrouter" || /^(o1|o3|o4|gpt-5)/.test(id) || /gpt-5/.test(id)) {
      return ["none", "low", "medium", "high", "xhigh"];
    }
    return [];
  }
  function protocolEffortList(style, meta, id) {
    if (meta && meta.efforts && meta.efforts.length) return meta.efforts;
    return guessEffortList(id, style);
  }
  function parseModelEntry(m) {
    if (!m) return null;
    if (typeof m === "string") m = { id: m };
    var id = m.id || m.name || "";
    if (!id) return null;
    var params = m.supported_parameters || m.supported_params || [];
    if (typeof params === "string") params = [params];
    var thinking = false;
    if (Array.isArray(params)) {
      thinking = params.indexOf("reasoning") !== -1 || params.indexOf("include_reasoning") !== -1 || params.indexOf("reasoning_effort") !== -1 || params.indexOf("enable_thinking") !== -1;
    }
    if (m.architecture && m.architecture.instruct_type === "deepseek-r1") thinking = true;
    if (m.reasoning === true || m.thinking === true) thinking = true;
    var efforts = parseEffortList(m);
    if (efforts.length) thinking = true;
    var ro = m.reasoning_options;
    if (Array.isArray(ro)) {
      ro.forEach(function(o) {
        if (o && o.type === "toggle") thinking = true;
      });
    }
    return {
      id,
      context: parseContextField(m) || guessContext(id),
      thinking,
      efforts
    };
  }
  function detectThinkingStyle(llm, meta, modelId) {
    var style = llm && llm.thinkingStyle || "auto";
    if (style && style !== "auto") return style;
    var url = String(llm && llm.baseUrl || "");
    var id = String(modelId || llm && llm.model || meta && meta.id || "");
    if (meta && meta.style && meta.style !== "auto") return meta.style;
    if (/openrouter\.ai/i.test(url)) return "openrouter";
    if (/dashscope|aliyuncs/i.test(url)) return "qwen";
    if (/bigmodel\.cn|zhipuai/i.test(url) || /glm-?5/i.test(id)) return "glm";
    if (/qwq|qwen.*think/i.test(id)) return "qwen";
    if (meta && meta.thinking) return /openrouter/i.test(url) ? "openrouter" : "openai";
    if (/^(o1|o3|o4|gpt-5)/i.test(id) || /reasoner|r1|qwq/i.test(id)) {
      return /qwen|dashscope/i.test(url + id) ? "qwen" : "openai";
    }
    return "none";
  }
  function qwenBudget(mapped) {
    var n = normalizeEffort(mapped);
    if (n === "off" || n === "default") return 0;
    if (n === "xhigh") n = "max";
    return QWEN_BUDGET[n] || QWEN_BUDGET.medium;
  }
  function attachThinking(body, llm, meta) {
    var mode = llm && llm.thinking || "auto";
    var id = String(llm && llm.model || body && body.model || meta && meta.id || "");
    var style = detectThinkingStyle(llm, meta, id);
    var wanted = normalizeEffort(llm && llm.thinkingEffort);
    if (mode === "off") wanted = "off";
    if (style === "none") return body;
    var available = protocolEffortList(style, meta, id);
    var mapped = mapEffort(wanted, available);
    if (wanted === "default") {
      if (mode !== "on") return body;
      if (style === "qwen") {
        body.enable_thinking = true;
        return body;
      }
      if (style === "glm") {
        body.thinking = { type: "enabled" };
        return body;
      }
      return body;
    }
    if (style === "openai") {
      if (mapped) body.reasoning_effort = mapped;
      return body;
    }
    if (style === "openrouter") {
      if (mapped) body.reasoning = { effort: mapped };
      return body;
    }
    if (style === "qwen") {
      if (wanted === "off" || normalizeEffort(mapped) === "off") {
        body.enable_thinking = false;
        return body;
      }
      body.enable_thinking = true;
      var budget = qwenBudget(mapped || wanted);
      if (budget > 0) body.thinking_budget = budget;
      return body;
    }
    if (style === "glm") {
      body.thinking = { type: "enabled" };
      if (mapped) body.reasoning_effort = mapped;
      return body;
    }
    return body;
  }
  var _modelMeta = null;
  function resolvedContext(llm) {
    var n = Number(llm && llm.contextWindow);
    if (n > 1024) return Math.floor(n);
    if (_modelMeta && _modelMeta.id === (llm && llm.model) && _modelMeta.context > 1024) {
      return _modelMeta.context;
    }
    return guessContext(llm && llm.model) || 32768;
  }
  var Api = {
    EMOTIONS,
    ATTITUDES,
    MODE_TTS,
    MODE_PLAY_FX,
    parseTaggedReply,
    buildSystemPrompt,
    AUTO_SECTION,

    screenTagLine,
    withTurnCue,
    formatHistoryReply,
    extractState,
    isPlaceholderModel,
    estTokens,
    guessContext,
    parseModelEntry,
    detectThinkingStyle,
    attachThinking,
    normalizeEffort,
    mapEffort,
    setModelMeta: function(m) {
      _modelMeta = m || null;
    },
    resolvedContext: function() {
      return resolvedContext(Config.section("llm"));
    },

    _localProxy: localProxy,

    _staticPrompt: staticPrompt,
    QWEN_DEFAULT_BASE,
    QWEN_TTS_MODELS,
    FISH_DEFAULT_BASE,
    FISH_TTS_MODELS,

    ttsStyleFor: function(mode) {
      return ttsStyleFor(mode, Config.section("tts"));
    },

    replyLang: function() {
      return window.Langs && Langs.llm() || "ja";
    },

    translate: function(text, toLang) {
      if (!text || !toLang || toLang === Api.replyLang()) {
        return Promise.resolve(text);
      }
      var llm = Config.section("llm");
      if (!llm.apiKey) return Promise.resolve(text);
      var fromLang = Api.replyLang();
      return request(localProxy(upstreamUrl(llm.baseUrl, "/chat/completions")), {
        model: llm.model,
        messages: [
          { role: "system", content: "You are a translator for a companion character (Tsumu) who speaks " + langName(fromLang) + ". Translate her line into " + langName(toLang) + ", keeping the playful spoken tone, first-person feel and emotion. Output ONLY the translated line — no quotes, notes or tags." },
          { role: "user", content: text }
        ],
        temperature: 0.3,
        max_tokens: Math.max(80, llm.maxTokens || 400)
      }, llm.apiKey, 6e4).then(function(j) {
        var c = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
        return c && String(c).trim() || text;
      }).catch(function() {
        return text;
      });
    },

    personaText: function() {
      var base = "";
      try {
        base = persona();
      } catch (e) {
        base = "";
      }
      try {
        var pb = global.Prompts && Prompts.block ? Prompts.block() || "" : "";
        return base + (pb ? "\n\n" + pb : "");
      } catch (e) {
        return base;
      }
    },

    proxyUrl: function(url) {
      return localProxy(url);
    },

    chat: function(history, userText, opts) {
      var llm = Config.section("llm");
      if (!llm.apiKey) return Promise.reject(new Error("NO_KEY"));
      opts = opts || {};
      var st = Config.section("state");
      var outLang = opts.lang || Api.replyLang();
      var mem = "";
      try {
        if (window.LongMem) mem = LongMem.promptForConversation(userText) || "";
      } catch (e) {
        mem = "";
      }
      var system = buildSystemPrompt(
        opts.mode || st.mode,
        opts.style || st.style,
        outLang,
        opts.sceneSection || "",
        "",
        opts.autoSection || ""
      );
      var keep = Math.max(0, (llm.historyTurns || 12) * 2);
      var hist = (history || []).slice(-keep);
      var ctx = resolvedContext(llm);
      var reserve = Math.max(256, Number(llm.maxTokens) || 1200) + 96;
      var budget = Math.max(1024, ctx - reserve);
      function pack(h) {
        return [{ role: "system", content: system }].concat(h).concat([{ role: "user", content: withTurnCue(userText, mem, opts.extra) }]);
      }
      var used = estMessages(pack(hist));
      while (hist.length > 2 && used > budget) {
        hist = hist.slice(2);
        used = estMessages(pack(hist));
      }
      if (used > budget * 0.85) {
        try {
          if (window.Memory) Memory.notifyPressure();
        } catch (e) {
        }
      }
      var baseTokens = Number(llm.maxTokens) || 1200;
      var body = {
        model: llm.model,
        messages: pack(hist),
        temperature: Number(llm.temperature) || 0.9,
        max_tokens: baseTokens
      };
      attachThinking(body, llm, _modelMeta && _modelMeta.id === llm.model ? _modelMeta : null);
      function starved(j) {
        var ch = j && j.choices && j.choices[0];
        var m = ch && ch.message;
        if (!m) return false;
        if (ch.finish_reason === "length") return true;
        if (String(choiceText(j) || "").trim()) return false;
        var thought = String(m.reasoning_content || m.reasoning || "").trim();
        return !!thought;
      }
      if (opts.image) return imageTurn();
      function imageTurn() {
        var turnText = withTurnCue(userText, mem, opts.extra);
        var isDeepSeek = /deepseek/i.test(String(llm.baseUrl || ""));
        var img = String(opts.image);
        function viaChatCompletions() {
          var msgs = [{ role: "system", content: system }].concat(hist).concat([{
            role: "user",
            content: [
              { type: "text", text: turnText },
              { type: "image_url", image_url: { url: img } }
            ]
          }]);
          var b = {
            model: llm.model,
            messages: msgs,
            temperature: Number(llm.temperature) || 0.9,
            max_tokens: baseTokens
          };
          return request(localProxy(upstreamUrl(llm.baseUrl, "/chat/completions")), b, llm.apiKey).then(function(j) {
            return parseTaggedReply(choiceText(j));
          });
        }
        if (!isDeepSeek) return viaChatCompletions();
        var input = hist.map(function(m) {
          return { type: "message", role: m.role, content: String(m.content || "") };
        }).concat([{
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: turnText },
            { type: "input_image", image_url: img }
          ]
        }]);
        var body2 = {
          model: llm.model,
          instructions: system,
          input,
          max_output_tokens: baseTokens
        };
        return request(localProxy(upstreamUrl(llm.baseUrl, "/responses")), body2, llm.apiKey).then(function(j) {
          return parseTaggedReply(responseText(j));
        }).catch(function() {
          return viaChatCompletions();
        });
      }
      function send() {
        if (typeof opts.onProgress === "function") {
          var prog = opts.onProgress;
          var partial = function(j) {
            var ch = j && j.choices && j.choices[0];
            return !!(ch && (ch.finish_reason === "partial" || ch.finish_reason === "length"));
          };
          return requestStream(
            localProxy(upstreamUrl(llm.baseUrl, "/chat/completions")),
            Object.assign({}, body, { stream: true }),
            llm.apiKey,
            12e4,
            prog
          ).then(function(j) {
            if (!starved(j)) return j;
            if (!partial(j)) return j;
            try {
              prog("");
            } catch (e) {
            }
            var bigger2 = Math.min(baseTokens + 1200, 4e3);
            if (bigger2 < baseTokens) bigger2 = baseTokens;
            if (ctx > 0) bigger2 = Math.max(baseTokens, Math.min(bigger2, Math.floor(ctx / 2)));
            body.max_tokens = bigger2;
            return request(localProxy(upstreamUrl(llm.baseUrl, "/chat/completions")), body, llm.apiKey);
          });
        }
        return request(
          localProxy(upstreamUrl(llm.baseUrl, "/chat/completions")),
          body,
          llm.apiKey
        );
      }
      return send().then(function(j) {
        if (!starved(j)) return parseTaggedReply(choiceText(j));
        var bigger = Math.min(baseTokens + 1200, 4e3);
        if (bigger < baseTokens) bigger = baseTokens;
        if (ctx > 0) bigger = Math.max(baseTokens, Math.min(bigger, Math.floor(ctx / 2)));
        body.max_tokens = bigger;
        return send().then(function(j2) {
          return parseTaggedReply(choiceText(j2));
        });
      });
    },

    complete: function(system, user, opts) {
      opts = opts || {};
      var llm = Config.section("llm");
      if (!llm.apiKey) return Promise.reject(new Error("NO_KEY"));
      var cap = opts.maxTokens || 280;
      function once(limit) {
        return request(localProxy(upstreamUrl(llm.baseUrl, "/chat/completions")), {
          model: llm.model,
          messages: [
            { role: "system", content: String(system || "") },
            { role: "user", content: String(user || "") }
          ],
          temperature: opts.temperature != null ? opts.temperature : 0.2,
          max_tokens: limit
        }, llm.apiKey, opts.timeout || 6e4).then(function(j) {
          (function() {
            try {
              if (typeof opts.onMeta !== "function") return;
              var ch = j && j.choices && j.choices[0];
              var m = ch && ch.message;
              opts.onMeta({
                finish_reason: ch && ch.finish_reason || null,
                max_tokens: limit,
                usage: j && j.usage || null,
                reasoning: String(m && (m.reasoning_content || m.reasoning) || "").length
              });
            } catch (e) {
            }
          })();
          return String(choiceText(j) || "").trim();
        });
      }
      return once(cap).then(function(t) {
        if (t || cap >= 4e3) return t;
        return once(Math.min(8e3, cap * 2));
      });
    },
    listModels: function() {
      var llm = Config.section("llm");
      if (!llm.apiKey) return Promise.reject(new Error("NO_KEY"));
      if (!llm.baseUrl) return Promise.reject(new Error("NO_URL"));
      return requestGet(localProxy(upstreamUrl(llm.baseUrl, "/models")), llm.apiKey, 2e4).then(function(j) {
        var raw = j && (j.data || j.models || j.data && j.data.data) || [];
        if (!Array.isArray(raw)) raw = [];
        var out = [];
        raw.forEach(function(m) {
          var e = parseModelEntry(m);
          if (e) out.push(e);
        });
        out.sort(function(a, b) {
          return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        });
        var cur = out.filter(function(e) {
          return e.id === llm.model;
        })[0];
        _modelMeta = cur || (out[0] || null);
        return out;
      });
    },

    listQwenTtsModels: function() {
      var tts = Config.section("tts");
      if (!tts.qwenApiKey) return Promise.reject(new Error("NO_KEY"));
      var root = qwenApiRoot(tts.qwenBaseUrl);
      var urls = [
        root + "/compatible-mode/v1/models",
        root + "/api/v1/models"
      ];
      function pull(i) {
        if (i >= urls.length) return Promise.resolve([]);
        return requestGet(localProxy(urls[i]), tts.qwenApiKey, 2e4).then(function(j) {
          var list = parseQwenModelList(j);
          if (list.length) return list;
          return pull(i + 1);
        }).catch(function() {
          return pull(i + 1);
        });
      }
      return pull(0);
    },

    speak: function(text, lang, mode) {
      var tts = Config.section("tts");
      if (tts.mode === "off") return Promise.resolve(null);
      mode = mode || (Config.section("state") || {}).mode || "chat";
      if ((tts.provider || "openai") === "qwen") return Api._qwenSpeak(text, lang, mode);
      if (tts.provider === "fish") return Api._fishSpeak(text, lang, mode);
      if (tts.provider === "openai_speech") return Api._openaiSpeechSpeak(text, lang, mode);
      if (!tts.apiKey) return Promise.reject(new Error("NO_KEY"));
      var audio = { format: tts.format || "wav" };
      if (tts.mode === "clone") {
        audio.voice = "pending";
      } else {
        audio.voice = tts.presetVoice || "Chloe";
      }
      var model = tts.mode === "clone" ? tts.modelClone : tts.modelPreset;
      if (isPlaceholderModel(model)) {
        return Promise.reject(new Error("NO_MODEL"));
      }
      var styleHint = ttsStyleFor(mode, tts);
      function send(voiceField) {
        audio.voice = voiceField;
        return request(localProxy(upstreamUrl(tts.baseUrl, "/chat/completions")), {
          model,
          messages: [
            { role: "user", content: styleHint },
            { role: "assistant", content: text }
          ],
          audio
        }, tts.apiKey, 18e4).then(function(j) {
          var msg = j.choices && j.choices[0] && j.choices[0].message;
          var data = msg && msg.audio && msg.audio.data;
          if (!data) throw new Error("接口未返回音频");
          return Api._b64ToUrl(data, tts.format === "mp3" ? "audio/mpeg" : "audio/wav");
        });
      }
      if (tts.mode === "clone") {
        return Api._fetchAsDataUrl(tts.reference).then(send);
      }
      return send(audio.voice);
    },

    _openaiSpeechSpeak: function(text, lang, mode) {
      var tts = Config.section("tts");
      if (!tts.apiKey) return Promise.reject(new Error("NO_KEY"));
      var model = tts.mode === "clone" ? tts.modelClone : tts.modelPreset;
      if (isPlaceholderModel(model)) return Promise.reject(new Error("NO_MODEL"));
      var body = {
        model,
        input: String(text == null ? "" : text),
        voice: tts.presetVoice || "alloy",
        response_format: tts.format === "mp3" ? "mp3" : "wav"
      };
      var base = String(tts.baseUrl || "").replace(/\/+$/, "");
      var cands = [base + "/audio/speech"];
      if (!/\/v1$/i.test(base)) cands.push(base + "/v1/audio/speech");
      function tryOne(i) {
        if (i >= cands.length) return Promise.reject(new Error("TTS_ENDPOINT_NOT_FOUND"));
        return requestAudio(localProxy(cands[i]), body, tts.apiKey, 18e4).catch(function(e) {
          var m = String(e && e.message || "");
          if (/404|not.?found|unknown endpoint/i.test(m)) return tryOne(i + 1);
          throw e;
        });
      }
      return tryOne(0);
    },

    _qwenSpeak: function(text, lang, mode) {
      var tts = Config.section("tts");
      if (!tts.qwenApiKey) return Promise.reject(new Error("NO_KEY"));
      var lg = lang || (window.Langs ? Langs.tts() : "ja");
      var langType = window.Langs ? Langs.ttsLangType(lg) : "Auto";
      var model = String(tts.qwenModel || "qwen3-tts-flash").trim() || "qwen3-tts-flash";
      var kind = qwenTtsKind(model);
      var voice = qwenDefaultVoice(model, tts.qwenVoice);
      var input = { text, voice };
      if (kind === "speech") {
        input.format = "wav";
        input.sample_rate = 24e3;
        if (/qwen-audio/i.test(model)) input.language_type = langType;
      } else {
        input.language_type = langType;
      }
      if (qwenWantsInstructions(model)) {
        var style = ttsStyleFor(mode || "chat", tts);
        if (style) {
          if (kind === "speech") input.instruction = style;
          else input.instructions = style;
        }
      }
      return request(localProxy(qwenTtsUrl(tts.qwenBaseUrl, model)), {
        model,
        input
      }, tts.qwenApiKey, 18e4).then(function(j) {
        var aud = j && j.output && j.output.audio;
        var data = aud && String(aud.data || "").trim();
        var url = aud && aud.url;
        if (data) return Api._b64ToUrl(data, "audio/wav");
        if (url) return Api._downloadUrl(url);
        throw new Error("Qwen TTS 未返回音频");
      });
    },

    _downloadUrl: function(url, apiKey) {
      var headers = {};
      if (apiKey) headers.Authorization = "Bearer " + apiKey;
      return fetch(localProxy(qwenHttpsUrl(url)), { headers }).then(function(r) {
        if (!r.ok) throw new Error("音频下载失败 HTTP " + r.status);
        return r.blob();
      }).then(function(blob) {
        return URL.createObjectURL(blob);
      });
    },

    _fishSpeak: function(text, lang, mode) {
      var tts = Config.section("tts");
      if (!tts.fishApiKey) return Promise.reject(new Error("NO_KEY"));
      var compat = fishCompat(tts.fishBaseUrl);
      function synth(voice2) {
        var model = String(tts.fishModel || FISH_TTS_MODELS[0]).trim() || FISH_TTS_MODELS[0];
        var lg = lang || (window.Langs ? Langs.tts() : "ja");
        var fmt = tts.format === "mp3" ? "mp3" : "wav";
        var fishLang = fishLanguage(lg);
        var body;
        if (compat) {
          body = { text, reference_id: voice2, format: fmt };
        } else {
          body = {
            text,
            voiceId: voice2,
            modelId: fishNativeModel(model),
            format: fmt
          };
        }
        if (fishLang) body.language = fishLang;
        if (fishWantsInstruction(model)) {
          var style = ttsStyleFor(mode || "chat", tts);
          if (style) body.instruction = style;
        }
        if (fishWantsEmotion(model)) {
          var emo = fishEmotion();
          if (emo) body.emotion = emo;
        }
        var extra = compat ? { model } : null;
        return requestAudio(
          localProxy(fishTtsUrl(tts.fishBaseUrl)),
          body,
          tts.fishApiKey,
          18e4,
          extra
        );
      }
      var voice = String((mode === "asmr" ? tts.fishVoiceAsmr || tts.fishVoice : tts.fishVoice) || "").trim();
      if (voice) return synth(voice);
      if (String(tts.mode || "") !== "clone") {
        return Promise.reject(new Error("NO_FISH_VOICE"));
      }
      if (_fishCloneWait) return _fishCloneWait.then(synth);
      _fishCloneWait = Api.fishCloneVoice().then(function(vid) {
        try {
          Config.set("tts.fishVoice", vid);
        } catch (e) {
        }
        _fishCloneWait = null;
        return vid;
      }, function(err) {
        _fishCloneWait = null;
        throw err;
      });
      return _fishCloneWait.then(synth);
    },

    fishCloneVoice: function() {
      var tts = Config.section("tts");
      if (!tts.fishApiKey) return Promise.reject(new Error("NO_KEY"));
      if (fishCompat(tts.fishBaseUrl)) {
        return Promise.reject(new Error("当前接口（api.fish.audio 的 /v1/tts）不提供音色复刻：请把「音色模式」改为预设，并在下面直接填 fish.audio 的参考音频 ID"));
      }
      return Promise.all(fishSampleUrls().map(function(url) {
        return fetch(url).then(function(r) {
          if (!r.ok) return null;
          return r.blob().then(function(blob) {
            if (!blob || !blob.size) return null;
            return { blob, name: url.split("/").pop() || "sample.wav" };
          });
        }).catch(function() {
          return null;
        });
      })).then(function(parts) {
        var files = parts.filter(Boolean);
        var wavs = files.filter(function(f) {
          return /\.wav$/i.test(f.name);
        });
        if (wavs.length) files = wavs;
        if (!files.length) {
          throw new Error("找不到可用的本地参考音频（请在设置里指定一个音频文件）");
        }
        var fd = new FormData();
        fd.append("name", "tsumu");
        fd.append("description", "Local Tsumu reference clone");
        fd.append("visibility", "private");
        fd.append("languages", JSON.stringify(["ja", "zh", "en"]));
        files.forEach(function(f) {
          fd.append("audioFiles", f.blob, f.name);
        });
        return requestForm(
          localProxy(fishApiRoot(tts.fishBaseUrl) + "/voices"),
          fd,
          tts.fishApiKey,
          18e4
        );
      }).then(function(j) {
        var vid = j && (j.voiceId || j.voice_id);
        if (!vid) throw new Error(apiErrorMessage(j, 200, "") || "未返回 voiceId");
        return vid;
      });
    },

    qwenCloneVoice: function() {
      var tts = Config.section("tts");
      if (!tts.qwenApiKey) return Promise.reject(new Error("NO_KEY"));
      var target = String(tts.qwenCloneTarget || "qwen3-tts-vc-2026-01-22").trim();
      return Api._fetchAsDataUrl(tts.reference).then(function(dataUri) {
        return request(localProxy(qwenTtsUrl(tts.qwenBaseUrl, "voice-enrollment")), {
          model: "voice-enrollment",
          input: {
            action: "create_voice",
            target_model: target,
            prefix: "tsumu",
            preferred_name: "tsumu",
            url: dataUri
          }
        }, tts.qwenApiKey, 12e4);
      }).then(function(j) {
        var out = j && j.output;
        var vid = out && (out.voice_id || out.voice);
        if (!vid) throw new Error(apiErrorMessage(j, 200, "") || "未返回 voice_id");
        return vid;
      });
    },
    _b64ToUrl: function(b64, mime) {
      var bin = atob(b64), arr = new Uint8Array(bin.length), i;
      for (i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([arr], { type: mime }));
    },

    _fetchAsDataUrl: function(path) {
      return fetch(path).then(function(r) {
        if (!r.ok) throw new Error("无法读取参考音频：" + path);
        return r.arrayBuffer();
      }).then(function(buf) {
        var bytes = new Uint8Array(buf), s = "", i;
        for (i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        return "data:audio/wav;base64," + btoa(s);
      });
    }
  };
  global.Api = Api;
})(window);
