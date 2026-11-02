.pragma library

// Pure list logic for the Color section. No QML or I/O here: see ColorApplier.qml.

var WARN_THRESHOLD_PCT = 5

function monitorKey(make, model) {
  var m = String(make || "").trim().toLowerCase()
  var d = String(model || "").trim().toLowerCase()
  return (m && d) ? m + "|" + d : ""
}

function triangleArea(p) {
  var r = p.r, g = p.g, b = p.b
  return Math.abs(r[0] * (g[1] - b[1]) + g[0] * (b[1] - r[1]) + b[0] * (r[1] - g[1])) / 2
}

function gamutWarn(panel, preset, thresholdPct) {
  if (!panel || !preset) return false
  return triangleArea(preset) > triangleArea(panel) * (1 + thresholdPct / 100)
}

function assembleItems(o) {
  var items = []
  if (o.edidInfo && o.edidPath) {
    var edidLabel = o.edidLabel || { builtin: false, name: "" }
    items.push({ id: "edid", label: "", labelKey: "item.edid", path: o.edidPath, kind: "edid",
                 primaries: o.edidInfo.primaries, warn: false,
                 edidName: edidLabel.name, builtin: edidLabel.builtin })
  }
  var presets = (o.presets && o.presets.presets) || []
  for (var i = 0; i < presets.length; i++) {
    var p = presets[i]
    items.push({ id: p.id, label: "", labelKey: p.labelKey, path: o.generatedDir + "/" + p.id + ".icc",
                 kind: "preset", primaries: p.primaries, warn: false })
  }
  var files = o.userFiles || []
  for (var j = 0; j < files.length; j++) {
    items.push({ id: "user:" + files[j].name, label: files[j].name.replace(/\.icc$/i, ""), labelKey: "",
                 path: files[j].path, kind: "user", warn: false })
  }
  return items
}

function copyItem(item, panel) {
  var out = {}
  for (var k in item) out[k] = item[k]
  out.warn = item.kind === "preset" ? gamutWarn(panel, item.primaries, WARN_THRESHOLD_PCT) : false
  return out
}

function buildList(items, appliedId, panel) {
  var edids = [], presets = [], users = [], applied = null
  for (var i = 0; i < items.length; i++) {
    var item = items[i]
    if (!item || !item.path) continue
    var copy = copyItem(item, panel)
    if (copy.id === appliedId) { applied = copy; continue }
    if (copy.kind === "edid") edids.push(copy)
    else if (copy.kind === "user") users.push(copy)
    else presets.push(copy)
  }
  users.sort(function (a, b) {
    var x = a.label.toLowerCase(), y = b.label.toLowerCase()
    return x < y ? -1 : (x > y ? 1 : 0)
  })
  return { applied: applied, available: edids.concat(presets, users) }
}

function cursorRows(list) {
  var rows = []
  if (list.applied) rows.push({ kind: "item", id: list.applied.id })
  for (var i = 0; i < list.available.length; i++) rows.push({ kind: "item", id: list.available[i].id })
  rows.push({ kind: "manage" })
  return rows
}

function clickOutcome(appliedId, clickedId) {
  return { action: appliedId && appliedId === clickedId ? "remove" : "apply", id: clickedId }
}

function titleLabel(monitorName, appliedLabel, noneText) {
  return monitorName + " · " + (appliedLabel || noneText)
}

// Height of the scrolling list: what the panel has left, never below minHeight, never above the content.
function listViewportHeight(available, minHeight, contentHeight) {
  return Math.min(contentHeight, Math.max(minHeight, available))
}

// Room for the list: what the panel allows, minus everything above it in the column, the
// section's own header and footer, and what follows the section. 1 px absorbs rounding.
function listAvailable(panelMax, sectionY, above, below, reservedBelow) {
  return panelMax - sectionY - above - below - reservedBelow - 1
}

// Only a keyboard move scrolls the list to the cursor row; a hover only highlights it.
function scrollToCursor(source) {
  return source !== "pointer"
}

// Qt.resolvedUrl gives a file URL with %20 for spaces; commands and file readers need a real path.
function fileUrlToPath(url) {
  return decodeURIComponent(String(url).replace(/^file:\/\//, ""))
}

// "unknown" until the monitor list arrives; "unidentified" when the display reports no make or
// model (virtual outputs, some adapters/KVMs), so no choice can be kept for it.
function identityState(info) {
  if (!info) return "unknown"
  return monitorKey(info.make, info.model) ? "ok" : "unidentified"
}

function sectionRows(identity, list) {
  return identity === "unidentified" ? [{ kind: "manage" }] : cursorRows(list)
}

// How the EDID row names its display: a laptop panel (eDP/LVDS/DSI) is "built-in"; otherwise the
// model when it is readable ("Odyssey G5"), the make when the model is only a code ("0x0C29"),
// and the port as a last resort.
function edidDisplayName(port, make, model) {
  if (isBuiltIn(port)) return { builtin: true, name: "" }
  var m = String(model || "").trim()
  var k = String(make || "").trim()
  if (m && !/^0x[0-9a-f]+$/i.test(m)) return { builtin: false, name: m }
  if (k) return { builtin: false, name: k }
  return { builtin: false, name: String(port) }
}

// ---------- display picker (top right of the panel, as in the Omarchy 4.6 Display panel) ----------

function isBuiltIn(port) {
  return /^(eDP|LVDS|DSI)-/.test(String(port))
}

// The enabled displays, in Hyprland's order, from `hyprctl monitors -j` rows.
function displayEntries(monitors) {
  var list = []
  for (var i = 0; i < (monitors || []).length; i++) {
    var m = monitors[i]
    if (!m || !m.name || m.disabled) continue
    list.push({ name: m.name, make: m.make || "", model: m.model || "", builtIn: isBuiltIn(m.name), focused: !!m.focused })
  }
  return list
}

// The shown display: the one picked, else the focused one, else the first.
function currentDisplay(entries, selectedName) {
  var fallback = null
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].name === selectedName) return entries[i]
    if (entries[i].focused && !fallback) fallback = entries[i]
  }
  return fallback || (entries.length > 0 ? entries[0] : null)
}

// The same glyphs as the Omarchy 4.6 Display panel: a laptop for a built-in panel, else a monitor.
function displayGlyph(entry) {
  return entry && entry.builtIn ? String.fromCodePoint(0xF0322) : String.fromCodePoint(0xF0379)
}

function displayTitle(entry, builtInText) {
  if (!entry) return ""
  return entry.builtIn ? builtInText : edidDisplayName(entry.name, entry.make, entry.model).name
}

function stepDisplay(entries, currentName, delta) {
  var index = 0
  for (var i = 0; i < entries.length; i++) if (entries[i].name === currentName) index = i
  var next = Math.max(0, Math.min(entries.length - 1, index + delta))
  return entries.length > 0 ? entries[next].name : ""
}

// Vertical keyboard move. "displays" is a single row (left/right picks a display); "color" has
// one cursor position per row of the Color section.
function navigate(cursor, delta, layout) {
  var sections = layout.sections
  var i = sections.indexOf(cursor.section)
  if (i < 0) return { section: sections[0], index: 0 }
  if (cursor.section === "color") {
    var last = (layout.counts.color || 1) - 1
    var next = cursor.index + delta
    if (next >= 0 && next <= last) return { section: "color", index: next }
    if (next < 0 && i > 0) return { section: sections[i - 1], index: 0 }
    return { section: "color", index: Math.max(0, Math.min(last, cursor.index)) }
  }
  if (delta > 0 && i < sections.length - 1) return { section: sections[i + 1], index: 0 }
  return { section: cursor.section, index: cursor.index }
}
