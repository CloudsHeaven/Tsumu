# 第三方组件与素材声明

本仓库**不包含** Live2D 模型、音频素材与应用图标（人声分离模型随工具包发布，见第 2.2 节）；下列第三方组件随仓库分发，各自的许可如下。

## 1. Live2D Cubism SDK for Web（`web/vendor/cubism/`）

- 不适用本仓库的 MIT 许可，遵循其自身许可：
  - **Cubism Core**：Live2D Proprietary Software License
  - **Cubism Framework / Web Samples**：Live2D Open Software License
- 完整条款见 `web/vendor/cubism/LICENSE.md`（该目录**原样保留**，请勿修改）。
- 商业使用注意：最近一个会计年度营业额达到 1000 万日元及以上的事业者，
  需另行取得 Cubism SDK 的发行许可。

## 2. 模型

### 2.1 Live2D 模型（不随仓库分发）

本仓库与主程序发布包均**不提供** Live2D 模型文件。使用者需自备，并自行确认其授权。

### 2.2 人声分离模型（随工具包发布，附署名）

工具包 `Tsumu-Tools-v1.0.0-win-x64.zip` 的 `resources\app\models\` 内**附带**：

| 文件 | 大小 | sha256 |
|---|---|---|
| `UVR-MDX-NET-Voc_FT.onnx` | 63.7 MB | `E411182CE2C53541FEFDCC99A8F46F2FE03978EB22038B9497C1D9D95A00FAD4` |

**来源与许可依据**

- 模型来自 **Ultimate Vocal Remover（UVR）** 的模型仓库（`TRvlvr/model_repo` releases）；
  该文件内嵌注释记录了下载地址：`https://github.com/TRvlvr/model_repo/releases`
- UVR 官方 README 的 License 段明确允许第三方应用使用其模型，条件是署名：
  > "For all third-party application developers who wish to use our models, please honor the MIT license by providing credit to UVR and its developers."
- 本项目据此在发布包中附带该模型，并作如下署名：

**Model credits**

- **Ultimate Vocal Remover GUI** — Anjok07 及 UVR 开发者（https://github.com/Anjok07/ultimatevocalremovergui ，代码 MIT 许可）
- **模型托管与维护** — TRvlvr（https://github.com/TRvlvr/model_repo ）
- **MDX-Net 架构** — Kuielab & Woosung Choi（https://github.com/kuielab ）
- 训练脚本与实现协助 — KimberleyJSN、Hv 等（完整名单见 UVR README 的 Credits 段）

该模型按原样提供，本项目不对其准确性、适用性或分离效果作任何担保。
上述署名与声明不改变本仓库的 MIT 许可，也不表示本项目与 UVR 存在隶属关系或获得其背书。

仓库内**不含**该二进制文件（避免大文件进入版本历史），它只在构建发布包时从本机拷贝，
并在构建脚本里校验上表 sha256。

## 3. 音频与图标（不随仓库分发）

番茄钟内置音源、应用图标均为第三方素材，不在本仓库内；请自备并自行确认授权。
