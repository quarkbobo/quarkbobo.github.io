// Purely visual space weather. Its only clock is foreground, unpaused seconds
// supplied by the controller; no wall clock, orbital state or civilization state.
const TYPES = ['flare', 'dust', 'aurora']
const STARS = ['star-a', 'star-b', 'star-c']
const MAX_DURATION = 10

function range (value, min, max, label) {
  if (!Number.isFinite(value) || value < min || value > max) throw new RangeError(`${label}须在 ${min}—${max} 之间`)
}
function clock (value) { if (!Number.isFinite(value) || value < 0) throw new RangeError('特效时钟须为非负有限秒数') }
function random (state) {
  state.randomState = (Math.imul(state.randomState, 1664525) + 1013904223) >>> 0
  return state.randomState / 4294967296
}
const firstWait = state => (8 + 6 * random(state)) / state.frequency
const quietWait = state => (20 + 25 * random(state)) / state.frequency

export function makeEvents (seed = 7301) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('特效种子须为无符号 32 位整数')
  const state = { seed, randomState: seed >>> 0, nextAt: 0, active: null, history: [], sequence: 0, lastTime: 0, enabled: true, frequency: 1, intensity: 1 }
  state.nextAt = firstWait(state)
  return state
}

function begin (state, realTime, type) {
  const event = {
    id: ++state.sequence,
    type: type === 'random' ? TYPES[Math.floor(random(state) * TYPES.length)] : type,
    starId: STARS[Math.floor(random(state) * STARS.length)],
    startedAt: realTime,
    duration: 6 + 4 * random(state)
  }
  state.active = event
  state.history.push({ ...event })
  if (state.history.length > 8) state.history.splice(0, state.history.length - 8)
  state.nextAt = realTime + event.duration + quietWait(state)
  state.lastTime = realTime
}

export function advanceEvents (state, realTime, { enabled = true, frequency = 1, intensity = 1 } = {}) {
  clock(realTime)
  if (typeof enabled !== 'boolean') throw new RangeError('特效开关须为布尔值')
  range(frequency, 0.25, 3, '特效频率'); range(intensity, 0, 2, '特效强度')
  const restarted = !state.enabled || realTime < state.lastTime
  const changed = frequency !== state.frequency
  state.enabled = enabled; state.frequency = frequency; state.intensity = intensity; state.lastTime = realTime
  if (!enabled) {
    state.active = null; state.nextAt = null
    return state
  }
  if (restarted) {
    state.active = null; state.nextAt = realTime + firstWait(state)
    return state
  }
  if (state.active && realTime >= state.active.startedAt + state.active.duration) state.active = null
  if (changed) {
    state.nextAt = state.active
      ? state.active.startedAt + state.active.duration + quietWait(state)
      : realTime + firstWait(state)
    return state
  }
  if (!state.active && realTime >= state.nextAt) {
    // A jump past the maximum possible duration missed the entire visual. Skip
    // it without inventing a history entry or emitting a burst of old effects.
    if (realTime - state.nextAt >= MAX_DURATION) state.nextAt = realTime + quietWait(state)
    else begin(state, realTime, 'random')
  }
  return state
}

export function triggerEvent (state, realTime, type = 'random') {
  clock(realTime)
  if (type !== 'random' && !TYPES.includes(type)) throw new RangeError('未知空间天气类型')
  begin(state, realTime, type)
  return state
}

export function eventEffects (state, realTime, intensity = 1) {
  clock(realTime); range(intensity, 0, 2, '特效强度')
  const result = { flare: { starId: null, strength: 0 }, dust: 0, aurora: 0 }
  if (!state.active) return result
  const { type, starId, startedAt, duration } = state.active, age = realTime - startedAt
  if (age <= 0 || age >= duration) return result
  const strength = Math.max(0, Math.min(2, Math.sin(Math.PI * age / duration) * intensity))
  if (type === 'flare') result.flare = { starId, strength }
  else result[type] = strength
  return result
}
