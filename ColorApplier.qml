import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import "ColorApply.js" as Apply
import "ColorModel.js" as Model
import "ColorState.js" as State

// Applies, persists and reapplies the per-monitor ICC choice. What to apply is decided by
// ColorApply.js and ColorModel.js; this file only runs commands and listens to Hyprland.
Item {
  id: root
  visible: false

  readonly property string home: Quickshell.env("HOME")
  // Everything the plugin creates lives in its own folder, so `omarchy plugin remove` deletes it.
  // The user's profiles are only read, from userDir.
  property string dataDir: pluginDir + ".data"
  property string stateDir: dataDir
  property string statePath: dataDir + "/state.json"
  property string generatedDir: dataDir + "/generated"
  property string userDir: home + "/.local/share/icc"
  readonly property string pluginDir: {
    var path = Model.fileUrlToPath(Qt.resolvedUrl("."))
    return path.endsWith("/") ? path : path + "/"
  }
  readonly property string helper: pluginDir + "bin/omacolor-profile"

  property var state: State.emptyState()
  readonly property var choices: state.choices
  property var presets: ({ white: [0.3127, 0.3290], presets: [] })
  property var itemsByMonitor: ({})
  property var monitorInfo: ({})
  // Rows of `hyprctl monitors -j` (name, make, model, focused, ...), for the display picker.
  property var monitorList: []
  property var lastApplied: ({})
  // Echo filter (ColorApply.ignoreEvent): when each monitor was last applied, when we last reloaded.
  property var lastApplyByMonitor: ({})
  property double lastReloadMs: -1e12
  // One refresh chain at a time; an event during a chain asks for one more run at its end.
  property bool refreshing: false
  property bool refreshPending: false

  signal applied(string monitorName, string id)
  // kind: "invalid" (the file failed validation) or "failed" (Hyprland did not apply it).
  signal rejected(string monitorName, string id, string reason, string kind)

  // ---------- process plumbing ----------

  Component {
    id: jobFactory
    Process {
      id: job
      property var done
      property bool exitedYet: false
      property bool streamEnded: false
      property int code: -1
      property string out: ""
      stdout: StdioCollector {
        onStreamFinished: { job.out = text; job.streamEnded = true; job.finish() }
      }
      // A command that cannot start (missing binary) never emits exited; the guard ends it.
      property QtObject guard: Timer {
        interval: 10000
        running: true
        repeat: false
        onTriggered: job.complete(-1, "")
      }
      onExited: function (exitCode, exitStatus) { job.code = exitCode; job.exitedYet = true; job.finish() }
      function finish() {
        if (exitedYet && streamEnded) complete(code, out)
      }
      function complete(exitCode, output) {
        var callback = done
        if (!callback) return
        done = null
        callback(exitCode, output)
        destroy()
      }
    }
  }

  function run(argv, done) {
    var job = jobFactory.createObject(root, { command: argv, done: done })
    job.running = true
  }

  FileView {
    id: stateFile
    path: root.statePath
    blockLoading: true
    printErrors: false
  }

  FileView {
    id: flagFile
    path: root.stateDir + "/applied-runtime"
    blockLoading: true
    printErrors: false
  }

  FileView {
    id: presetsFile
    path: root.pluginDir + "presets.json"
    blockLoading: true
    printErrors: false
  }

  function parseJson(text, fallback) {
    try { return JSON.parse(text) } catch (e) { return fallback }
  }

  function copyMap(map) {
    var out = ({})
    for (var k in map) out[k] = map[k]
    return out
  }

  function ensureDirs(done) {
    run(["mkdir", "-p", stateDir, generatedDir], function () { done() })
  }

  function readMonitors(done) {
    run(["hyprctl", "monitors", "-j"], function (code, out) {
      var monitors = parseJson(out, [])
      done(Array.isArray(monitors) ? monitors : [])
    })
  }

  function slug(key) {
    return key.replace(/[^a-z0-9]+/g, "-")
  }

  // ---------- profiles per monitor ----------

  function profilesFor(monitorName) {
    var map = ({})
    var items = itemsByMonitor[monitorName] || []
    for (var i = 0; i < items.length; i++) map[items[i].id] = items[i].path
    return map
  }

  function buildItems(monitor, userFiles, done) {
    var key = Model.monitorKey(monitor.make, monitor.model)
    var edidPath = generatedDir + "/edid-" + slug(key) + ".icc"
    function assemble(info) {
      return Model.assembleItems({ presets: presets, edidInfo: info, edidPath: edidPath,
                                   edidLabel: Model.edidDisplayName(monitor.name, monitor.make, monitor.model),
                                   generatedDir: generatedDir, userFiles: userFiles })
    }
    if (!key) { done(assemble(null)); return }
    run([helper, "edid-info", monitor.name], function (code, out) {
      var info = code === 0 ? parseJson(out, null) : null
      if (!info) { done(assemble(null)); return }
      run([helper, "edid-profile", monitor.name, "--out", edidPath], function (code2) {
        done(assemble(code2 === 0 ? info : null))
      })
    })
  }

  function refreshProfiles(done) {
    ensureDirs(function () {
      run([helper, "presets", "--out", generatedDir], function () {
        readMonitors(function (monitors) {
          root.setMonitors(monitors)
          run([helper, "list-user", userDir], function (code, out) {
            var userFiles = parseJson(out, [])
            var next = ({})
            var pending = monitors.length
            if (pending === 0) { root.itemsByMonitor = next; if (done) done(); return }
            monitors.forEach(function (monitor) {
              buildItems(monitor, userFiles, function (items) {
                next[monitor.name] = items
                pending -= 1
                if (pending === 0) { root.itemsByMonitor = next; if (done) done() }
              })
            })
          })
        })
      })
    })
  }

  // ---------- apply, choose, remove ----------

  function validateIfUser(id, path, done) {
    if (id.indexOf("user:") !== 0) { done(true, ""); return }
    run([helper, "check", path], function (code, out) {
      var result = parseJson(out, ({}))
      done(code === 0 && result.ok !== false, result.reason || "could not validate the file")
    })
  }

  function markApplied(monitorName) {
    var stamps = copyMap(lastApplyByMonitor)
    stamps[monitorName] = Date.now()
    root.lastApplyByMonitor = stamps
  }

  function applyOne(plan, next) {
    markApplied(plan.monitor)
    run(["hyprctl", "eval", Apply.monitorLua({ name: plan.monitor }, plan.path)], function (code, out) {
      markApplied(plan.monitor)
      var ok = code === 0 && Apply.applySucceeded(out)
      if (ok) {
        var map = copyMap(lastApplied)
        map[plan.monitor] = plan.id
        root.lastApplied = map
        flagFile.setText("1")
        applied(plan.monitor, plan.id)
      } else {
        console.log("omacolor: apply failed for " + plan.monitor + ": " + out.trim())
      }
      next(ok)
    })
  }

  // Runs the plans one after the other; done(results) gets one boolean per plan.
  function runPlans(plans, index, done, results) {
    var acc = results || []
    if (index >= plans.length) { if (done) done(acc); return }
    var plan = plans[index]
    var next = function (ok) { acc.push(ok); runPlans(plans, index + 1, done, acc) }
    validateIfUser(plan.id, plan.path, function (valid, reason) {
      if (!valid) { rejected(plan.monitor, plan.id, reason, "invalid"); next(false); return }
      applyOne(plan, next)
    })
  }

  // choicesOverride lets choose() try a choice before it is saved.
  function reapply(force, onlyKey, done, choicesOverride) {
    readMonitors(function (monitors) {
      var plans = []
      monitors.forEach(function (monitor) {
        var key = Model.monitorKey(monitor.make, monitor.model)
        if (!key || (onlyKey && key !== onlyKey)) return
        Apply.planReapply({ choices: choicesOverride || choices, monitors: [monitor], profiles: profilesFor(monitor.name),
                            lastApplied: lastApplied, force: force }).forEach(function (plan) { plans.push(plan) })
      })
      runPlans(plans, 0, done)
    })
  }

  function reapplyAll(force) {
    reapply(force, "")
  }

  // ---------- what the panel asks ----------

  function setMonitors(monitors) {
    var info = ({})
    monitors.forEach(function (monitor) { info[monitor.name] = { make: monitor.make, model: monitor.model } })
    root.monitorInfo = info
    root.monitorList = monitors
  }

  // Cheap refresh when the panel opens: which displays exist and which one has the focus.
  function refreshMonitors() {
    readMonitors(function (monitors) { root.setMonitors(monitors) })
  }

  // "unknown" | "unidentified" | "ok" (ColorModel.identityState).
  function identityFor(monitorName) {
    return Model.identityState(monitorInfo[monitorName])
  }

  function keyFor(monitorName) {
    var info = monitorInfo[monitorName]
    return info ? Model.monitorKey(info.make, info.model) : ""
  }

  // The stored choice for a monitor, only while its profile still exists.
  function appliedIdFor(monitorName) {
    var id = State.getChoice(state, keyFor(monitorName))
    return id && profilesFor(monitorName)[id] ? id : ""
  }

  function chooseFor(monitorName, id) {
    var info = monitorInfo[monitorName]
    if (info) choose(monitorName, info.make, info.model, id)
  }

  function openUserDir() {
    run(["mkdir", "-p", userDir], function () { Quickshell.execDetached(["xdg-open", userDir]) })
  }

  function persist() {
    run(["mkdir", "-p", stateDir], function () { stateFile.setText(State.serializeState(state)) })
  }

  function choose(monitorName, make, model, id) {
    var key = Model.monitorKey(make, model)
    if (!key) { console.log("omacolor: monitor without make/model, ignored: " + monitorName); return }
    if (id === "") { removeChoice(key); return }
    var path = profilesFor(monitorName)[id]
    if (!path) return
    validateIfUser(id, path, function (ok, reason) {
      if (!ok) { rejected(monitorName, id, reason, "invalid"); return }
      // Saved, and shown as applied, only if Hyprland applied it to at least one monitor.
      var next = State.setChoice(state, key, id)
      reapply(true, key, function (results) {
        if (Apply.choiceCommitted(results)) {
          root.state = next
          persist()
        } else {
          rejected(monitorName, id, "Hyprland did not apply it", "failed")
        }
      }, next.choices)
    })
  }

  // A runtime icc cannot be cleared by another hl.monitor call (docs/spikes.md), only by a reload.
  function removeChoice(key) {
    root.state = State.setChoice(state, key, null)
    persist()
    if (flagFile.text() === "") return
    root.lastReloadMs = Date.now()
    run(["hyprctl", "reload"], function () {
      root.lastApplied = ({})
      reapply(true, "", function () {
        if (Object.keys(root.lastApplied).length === 0) flagFile.setText("")
      })
    })
  }

  function refreshAndReapply() {
    if (refreshing) { root.refreshPending = true; return }
    root.refreshing = true
    refreshProfiles(function () {
      root.lastApplied = ({})
      reapply(true, "", function () {
        root.refreshing = false
        if (refreshPending) {
          root.refreshPending = false
          refreshAndReapply()
        }
      })
    })
  }

  // Cheap refresh when the panel opens: re-list the user's .icc files, keep presets and EDID items.
  function refreshUserFiles() {
    run([helper, "list-user", userDir], function (code, out) {
      var userFiles = parseJson(out, [])
      if (!Array.isArray(userFiles)) return
      var next = ({})
      for (var name in itemsByMonitor) {
        var edid = null
        var items = itemsByMonitor[name]
        for (var i = 0; i < items.length; i++) if (items[i].kind === "edid") edid = items[i]
        next[name] = Model.assembleItems({ presets: presets, edidInfo: edid ? { primaries: edid.primaries } : null,
                                           edidPath: edid ? edid.path : "", generatedDir: generatedDir,
                                           edidLabel: edid ? { builtin: edid.builtin, name: edid.edidName } : null,
                                           userFiles: userFiles })
      }
      root.itemsByMonitor = next
    })
  }

  // ---------- events ----------

  Connections {
    target: Hyprland
    function onRawEvent(event) {
      if (Apply.ignoreEvent(event.name, event.data, Date.now(), root.lastApplyByMonitor, root.lastReloadMs)) return
      coalesce.restart()
    }
  }

  Timer {
    id: coalesce
    interval: 150
    repeat: false
    onTriggered: root.refreshAndReapply()
  }

  Component.onCompleted: {
    root.state = State.parseState(stateFile.text())
    root.presets = parseJson(presetsFile.text(), root.presets)
    refreshAndReapply()
  }
}
