const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

// Review #1: one ColorApplier per shell, shared by the bar widget of every monitor.
function fresh() {
  const A = load("ColorApply.js");
  const made = [];
  const destroyed = [];
  const factory = () => {
    const obj = { n: made.length + 1, destroy() { destroyed.push(this.n); } };
    made.push(obj);
    return obj;
  };
  return { A, made, destroyed, factory };
}

test("acquireShared creates the instance once for every widget", () => {
  const { A, made, factory } = fresh();
  assert.deepEqual(A.acquireShared(factory), { n: 1 });
  assert.deepEqual(A.acquireShared(factory), { n: 1 });
  assert.equal(made.length, 1);
});

test("releaseShared keeps the instance while another widget still uses it", () => {
  const { A, destroyed, factory } = fresh();
  A.acquireShared(factory);
  A.acquireShared(factory);
  assert.equal(A.releaseShared(), false);
  assert.deepEqual(destroyed, []);
});

test("releaseShared destroys the instance when the last widget goes away", () => {
  const { A, destroyed, factory } = fresh();
  A.acquireShared(factory);
  A.acquireShared(factory);
  A.releaseShared();
  assert.equal(A.releaseShared(), true);
  assert.deepEqual(destroyed, [1]);
});

test("acquireShared after a full release makes a new instance", () => {
  const { A, made, factory } = fresh();
  A.acquireShared(factory);
  A.releaseShared();
  assert.deepEqual(A.acquireShared(factory), { n: 2 });
  assert.equal(made.length, 2);
});

test("releaseShared without an instance does nothing", () => {
  const { A } = fresh();
  assert.equal(A.releaseShared(), false);
});
