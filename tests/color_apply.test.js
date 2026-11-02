const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const A = load("ColorApply.js");
const KEY = "sam|odyssey g5";

function mon(name, make, model) {
  return { name, make, model };
}

test("luaString escapes quotes, backslashes and newlines", () => {
  assert.equal(A.luaString('a"b\\c'), 'a\\"b\\\\c');
  assert.equal(A.luaString("a\nb"), "a\\nb");
});

test("monitorLua sends only the output and the icc path", () => {
  assert.equal(A.monitorLua({ name: "HDMI-A-1" }, "/p/x.icc"), 'hl.monitor({ output = "HDMI-A-1", icc = "/p/x.icc" })');
});

test("monitorLua escapes a hostile path", () => {
  assert.equal(A.monitorLua({ name: "eDP-1" }, '/p/"x".icc'), 'hl.monitor({ output = "eDP-1", icc = "/p/\\"x\\".icc" })');
});

test("planReapply stays quiet for a monitor without a stored choice", () => {
  const plan = A.planReapply({ choices: {}, monitors: [mon("HDMI-A-1", "SAM", "Odyssey G5")],
    profiles: { edid: "/g/e.icc" }, lastApplied: {}, force: true });
  assert.deepEqual(plan, []);
});

test("planReapply applies the stored choice to a monitor", () => {
  const plan = A.planReapply({ choices: { [KEY]: "edid" }, monitors: [mon("HDMI-A-1", "SAM", "Odyssey G5")],
    profiles: { edid: "/g/e.icc" }, lastApplied: {}, force: false });
  assert.deepEqual(plan, [{ monitor: "HDMI-A-1", id: "edid", path: "/g/e.icc" }]);
});

test("planReapply reapplies two monitors that share make and model", () => {
  const plan = A.planReapply({ choices: { [KEY]: "edid" },
    monitors: [mon("HDMI-A-1", "SAM", "Odyssey G5"), mon("DP-2", "SAM", "Odyssey G5")],
    profiles: { edid: "/g/e.icc" }, lastApplied: {}, force: false });
  assert.deepEqual(plan.map((p) => p.monitor), ["HDMI-A-1", "DP-2"]);
});

test("planReapply skips a choice whose profile file is gone", () => {
  const plan = A.planReapply({ choices: { [KEY]: "user:gone.icc" }, monitors: [mon("HDMI-A-1", "SAM", "Odyssey G5")],
    profiles: { edid: "/g/e.icc" }, lastApplied: {}, force: true });
  assert.deepEqual(plan, []);
});

test("planReapply skips an unchanged monitor unless forced", () => {
  const args = { choices: { [KEY]: "edid" }, monitors: [mon("HDMI-A-1", "SAM", "Odyssey G5")],
    profiles: { edid: "/g/e.icc" }, lastApplied: { "HDMI-A-1": "edid" } };
  assert.deepEqual(A.planReapply(Object.assign({ force: false }, args)), []);
  assert.equal(A.planReapply(Object.assign({ force: true }, args)).length, 1);
});

test("planReapply ignores a monitor without make or model", () => {
  const plan = A.planReapply({ choices: { "|": "edid" }, monitors: [mon("HEADLESS-1", "", "")],
    profiles: { edid: "/g/e.icc" }, lastApplied: {}, force: true });
  assert.deepEqual(plan, []);
});

// Review #3: ignore only the echoes of what this plugin did, per monitor, not every event for 4 s.
const NOW = 100000;

test("ignoreEvent swallows the configreloaded caused by our own reload", () => {
  assert.equal(A.ignoreEvent("configreloaded", "", NOW, {}, NOW - 500, 4000), true);
});

test("ignoreEvent lets through a reload we did not cause, even right after an apply", () => {
  assert.equal(A.ignoreEvent("configreloaded", "", NOW, { "eDP-1": NOW - 500 }, -1e12, 4000), false);
});

test("ignoreEvent lets through a monitor that was never applied (login, plugging after a choice)", () => {
  assert.equal(A.ignoreEvent("monitoraddedv2", "1,HDMI-A-1,Samsung G5 SERIAL", NOW, { "eDP-1": NOW - 500 }, -1e12, 4000), false);
});

test("ignoreEvent swallows the re-add of a monitor we just applied to", () => {
  assert.equal(A.ignoreEvent("monitoraddedv2", "1,HDMI-A-1,Samsung G5 SERIAL", NOW, { "HDMI-A-1": NOW - 500 }, -1e12, 4000), true);
});

test("ignoreEvent lets a re-add through once the window has passed", () => {
  assert.equal(A.ignoreEvent("monitoraddedv2", "1,HDMI-A-1,x", NOW, { "HDMI-A-1": NOW - 5000 }, -1e12, 4000), false);
});

test("ignoreEvent ignores events it does not handle", () => {
  assert.equal(A.ignoreEvent("activewindow", "x", NOW, {}, -1e12, 4000), true);
});

// Review #2: a choice is only kept when Hyprland applied it to at least one monitor.
test("choiceCommitted is true when one apply succeeded", () => {
  assert.equal(A.choiceCommitted([false, true]), true);
});

test("choiceCommitted is false when every apply failed or nothing was applied", () => {
  assert.equal(A.choiceCommitted([false]), false);
  assert.equal(A.choiceCommitted([]), false);
});

test("applySucceeded accepts ok and rejects the Hyprland error text", () => {
  assert.equal(A.applySucceeded("ok"), true);
  assert.equal(A.applySucceeded("error: return hl.monitor(...): hl.monitor: error applying field 'icc'"), false);
});
