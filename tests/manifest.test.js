const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

test("the manifest uses the permanent third-party id", () => {
  assert.equal(manifest.id, "io.github.edneymatias.omacolor");
  assert.equal(manifest.id.startsWith("omarchy."), false);
});

test("the published manifest does not declare omarchy.clonedFrom", () => {
  assert.equal(manifest.omarchy && manifest.omarchy.clonedFrom, undefined);
});

test("the bar widget entry point exists with the same capitalization", () => {
  assert.ok(fs.readdirSync(ROOT).includes(manifest.entryPoints.barWidget));
});

test("the panel registers its module and IPC target under the plugin id", () => {
  const source = fs.readFileSync(path.join(ROOT, manifest.entryPoints.barWidget), "utf8");
  assert.ok(source.includes('moduleName: "' + manifest.id + '"'));
  assert.ok(source.includes('ipcTarget: "' + manifest.id + '"'));
  assert.equal(source.includes("omarchy.monitor"), false);
});
