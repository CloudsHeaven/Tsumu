"use strict";
const { importDep, requireDep } = require("../src/deps");
(async () => {
  const m = await importDep("mpg123-decoder");
  console.log("module keys :", Object.keys(m).join(", "));
  const D = m.MPEGDecoder;
  console.log("MPEGDecoder :", typeof D);
  if (D) {
    console.log("static      :", Object.getOwnPropertyNames(D).join(", "));
    const d = new D({ sampleRate: 44100, channels: 2 });
    console.log("proto       :", Object.getOwnPropertyNames(Object.getPrototypeOf(d)).join(", "));
    console.log("own         :", Object.getOwnPropertyNames(d).join(", "));
    console.log("ready       :", d.ready && typeof d.ready.then);
    if (d.ready) await d.ready;
    console.log("after ready ok");
  }
  try {
    const pkg = requireDep("mpg123-decoder/package.json");
    console.log("pkg version :", pkg.version, "| exports:", JSON.stringify(pkg.exports));
  } catch (e) {
    console.log("pkg read    :", e.message);
  }
})();
