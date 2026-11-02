const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const S = load("ColorState.js");
const M = load("ColorModel.js");

test("parseState of invalid JSON is the empty state", () => {
  assert.deepEqual(S.parseState("not json"), S.emptyState());
});

test("parseState of the wrong shape is the empty state", () => {
  assert.deepEqual(S.parseState('{"version":1,"choices":[1,2]}'), S.emptyState());
  assert.deepEqual(S.parseState('{"version":2,"choices":{}}'), S.emptyState());
  assert.deepEqual(S.parseState("null"), S.emptyState());
});

test("parseState keeps only string choices", () => {
  const state = S.parseState('{"version":1,"choices":{"a|b":"edid","c|d":5}}');
  assert.equal(S.getChoice(state, "a|b"), "edid");
  assert.equal(S.getChoice(state, "c|d"), null);
});

test("setChoice then getChoice round-trips through serialize and parse", () => {
  const state = S.setChoice(S.emptyState(), "sam|odyssey g5", "srgb");
  assert.equal(S.getChoice(S.parseState(S.serializeState(state)), "sam|odyssey g5"), "srgb");
});

test("setChoice with null removes the key", () => {
  const set = S.setChoice(S.emptyState(), "k", "edid");
  const cleared = S.setChoice(set, "k", null);
  assert.equal(S.getChoice(cleared, "k"), null);
  assert.equal("k" in cleared.choices, false);
});

test("setChoice does not mutate the state it receives", () => {
  const before = S.emptyState();
  S.setChoice(before, "k", "edid");
  assert.deepEqual(before, S.emptyState());
});

test("two monitors with the same make and model share one choice", () => {
  const a = M.monitorKey("SAM", "Odyssey G5");
  const b = M.monitorKey("SAM", "Odyssey G5");
  const state = S.setChoice(S.emptyState(), a, "edid");
  assert.equal(S.getChoice(state, b), "edid");
});

test("setChoice ignores an empty key", () => {
  const state = S.setChoice(S.emptyState(), "", "edid");
  assert.deepEqual(state, S.emptyState());
});
