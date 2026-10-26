"use strict";
const fs = require("fs");
const path = require("path");
const { decodeAudio } = require("../src/decode");
const { writeWav16 } = require("../src/wav");
const SRC = process.env.TSUMU_FIXTURE_SRC || process.argv[2] || "";
const OUT = process.env.TSUMU_FIXTURE_OUT || require("path").join(__dirname, "..", "out", "fixture");
if (!SRC || !require("fs").existsSync(SRC)) {
  console.error("用法: node test/make-fixture.js <任意音频文件>   （TSUMU_FIXTURE_SRC / TSUMU_FIXTURE_OUT 可覆盖）");
  process.exit(1);
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const a = await decodeAudio(SRC);
  const n = Math.min(a.numFrames, 30 * a.sampleRate);
  const ch = a.channels.length > 1 ? [a.channels[0].subarray(0, n), a.channels[1].subarray(0, n)] : [a.channels[0].subarray(0, n)];
  const dst = path.join(OUT, "probe-song.wav");
  writeWav16(dst, ch, a.sampleRate);
  console.log(`素材: ${dst}  ${(n / a.sampleRate).toFixed(1)}s  ${a.sampleRate}Hz  ${ch.length}ch  ${(fs.statSync(dst).size / 1048576).toFixed(2)}MB`);
})();
