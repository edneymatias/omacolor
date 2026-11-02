const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const M = load("ColorModel.js");
const presetsJson = JSON.parse(require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "presets.json"), "utf8"));

const BOE = { r: [0.6503, 0.3291], g: [0.3056, 0.6250], b: [0.1533, 0.0556] };
const SRGB = presetsJson.presets[0].primaries;
const P3 = presetsJson.presets[1].primaries;

function items(extra) {
  return M.assembleItems(Object.assign({
    presets: presetsJson,
    edidInfo: { primaries: BOE },
    edidPath: "/g/edid-boe.icc",
    generatedDir: "/g",
    userFiles: [],
  }, extra || {}));
}

test("monitorKey joins lowercase make and model", () => {
  assert.equal(M.monitorKey("SAM", "Odyssey G5"), "sam|odyssey g5");
});

test("monitorKey is empty when make or model is empty", () => {
  assert.equal(M.monitorKey("SAM", ""), "");
  assert.equal(M.monitorKey("", "x"), "");
});

test("assembleItems without EDID info has no edid item", () => {
  const list = items({ edidInfo: null, edidPath: "" });
  assert.equal(list.some((i) => i.kind === "edid"), false);
  assert.deepEqual(list.map((i) => i.id), ["srgb", "display-p3", "adobe-rgb", "rec709", "rec2020"]);
});

test("assembleItems keeps edid first, then presets, then user files", () => {
  const list = items({ userFiles: [{ name: "casa-g5.icc", path: "/u/casa-g5.icc" }] });
  assert.deepEqual(list.map((i) => i.id), ["edid", "srgb", "display-p3", "adobe-rgb", "rec709", "rec2020", "user:casa-g5.icc"]);
  const user = list[list.length - 1];
  assert.equal(user.label, "casa-g5");
  assert.equal(user.kind, "user");
  assert.equal(user.path, "/u/casa-g5.icc");
  assert.equal(list[1].path, "/g/srgb.icc");
  assert.equal(list[1].labelKey, "preset.srgb");
});

test("gamutWarn is true for P3 and false for sRGB on the BOE panel", () => {
  assert.equal(M.gamutWarn(BOE, P3, 5), true);
  assert.equal(M.gamutWarn(BOE, SRGB, 5), false);
});

test("gamutWarn is false when the panel has no primaries", () => {
  assert.equal(M.gamutWarn(null, P3, 5), false);
});

test("buildList puts the applied item on top and out of available", () => {
  const list = M.buildList(items(), "edid", BOE);
  assert.equal(list.applied.id, "edid");
  assert.equal(list.available.some((i) => i.id === "edid"), false);
  assert.equal(list.available[0].id, "srgb");
});

test("buildList with nothing applied has a null applied", () => {
  const list = M.buildList(items(), null, BOE);
  assert.equal(list.applied, null);
  assert.equal(list.available[0].id, "edid");
});

test("buildList sorts user items after presets by label, ignoring case", () => {
  const list = M.buildList(items({ userFiles: [
    { name: "b.icc", path: "/u/b.icc" }, { name: "A.icc", path: "/u/A.icc" }] }), null, BOE);
  const ids = list.available.map((i) => i.id);
  assert.deepEqual(ids.slice(-2), ["user:A.icc", "user:b.icc"]);
});

test("buildList marks wide presets with warn and leaves sRGB without", () => {
  const list = M.buildList(items(), null, BOE);
  const byId = Object.fromEntries(list.available.map((i) => [i.id, i]));
  assert.equal(byId["display-p3"].warn, true);
  assert.equal(byId["srgb"].warn, false);
  assert.equal(byId["edid"].warn, false);
});

test("buildList drops items without a path and ignores an unknown applied id", () => {
  const gone = { id: "user:gone.icc", label: "gone", path: "", kind: "user" };
  const list = M.buildList(items().concat([gone]), "user:gone.icc", BOE);
  assert.equal(list.applied, null);
  assert.equal(list.available.some((i) => i.id === "user:gone.icc"), false);
});

test("cursorRows ends with manage and starts with the applied item", () => {
  const rows = M.cursorRows(M.buildList(items(), "edid", BOE));
  assert.deepEqual(rows[0], { kind: "item", id: "edid" });
  assert.deepEqual(rows[rows.length - 1], { kind: "manage" });
});

test("cursorRows with nothing applied starts with the first available item", () => {
  const rows = M.cursorRows(M.buildList(items(), null, BOE));
  assert.deepEqual(rows[0], { kind: "item", id: "edid" });
});

test("clickOutcome removes when the applied item is clicked again", () => {
  assert.deepEqual(M.clickOutcome("edid", "edid"), { action: "remove", id: "edid" });
});

test("clickOutcome applies any other item", () => {
  assert.deepEqual(M.clickOutcome("edid", "srgb"), { action: "apply", id: "srgb" });
  assert.deepEqual(M.clickOutcome(null, "srgb"), { action: "apply", id: "srgb" });
});

test("titleLabel shows the monitor and the applied label or the none text", () => {
  assert.equal(M.titleLabel("eDP-1", null, "None"), "eDP-1 · None");
  assert.equal(M.titleLabel("HDMI-A-1", "EDID", "None"), "HDMI-A-1 · EDID");
});

test("listViewportHeight never exceeds the list content", () => {
  assert.equal(M.listViewportHeight(300, 90, 100), 100);
});

test("listViewportHeight takes the space the panel has left when the content is taller", () => {
  assert.equal(M.listViewportHeight(250, 90, 400), 250);
});

test("listViewportHeight keeps a minimum height when the panel has almost no space", () => {
  assert.equal(M.listViewportHeight(40, 90, 400), 90);
});

test("listViewportHeight stays at the content height when that is below the minimum", () => {
  assert.equal(M.listViewportHeight(40, 90, 50), 50);
});

// Numbers measured on the G5: the panel scroll area is 499 px, the Color section starts at 335 px,
// its header takes 19 px, the notes and "Manage profiles" 47 px, and 14 px follow the section
// (column spacing 11 + the stock 3 px end item). The list must leave the column within 499 px.
test("listAvailable leaves the whole column inside the panel", () => {
  const available = M.listAvailable(499, 335, 19, 47, 14);
  assert.ok(335 + 19 + available + 47 + 14 <= 499, "column would be " + (335 + 19 + available + 47 + 14));
});

test("listAvailable uses the room that is really left", () => {
  assert.ok(M.listAvailable(499, 335, 19, 47, 14) >= 82);
});

// Hovering a half-visible row must not scroll the list: it would move the list under a still
// pointer and pick another row (the flicker the user saw). Only keyboard moves scroll.
test("scrollToCursor is false when the pointer moved the cursor", () => {
  assert.equal(M.scrollToCursor("pointer"), false);
});

test("scrollToCursor is true when the keyboard moved the cursor", () => {
  assert.equal(M.scrollToCursor("keyboard"), true);
});

// Review minor #2: Qt.resolvedUrl gives a percent-encoded file URL; the helper needs a real path.
test("fileUrlToPath decodes spaces and percent signs", () => {
  assert.equal(M.fileUrlToPath("file:///home/a%20b/My%25Plugins/plugin/"), "/home/a b/My%Plugins/plugin/");
});

test("fileUrlToPath leaves a plain path alone", () => {
  assert.equal(M.fileUrlToPath("/home/m/plugin/i18n"), "/home/m/plugin/i18n");
});

// Review minor #4: a display that reports no make or model cannot keep a choice.
test("identityState is unknown before the monitor list arrives", () => {
  assert.equal(M.identityState(undefined), "unknown");
});

test("identityState is unidentified when make or model is empty", () => {
  assert.equal(M.identityState({ make: "", model: "Virtual-1" }), "unidentified");
});

test("identityState is ok for a monitor with make and model", () => {
  assert.equal(M.identityState({ make: "BOE", model: "0x0C29" }), "ok");
});

test("sectionRows of an unidentified display keeps only Manage profiles", () => {
  const list = { applied: null, available: [{ id: "srgb" }] };
  assert.deepEqual(M.sectionRows("unidentified", list), [{ kind: "manage" }]);
  assert.deepEqual(M.sectionRows("ok", list), [{ kind: "item", id: "srgb" }, { kind: "manage" }]);
});

// The EDID row is named after the display, not "EDID": the laptop panel reads "Built-in display".
test("edidDisplayName marks a laptop panel as built-in", () => {
  assert.deepEqual(M.edidDisplayName("eDP-1", "BOE", "0x0C29"), { builtin: true, name: "" });
});

test("edidDisplayName uses a readable model name", () => {
  assert.deepEqual(M.edidDisplayName("HDMI-A-1", "Samsung Electric Company", "Odyssey G5"), { builtin: false, name: "Odyssey G5" });
});

test("edidDisplayName falls back to the make when the model is only a code", () => {
  assert.deepEqual(M.edidDisplayName("DP-2", "Dell Inc.", "0xA0B1"), { builtin: false, name: "Dell Inc." });
});

test("edidDisplayName falls back to the port when make and model are empty", () => {
  assert.deepEqual(M.edidDisplayName("DP-3", "", ""), { builtin: false, name: "DP-3" });
});

test("assembleItems puts the display name on the EDID row", () => {
  const list = items({ edidLabel: { builtin: false, name: "Odyssey G5" } });
  const edid = list.find((i) => i.kind === "edid");
  assert.equal(edid.edidName, "Odyssey G5");
  assert.equal(edid.builtin, false);
});
