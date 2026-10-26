/* Cubism Framework 的自定义聚合入口
 *
 * 为什么需要它：SDK 入口 `live2dcubismframework.ts` 只导出 `CubismFramework` 等少数符号，
 * 而渲染需要的 `CubismMoc` / `CubismRenderer_WebGL` / `CubismPhysics` 等要从各自模块单独引入。
 * SDK Demo 用 webpack 按需 import；本项目没有打包器链，所以用 esbuild 把本文件打成
 * 一个单文件 ESM（`web/vendor/cubism/dist/cubism-framework.js`），页面直接 import 使用。
 *
 * 用法（在项目根目录；注意路径都带 `web\`，本文件实际在 web\vendor\cubism\ 下）：
 *   shell\node_modules\.bin\esbuild.cmd web\vendor\cubism\fw-entry.ts --bundle --format=esm `
 *     --target=es2020 --outfile=web\vendor\cubism\dist\cubism-framework.js
 */
export { CubismFramework, Option, LogLevel } from './Framework/src/live2dcubismframework';
/* SDK 约定的参数名常量（ParamAngleX / ParamEyeLOpen / ParamBreath ...） */
export { CubismDefaultParameterId } from './Framework/src/cubismdefaultparameterid';

/* 模型装载 */
export { CubismMoc } from './Framework/src/model/cubismmoc';
export { CubismModel } from './Framework/src/model/cubismmodel';
export { CubismUserModel } from './Framework/src/model/cubismusermodel';
export { CubismModelUserData } from './Framework/src/model/cubismmodeluserdata';
export { CubismModelSettingJson } from './Framework/src/cubismmodelsettingjson';

/* 渲染 */
export { CubismRenderer_WebGL } from './Framework/src/rendering/cubismrenderer_webgl';
export { CubismShader_WebGL } from './Framework/src/rendering/cubismshader_webgl';
export { CubismMatrix44 } from './Framework/src/math/cubismmatrix44';
export { CubismModelMatrix } from './Framework/src/math/cubismmodelmatrix';
export { CubismViewMatrix } from './Framework/src/math/cubismviewmatrix';
export { CubismVector2 } from './Framework/src/math/cubismvector2';

/* 物理 / 姿势 */
export { CubismPhysics } from './Framework/src/physics/cubismphysics';
export { CubismPose } from './Framework/src/effect/cubismpose';

/* 动作 / 表情 / 自动效果 */
export { CubismMotion } from './Framework/src/motion/cubismmotion';
export { CubismExpressionMotion } from './Framework/src/motion/cubismexpressionmotion';
export { CubismEyeBlink } from './Framework/src/effect/cubismeyeblink';
export { CubismBreath } from './Framework/src/effect/cubismbreath';
export { CubismLook, LookParameterData } from './Framework/src/effect/cubismlook';
export { CubismTargetPoint } from './Framework/src/math/cubismtargetpoint';
export { ACubismMotion } from './Framework/src/motion/acubismmotion';
export { CubismMotionQueueManager } from './Framework/src/motion/cubismmotionqueuemanager';
export { CubismExpressionMotionManager } from './Framework/src/motion/cubismexpressionmotionmanager';

/* v5 的统一更新调度：眨眼/呼吸/物理/姿势等都通过它按序更新 */
export { CubismUpdateScheduler } from './Framework/src/motion/cubismupdatescheduler';
export { ICubismUpdater, CubismUpdateOrder } from './Framework/src/motion/icubismupdater';
export { CubismEyeBlinkUpdater } from './Framework/src/motion/cubismeyeblinkupdater';
export { CubismBreathUpdater } from './Framework/src/motion/cubismbreathupdater';
export { CubismPhysicsUpdater } from './Framework/src/motion/cubismphysicsupdater';
export { CubismPoseUpdater } from './Framework/src/motion/cubismposeupdater';
export { CubismExpressionUpdater } from './Framework/src/motion/cubismexpressionupdater';
export { CubismLookUpdater } from './Framework/src/motion/cubismlookupdater';
export { CubismLipSyncUpdater } from './Framework/src/motion/cubismlipsyncupdater';

/* 常用工具
   注意：Cubism SDK v5 的 Framework 已不再提供 csmVector / csmMap
   （内部改用原生 Array<T> / Map），所以这里不导出它们。 */
export { CubismIdHandle } from './Framework/src/id/cubismid';
export { updateSize } from './Framework/src/utils/cubismarrayutils';
export { CubismLogInfo, CubismLogError, CubismLogWarning } from './Framework/src/utils/cubismdebug';
