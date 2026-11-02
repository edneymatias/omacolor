// Loads a QML `.pragma library` JS file into a fresh vm context and returns its functions.
// `.import "X.js" as Name` lines are resolved like QML does. Results are cloned out of the
// vm realm so `assert.deepEqual` compares plain objects.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function loadRaw(file, baseDir) {
  const full = path.resolve(baseDir, file);
  const raw = fs.readFileSync(full, "utf8");
  const sandbox = {};
  for (const match of raw.matchAll(/^\.import\s+"([^"]+)"\s+as\s+(\w+)\s*$/gm)) {
    sandbox[match[2]] = loadRaw(match[1], path.dirname(full));
  }
  vm.runInNewContext(raw.replace(/^\.(pragma|import)\b.*$/gm, ""), sandbox, { filename: full });
  return sandbox;
}

function load(file) {
  const sandbox = loadRaw(file, path.join(__dirname, ".."));
  const api = {};
  for (const name of Object.keys(sandbox)) {
    api[name] = typeof sandbox[name] === "function"
      ? (...args) => clone(sandbox[name](...args))
      : clone(sandbox[name]);
  }
  return api;
}

module.exports = { load };
