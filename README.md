# Tsumu

一个本地优先（local-first）的桌面陪伴应用：Electron + Live2D 立绘 + 可接入的 LLM / TTS，
带长期 / 超长期记忆、回忆重放、番茄钟 · 待办 · 日记、音乐 / ASMR 播放与网页检索。

对话、记忆、语音与曲库缓存全部保存在**本机**（Chromium 的 localStorage / IndexedDB，
由主进程镜像为一份可备份的 JSON），不依赖任何自建服务器。

> 本仓库是**发布快照**（对应私有仓提交 `39e9e13`）：为保证公开内容不含内部记录，
> **所有代码注释已移除**；目录结构与开发仓一致，功能完整、可直接运行。

---

## 一、功能

| 模块 | 说明 |
|---|---|
| 对话 | 可配置多种 LLM 服务；流式输出；界面支持中文 / 繁體中文 / 日本語 / English |
| 立绘 | Live2D 模型面板、表情与道具、发型切换、缩放 / 拖动 / 复位、视线跟随、离线口型包络（由 `tools/tsumu-tools` 生成）|
| 长期记忆 | 两段式：整理通道把对话蒸馏为条目与摘要；注入通道按重要度、时间与关键词选择注入，带归档去重。这一层和多数陪伴类应用的做法相近 |
| 超长期记忆 · 记忆自主决策 | 重要条目升入只增不减的永久索引，永不淘汰；她可以自己决定「这件事要记住」（`memo:` 直写入库，不经整理通道）；问起往事时按相关性检索最相关的几条，带事件发生日期与她当时的感受 |
| 回忆 | 每条对话的语音可回放，播放 / 暂停可切换；卡片可收藏、可删除 |
| 语音 | 可接多种 TTS 服务；合成结果缓存到 IndexedDB，可设容量上限并自动淘汰 |
| 番茄钟 | 专注 / 休息状态机、内置音源（音源文件需自备，见第四节）、环境音、跟随主窗口的悬浮计时 |
| 番茄钟 · 回忆气泡 | 专注期间从**超长期记忆**里抽取条目，以气泡形式浮现（每约 8 秒一条、同屏最多 3 条）；同一条 3 天内不再重复；默认「含蓄模式」只露日期与类别，悬停才看全文 |
| 待办 / 日记 | 独立数据层（`tsumu.todo.v1` / `tsumu.diary.v1`） |
| 音乐 · ASMR | 本地曲库（文件夹或 zip 导入）、封面、歌词、增益与 ducking；音乐的口型同步需先用配套工具生成人声包络，ASMR 无需该步骤 |
| 网页检索 | 由主进程代理请求，规避渲染层 CORS 限制 |
| 存档 | 整包导出 / 导入，以及 3 个存档槽；导出时自动剔除 API Key |

**曲库组织建议**。封面与歌词均按「同目录同名」规则匹配：`晴天.mp3` 对应 `晴天.jpg` 与 `晴天.lrc`；
同目录下以 `cover` / `folder` / `封面` 等命名的图片，会作为该目录曲目的共用封面。据此建议：

- **音乐**：每首歌单独一个文件夹，音频、封面与歌词置于同一目录；
- **ASMR**：每个系列单独一个文件夹，目录内放置一张 `cover.jpg` 作为系列封面，各音轨共用；
  需要逐条歌词时，为该音轨添加同名的 `.lrc` 文件。

列表会以弱化颜色标注子目录名，不同目录下的同名音频亦可区分。

**口型同步（可选）**：音乐含伴奏，实时分析得到的只是整首歌的响度，口型会跟着鼓点走。
如需口型贴合人声，先用配套工具 `tools/tsumu-tools`（发布包 `Tsumu-Tools` 已自带分离模型）生成
**与音频同目录同名**的人声包络（`晴天.mp3` ↔ `晴天.vocals.env`），播放时即按该包络驱动口型；
未生成时退化为实时响度分析，口型仍会动作，但不与人声严格对应。
ASMR 以人声为主体，通常无需该步骤；且长音频（如整场 ASMR）不宜离线解码整轨，实时分析更省内存。

---

## 二、快速开始（Windows）

有两条路，任选其一。

### 方式 A：直接下载（只想试用 → 推荐）

到本仓库的 **Releases** 页面下载 `Tsumu-v<版本>-win-x64.zip`，解压后双击 `Tsumu.exe` 即可运行，
不需要安装 Node。

- 包内**不含**模型与音源（见第四节）：首次启动会提示未安装模型，这属于预期
- 该包**未签名**：若 Windows 提示「未知发布者」，选择「更多信息 → 仍要运行」即可
- 想核对来源：对照 Release 说明里的提交号，或用仓库内 `build-portable.ps1` 自行构建比对

### 方式 B：从源码运行

前置：**Node.js 22.12 或更高**（Electron 44 的 npm 包声明 `engines.node >= 22.12.0`；Node 18 / 20 在安装阶段会告警甚至失败）。

```powershell
git clone <本仓库地址>
cd Tsumu/shell
npm ci          # 按 package-lock.json 安装锁定版本的依赖（比 npm install 更可复现）
npm start       # 以源码方式启动（读 ..\web，不是打包副本）
```

#### 打包成免安装版

```powershell
powershell -ExecutionPolicy Bypass -File build-portable.ps1    # 一条命令：构建 + 复制 web + 打 zip
```

也可以手工分两步（**第二步不能省**）：

```powershell
cd shell
npm run pack                                              # 产物：<仓库上一级>\Tsumu\win-unpacked
xcopy /E /I ..\web ..\..\Tsumu\win-unpacked\resources\web    # 打包态从 resources\web 读界面
```

> 只跑 `npm run pack` 而不复制 `web\` 的话，窗口会是**白屏**：主进程在打包态只从
> `resources\web` 提供 `tsumu://app/` 页面，而 `shell/package.json` 的 `build.files` 不含 `web\`。

产物位置由 `shell/package.json` 的 `build.directories.output` 决定（默认是仓库**上一级**的 `Tsumu\`）；
上面的 `build-portable.ps1` 会把它改到仓库内的 `dist\`，并自动打 zip。
未自备图标时打包**不会失败**：electron-builder 会退回 Electron 默认图标，并在日志中给出
`reason: application icon is not set`。

### 首次启动会看到什么（两种方式都一样）

立绘区提示「没有读到模型信息（未安装模型）」，聊天提示未配置 —— 这是**预期状态**，不是安装失败：
模型需自备（见第四节，可在界面里直接导入），LLM / TTS 凭据需在**设置**页自填。

首次启动后，在**设置**页填入自己的 LLM / TTS 服务凭据即可开始对话；凭据保存在本机
`%APPDATA%\Tsumu\` 下，不随仓库分发。

---

## 三、目录结构

```
web/                渲染层（明文 HTML / CSS / JS，改动即时生效）
  index.html        主界面
  l2d.html          立绘调试页
  css/min.css       样式
  js/               功能模块（见下）
  vendor/cubism/    Live2D Cubism SDK for Web（第三方，自带 LICENSE.md）
shell/              Electron 主进程
  main.js           窗口、tsumu:// 协议、下载保存、存档读写
  preload.js        渲染层安全桥（window.tsumuShell）
  web-storage.js    localStorage 与磁盘 JSON 的镜像（先写临时文件再改名）
  dev.ps1           以源码方式启动（改 web/ 自动刷新）
tools/              辅助脚本（模型索引生成等）
  tsumu-tools/      配套工具：人声分离 + 歌词打点（独立运行，见该目录 README）
```

`web/js/` 主要模块：

| 文件 | 职责 |
|---|---|
| `min.js` | 界面接线与面板逻辑 |
| `api.js` | LLM / TTS 请求，各模式的语气与播放参数 |
| `longmem.js` | 长期记忆：整理通道与注入通道 |
| `dialoglog.js` | 对话记录（回忆页数据层） |
| `voicecache.js` | 语音缓存（IndexedDB `tsumu_voice` / store `clips`） |
| `l2d-*.js` | 立绘：模型、舞台、存储、能力探测 |
| `player.js` / `audio-lib.js` / `lyrics.js` | 音乐与 ASMR |
| `pomo*.js` / `todo.js` / `diary.js` | 番茄钟 / 待办 / 日记 |
| `i18n.js` | 四语言词条（新增键必须四语言齐全） |
| `config.js` / `store.js` | 设置默认值与持久化 |

---

## 四、需要自备的内容

本仓库**刻意不包含**以下内容：

| 内容 | 放置位置 | 说明 |
|---|---|---|
| Live2D 模型 | `web/assets/models/<名称>/`，或用界面导入 | 需要 `<名称>.model3.json`、`.moc3`、贴图等；请自行确认拥有使用与分发权利 |
| 番茄钟音源 | `web/audio/pomo/lofi/`、`web/audio/pomo/ambient/` | 清单 `web/audio/pomo/manifest.json` 已在仓库内 |
| 应用图标 | `shell/build/icon.png` | 正方形 PNG；缺失只会退回 Electron 默认图标，不影响构建 |

缺少模型时应用不会崩溃：界面显示「没有读到模型信息（未安装模型）」，并保留导入入口。

导入模型有两种方式：

1. **界面导入（推荐）**：设置 → 立绘 →「导入模型」（选择文件夹）或「导入 zip」。
   导入结果存进本机的 **IndexedDB**（库 `tsumu_l2d`，表 `models` / `files`），切到该模型即可使用。
   它的物理位置是 Chromium 的用户数据目录 `<用户目录>\AppData\Roaming\Tsumu\IndexedDB\`，
   **不是**安装目录，也不是可以随意指定的文件夹 —— 因此换机器、清空用户数据会丢失，
   重要模型请用同一处的**导出 zip**（连名字映射表一起打包）自行备份或分享。
2. **放目录**：把模型文件夹放到 `web/assets/models/<名称>/`（打包版放到
   `<安装目录>/resources/web/assets/models/<名称>/`），重启后生效。

`tsumu.index.json` 是可选清单：有它时表情 / 动作面板才能列全；没有则回退读取
`model3.json`（面板可能列不全，运行不受影响）。可用 `tools/build-model-index.js` 生成。

---

## 五、许可

本仓库分三层，请分别对待：

1. **本项目自行编写的代码**（`shell/`、`tools/`，以及 `web/` 中除 `vendor/` 的部分）
   —— MIT License，见 [LICENSE](LICENSE)。

2. **`web/vendor/cubism/`（Live2D Cubism SDK for Web）**
   —— 不适用 MIT，遵循其自身许可（Cubism Core 为专有许可，Framework 与示例为开放许可），
   详见该目录下的 `LICENSE.md`。若用于商业用途，请注意官方门槛：
   最近一个会计年度营业额达到 1000 万日元及以上的事业者需另行取得发行许可。

3. **Live2D 模型与音源**：不在本仓库内。请自备，并自行确保拥有相应权利；此部分与 MIT 无关。

第三方组件的完整声明（含 Cubism SDK 的分层许可）见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

---

## 六、开发约定

- `web/**` 为明文：**源码方式**下改完直接生效；打包版需重新打包（`web` 会被复制进 `resources\web`）。
- `shell/**` 改动后需重启（源码方式）或重新打包（主进程在 `app.asar` 内）。
- 行尾与编码有讲究：`web/js/config.js`、`web/js/i18n.js` 为 CRLF，`min.css`、`index.html` 为 LF，
  全部无 BOM。仓库根 `.gitattributes` 已声明 `-text`，请勿开启 `core.autocrlf`，否则逐文件哈希会变。
- 新增 i18n 键必须四语言齐全（zh / ja / en / zh-tw）。
- `min.css` 在 `index.html` 中以 `?v=` 携带版本号，修改样式后请同步更新，避免缓存滞留旧样式。
- `web/vendor/cubism/**` 属第三方，请勿改动（包括其注释与许可声明）。

---

## 七、第三方

- [Electron](https://www.electronjs.org/)
- [Live2D Cubism SDK for Web](https://www.live2d.com/en/sdk/download/web/)（见 `web/vendor/cubism/LICENSE.md`）

---

## 八、免责声明

本项目仅供个人学习与自用。使用第三方模型、音源以及任何 LLM / TTS 服务时，
请遵守各自的许可与服务条款。作者不对因使用本项目所产生的任何后果负责。

---

## 相关项目：Tsumu-BOT

同一位角色的**群聊版本**：面向 QQ 群的 AI 机器人。QQ 协议侧通过 OneBot 11 兼容的运行时后端接入
（支持 NapCat 与 SnowLuma，二者择一，不能同时启动）；项目自身仅使用 Node 内置模块，
无第三方运行时依赖。沿用本项目的人设写法与记忆分层，并针对群聊场景重新设计：

- **情绪状态持久化**：精力、心情、兴致、安定四项数值随对话变化，并按各自时间常数回弹
  （精力回归满值而非基线）；状态落盘，重启后延续，道歉可使心情实际回升。
- **好感按人计量**：全局心情不分对象，另按用户记录好感 —— 他人冒犯不影响对主人的好感；
  精力偏低时，对熟悉者措辞更近，对陌生者保持距离。
- **群友关系图**：以共现统计与社区发现推断互动结构，纯算术实现，不调用模型；随机种子固定，结果可复现。
- **本地控制台**：仅监听 127.0.0.1 的网页面板，可查看情绪、记忆与关系状态；因含写操作，
  实施 Host 校验、请求头令牌与同源校验，用于防护 DNS 重绑定与 CSRF。
- **视频与音乐**：B 站链接按字幕、简介、热评与弹幕三级取材理解内容，无法取得正片时明确说明；
  点歌以网易云音乐卡片形式发送。
- **档案按群隔离**：人物档案以（群, 用户）为键分别保存，同一用户在不同群互不串档。
- **超长期记忆（重做版 · 仅用于与主人的私聊）**：把原来的「常驻上限」拆成保留期与在场两个正交维度
  —— 值得留的条目不设上限、一条都不会丢，而每轮只拼 6 条；另立三条公理：原始事实写入后不再被模型改写、
  可重建的只当派生缓存、每条都能追溯到原话。群友的发言只进长期记忆，不进这一层。
  该部分仍在测试中，效果达标后可能回迁到 Tsumu 本体。

该项目仍在私有开发中，**待稳定后单独开源**；本仓库不含它的任何代码。
