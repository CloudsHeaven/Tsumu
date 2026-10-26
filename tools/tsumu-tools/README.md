# Tsumu Tools

Tsumu 的配套工具集，独立于主程序运行，两者之间只有**文件命名约定**，没有代码依赖。

| 工具 | 作用 |
|---|---|
| **人声分离** | 把歌曲中的人声提取成「口型包络」与「单声道人声 WAV」，供主程序驱动立绘口型与试听 |
| **打点工具** | 给没有时间轴的歌词做 LRC：拖入音频、逐句打点、导出单语或双语歌词 |

---

## 一、人声分离

立绘口型应跟随**人声轨**而非整首混音的响度：若直接以混音包络驱动，打击乐等瞬态成分会导致口型误触发。
本工具在本地离线执行一次 ONNX 人声分离，将结果固化为两个小文件；主程序运行时按时间索引查表即可，
无需解码与实时分析，且与音频严格同步。

| 产物 | 内容 | 体积 | 用途 |
|---|---|---|---|
| `<歌名>.vocals.env` | 60 Hz 人声 RMS 包络 | 约 0.86 MB/小时 | **主程序口型驱动用**（只读这个） |
| `<歌名>.vocals.wav` | 16 kHz 单声道人声 | 约 115 MB/小时 | 试听 / 备用 PCM |
| `<歌名>.non_vocals.wav` | 伴奏（加 `--keep-instrumental` 才有） | 同上 | 核对分离质量 |

主程序侧只需 `env[Math.floor(audio.currentTime * 60)]` 查表即可，取值方式与 TTS 离线包络完全一致。

分离完成后，产物默认写入**音频文件所在目录**，与歌曲并列存放；如需改到别处，用 `--out` 指定。
主程序会在**歌曲所在目录**查找同名的 `<曲名>.vocals.env` 来驱动口型 —— 放在歌曲旁边最省事。

### 方式 A：下载免安装版（推荐）

到本仓库的 **Releases** 页面下载 `Tsumu-Tools-v<版本>-win-x64.zip`（约 270 MB，已带 Electron、onnxruntime 与 MDX-Net 模型，
**不需要**安装 Node），解压后：

1. 双击 `Tsumu-Tools.exe` —— 包内**已附带** `resources\app\models\UVR-MDX-NET-Voc_FT.onnx`，开箱可用
2. 想换别的模型：把新的 `*.onnx` 放进 `resources\app\models\`，并删掉自带那一个
   （工具取该目录里第一个 `*.onnx`）

包内没有应用图标，且未签名：Windows 可能提示「未知发布者」，选「更多信息 → 仍要运行」即可。
自带模型的来源与署名见第三节「模型来源与许可」。

### 方式 B：命令行（从源码）

```powershell
cd tools/tsumu-tools
npm install                               # 一次性：安装 onnxruntime-node 与 mpg123-decoder（需联网）
node separate.js "D:\Music\某首歌.mp3"     # 输出到音频同目录
node separate.js "D:\Music" --recursive    # 整个目录（支持 mp3/m4a/flac/wav/ogg/opus）
```

可选参数：

| 参数 | 说明 |
|---|---|
| `--out <目录>` | 指定输出目录（默认与音频同目录） |
| `--recursive` | 递归处理子目录 |
| `--keep-instrumental` | 额外输出 `non_vocals.wav` |
| `--force` | 已存在产物时重新分离 |

### 方式 C：图形界面（从源码）

> 上面「方式 A」的发布包**已内置 Electron 运行时**，用发布包的人不需要看这一节；
> 这一节只针对**从源码**跑工具的情况：源码里不带 Electron（避免重复两百多 MB），需要借一份现成的。

```powershell
cd tools/tsumu-tools
npm install                                            # 一次性：装 onnxruntime-node 与 mpg123-decoder（需联网）
..\..\shell\node_modules\.bin\electron.cmd electron   # 复用主项目源码里装好的 Electron
```

这条命令要求你在主项目的 `shell` 目录跑过 `npm ci`。若没有主项目环境，二选一：

- `npm i -D electron@44`，然后 `npx electron electron`
- 系统里已有 Electron：`npx electron electron`，或把 `TSUMU_ELECTRON` 指向 `electron.exe`

> **注意**：主项目**免安装 zip** 里的 `Tsumu.exe` 不能当 Electron 运行时用 —— 它是打包应用，
> 会固定加载自己内置的界面。要跑工具界面，请用上面的方式 A 或本节的两种做法。

界面里可以选目录、看进度、单曲重跑，也能切换到「打点工具」标签页。


---

## 二、打点工具

一个纯静态页面，**不需要 Electron**：直接用浏览器打开 `electron/tapper.html` 即可。

```powershell
start electron\tapper.html
```

> 用「方式 A」的发布包时，打点页**已经内置在界面里**：启动 `Tsumu-Tools.exe`，点顶部「打点工具」标签即可。
> 不想开界面也可以直接用浏览器打开 `resources\app\electron\tapper.html` —— 同一份页面，纯静态、免 Electron。

用法：

1. 填标题（决定导出文件名，也用于区分不同歌曲的打点存档）
2. 拖入音频文件，或点「选择音频」
3. 左栏填**原文**、右栏填**译文**（可选，行数需与原文一致）
4. 边听边按**空格**打点，自动跳到下一句；`Z` 撤销、`Y` 重做、`Enter` 播放/暂停、`←/→` 前后 2 秒
5. 可「导入现有 LRC」解析后继续修，或「等距粗排」先铺一版再微调
6. 导出：单语 LRC（界面显示的那一份）／双语 LRC（原文段 + 译文段，时间戳相同）

时间轴、标题与两栏文本会自动存进浏览器 localStorage（按标题区分），刷新不丢。

---

## 三、需要自备的内容

| 内容 | 放置位置 | 说明 |
|---|---|---|
| **人声分离模型** | 源码运行：`models/`<br>发布包运行：`resources\app\models\`（**已附带** `UVR-MDX-NET-Voc_FT.onnx`） | MDX-Net 系列 ONNX 均可，工具取目录里第一个 `*.onnx`；自带模型的来源与署名见下文 |

缺少模型时工具不会崩溃：扫描阶段会明确报「找不到 models 目录 / 目录里没有 .onnx 模型」，
界面上的状态栏也会显示同样的原因。

### 模型来源与许可

发布包内的 `UVR-MDX-NET-Voc_FT.onnx` 来自 **Ultimate Vocal Remover（UVR）** 项目，本项目不拥有其版权。

- UVR 的**代码**为 MIT 许可；其官方 README 的 License 段明确允许第三方应用使用其**模型**，条件是署名：
  > "For all third-party application developers who wish to use our models, please honor the MIT license by providing credit to UVR and its developers."
- 因此本发布包附带该模型，并按上述要求署名：
  **UVR（Anjok07 及 UVR 开发者）· 模型托管 TRvlvr/model_repo · MDX-Net 架构 Kuielab & Woosung Choi**
- 模型文件内嵌注释记录了原始下载地址：`https://github.com/TRvlvr/model_repo/releases`
- 完整声明与 sha256 见仓库根 `THIRD-PARTY-NOTICES.md` 第 2.2 节

该模型按原样提供，不对其分离效果作任何担保。

---

## 四、打包（可选）

仓库里带了一份构建配置 `electron-builder.json`，请用它（**不要**用默认配置）：

```powershell
cd tools/tsumu-tools
npm i -D electron-builder
npx electron-builder --config electron-builder.json
```

配置里做了三件必要的事：把入口指到 `electron/main.js`（本包 `package.json` 的 `main` 是命令行入口
`separate.js`，用默认配置打出来的包**不会开窗口**）、关闭 asar（`models/` 与原生依赖需按真实路径读取）、
固定 Electron 版本（electron-builder 不接受 `^` 范围）。

产物在 `dist\win-unpacked\`（配置里 `win.target` 为 `dir`，即免安装目录）。要出安装包，把 `dir` 改成 `nsis`。

> 未提供图标时打包不会失败，只会退回 Electron 默认图标。
> 本仓库不包含应用图标（与主程序同源的图标属第三方美术，不随仓库分发）。

---

## 五、许可与致谢

- 本工具的代码：**MIT**（见仓库根 `LICENSE`）
- 人声分离模型：版权归 UVR 项目，MIT 许可 + 署名要求，详见根目录 `THIRD-PARTY-NOTICES.md`
- 依赖：[onnxruntime-node](https://github.com/microsoft/onnxruntime)、[mpg123-decoder](https://github.com/eshaz/wasm-audio-decoders)、[Electron](https://www.electronjs.org/)

---

## 六、开发约定

- `src/` 里是纯 Node 模块（无 DOM 依赖），可单独跑：`node test/test-dsp.js`
- `electron/` 是界面层，主进程与渲染层通过 `preload.js` 暴露的 `window.api` 通信
- 行尾与编码：全部 UTF-8 无 BOM；`.gitattributes` 已声明 `-text`，请勿开启 `core.autocrlf`
