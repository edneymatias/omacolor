.pragma library

// Persisted per-monitor choices: { version: 1, choices: { "<make>|<model>": "<item id>" } }.

function emptyState() {
  return { version: 1, choices: {} }
}

function parseState(text) {
  try {
    var parsed = JSON.parse(text)
    if (!parsed || parsed.version !== 1 || !parsed.choices
        || typeof parsed.choices !== "object" || Array.isArray(parsed.choices)) return emptyState()
    var state = emptyState()
    for (var key in parsed.choices) {
      if (typeof parsed.choices[key] === "string" && parsed.choices[key] !== "") state.choices[key] = parsed.choices[key]
    }
    return state
  } catch (e) {
    return emptyState()
  }
}

function serializeState(state) {
  return JSON.stringify(state, null, 2)
}

function setChoice(state, key, id) {
  var next = { version: 1, choices: {} }
  for (var k in state.choices) next.choices[k] = state.choices[k]
  if (!key) return next
  if (id === null || id === undefined || id === "") delete next.choices[key]
  else next.choices[key] = id
  return next
}

function getChoice(state, key) {
  var value = state && state.choices ? state.choices[key] : null
  return typeof value === "string" && value !== "" ? value : null
}
