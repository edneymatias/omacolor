const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const M = load("ColorModel.js");

const MONITORS = [
  { name: "eDP-1", make: "BOE", model: "0x0C29", focused: false, disabled: false },
  { name: "HDMI-A-1", make: "Samsung Electric Company", model: "Odyssey G5", focused: true, disabled: false },
];

test("displayEntries lists the enabled displays with a built-in flag", () => {
  assert.deepEqual(M.displayEntries(MONITORS.concat([{ name: "DP-9", disabled: true }])), [
    { name: "eDP-1", make: "BOE", model: "0x0C29", builtIn: true, focused: false },
    { name: "HDMI-A-1", make: "Samsung Electric Company", model: "Odyssey G5", builtIn: false, focused: true },
  ]);
});

test("currentDisplay prefers the picked display, then the focused one, then the first", () => {
  const entries = M.displayEntries(MONITORS);
  assert.equal(M.currentDisplay(entries, "eDP-1").name, "eDP-1");
  assert.equal(M.currentDisplay(entries, "").name, "HDMI-A-1");
  assert.equal(M.currentDisplay(entries, "gone").name, "HDMI-A-1");
  assert.equal(M.currentDisplay([], ""), null);
});

test("displayGlyph shows a laptop for a built-in panel and a monitor otherwise", () => {
  assert.equal(M.displayGlyph({ builtIn: true }), "\u{F0322}");
  assert.equal(M.displayGlyph({ builtIn: false }), "\u{F0379}");
});

test("displayTitle names the built-in panel with the given text and others by model", () => {
  const [laptop, g5] = M.displayEntries(MONITORS);
  assert.equal(M.displayTitle(laptop, "Built-in display"), "Built-in display");
  assert.equal(M.displayTitle(g5, "Built-in display"), "Odyssey G5");
});

test("stepDisplay moves left and right and stops at the ends", () => {
  const entries = M.displayEntries(MONITORS);
  assert.equal(M.stepDisplay(entries, "eDP-1", 1), "HDMI-A-1");
  assert.equal(M.stepDisplay(entries, "HDMI-A-1", 1), "HDMI-A-1");
  assert.equal(M.stepDisplay(entries, "HDMI-A-1", -1), "eDP-1");
});

// Keyboard: the display picker is one row at the top; the Color rows follow.
test("navigate goes from the picker down into the Color rows and back up", () => {
  const layout = { sections: ["displays", "color"], counts: { displays: 2, color: 4 } };
  assert.deepEqual(M.navigate({ section: "displays", index: 1 }, 1, layout), { section: "color", index: 0 });
  assert.deepEqual(M.navigate({ section: "color", index: 0 }, 1, layout), { section: "color", index: 1 });
  assert.deepEqual(M.navigate({ section: "color", index: 3 }, 1, layout), { section: "color", index: 3 });
  assert.deepEqual(M.navigate({ section: "color", index: 0 }, -1, layout), { section: "displays", index: 0 });
});

test("navigate with one display stays in the Color rows", () => {
  const layout = { sections: ["color"], counts: { color: 3 } };
  assert.deepEqual(M.navigate({ section: "color", index: 0 }, -1, layout), { section: "color", index: 0 });
});
