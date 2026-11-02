.pragma library
.import "ColorModel.js" as Model

// Pure apply/reapply planning. ColorApplier.qml runs what this decides.

var IGNORE_WINDOW_MS = 4000

function luaString(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")
}

// S1 = A (docs/spikes.md): output + icc is enough, Hyprland keeps the rest of the rule.
function monitorLua(monitor, iccPath) {
  return 'hl.monitor({ output = "' + luaString(monitor.name) + '", icc = "' + luaString(iccPath) + '" })'
}

function planReapply(o) {
  var plan = []
  for (var i = 0; i < o.monitors.length; i++) {
    var m = o.monitors[i]
    var key = Model.monitorKey(m.make, m.model)
    if (!key) continue
    var id = o.choices[key]
    if (!id) continue
    var path = o.profiles[id]
    if (!path) continue
    if (!o.force && o.lastApplied[m.name] === id) continue
    plan.push({ monitor: m.name, id: id, path: path })
  }
  return plan
}

// Only the echoes of this plugin's own actions are ignored: the configreloaded of its own reload,
// and the re-add of a monitor it has just applied to. Anything else (a reload by the user, a
// monitor plugged at login or after a choice) is handled.
function ignoreEvent(name, data, nowMs, lastApplyByMonitor, lastReloadMs, windowMs) {
  var window = windowMs === undefined ? IGNORE_WINDOW_MS : windowMs
  if (name === "configreloaded") return nowMs - lastReloadMs < window
  if (name === "monitoraddedv2") {
    var monitor = String(data).split(",")[1] || ""
    var applied = lastApplyByMonitor[monitor]
    return applied !== undefined && nowMs - applied < window
  }
  return true
}

function choiceCommitted(results) {
  for (var i = 0; i < results.length; i++) if (results[i]) return true
  return false
}

// One ColorApplier per shell: the bar widget exists once per monitor, and two appliers with their
// own state would undo each other. `.pragma library` makes this module one instance per engine.
var sharedInstance = null
var sharedCount = 0

function acquireShared(factory) {
  if (!sharedInstance) sharedInstance = factory()
  sharedCount += 1
  return sharedInstance
}

function releaseShared() {
  if (sharedCount > 0) sharedCount -= 1
  if (sharedCount > 0 || !sharedInstance) return false
  var instance = sharedInstance
  sharedInstance = null
  if (instance.destroy) instance.destroy()
  return true
}

function applySucceeded(stdout) {
  return !/error/i.test(String(stdout))
}
