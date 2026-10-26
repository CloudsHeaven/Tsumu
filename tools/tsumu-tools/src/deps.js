"use strict";
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const CANDIDATES = [
  path.join(__dirname, "..", "node_modules"),
  process.env.TSUMU_TOOLS_NODE_MODULES || ""
].filter(Boolean);
function addPaths() {
  for (const p of CANDIDATES) {
    if (fs.existsSync(p) && !module.paths.includes(p)) module.paths.push(p);
  }
}
function requireDep(name) {
  addPaths();
  return require(name);
}
async function importDep(name) {
  addPaths();
  const entry = require.resolve(name);
  return import(pathToFileURL(entry).href);
}
module.exports = { requireDep, importDep, addPaths };
