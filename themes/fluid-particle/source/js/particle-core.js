(function (root, factory) {
  const api = factory()

  if (typeof module === 'object' && module.exports) {
    module.exports = api
  } else {
    root.FluidParticleCore = api
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict'

  const TAU = Math.PI * 2
  const POINTER_LIMIT = 8
  const QUALITY_WINDOW = 120
  const MAX_QUALITY = 2
  const ORBIT_BANDS = [
    [[-0.08, 0.94], [0.24, 0.82], [0.58, 0.68], [0.91, 0.22]],
    [[-0.06, 0.88], [0.27, 0.77], [0.61, 0.62], [0.93, 0.18]],
    [[-0.04, 0.97], [0.30, 0.86], [0.64, 0.72], [0.95, 0.26]]
  ]
  const LAYERS = {
    dust: { lifetime: [12, 25], size: [0.35, 0.85] },
    glint: { lifetime: [6, 11], size: [0.75, 1.45] },
    streak: { lifetime: [1.8, 3.4], size: [1.1, 1.9] }
  }

  function createRng (seed) {
    let state = seed >>> 0

    return function random () {
      state = (state + 0x6D2B79F5) >>> 0
      let value = state
      value = Math.imul(value ^ (value >>> 15), value | 1)
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296
    }
  }

  function between (range, rng) {
    return range[0] + (range[1] - range[0]) * rng()
  }

  function createParticle (index, rng) {
    const roll = rng()
    const layer = roll < 0.84 ? 'dust' : roll < 0.97 ? 'glint' : 'streak'
    const profile = LAYERS[layer]

    return {
      index,
      layer,
      band: Math.floor(rng() * ORBIT_BANDS.length),
      phase: rng(),
      lifetime: between(profile.lifetime, rng),
      size: between(profile.size, rng),
      jitter: (rng() * 2 - 1) * 0.018,
      wave: rng() * TAU
    }
  }

  function cubicBezier (a, b, c, d, t) {
    const inverse = 1 - t
    return inverse * inverse * inverse * a +
      3 * inverse * inverse * t * b +
      3 * inverse * t * t * c +
      t * t * t * d
  }

  function clampedPointer (pointer) {
    const x = pointer && Number.isFinite(pointer.x) ? pointer.x : 0
    const y = pointer && Number.isFinite(pointer.y) ? pointer.y : 0
    const magnitude = Math.hypot(x, y)
    const scale = magnitude > POINTER_LIMIT ? POINTER_LIMIT / magnitude : 1
    return { x: x * scale, y: y * scale }
  }

  function positionParticle (particle, progress, viewport, pointer) {
    const band = ORBIT_BANDS[particle.band] || ORBIT_BANDS[0]
    const t = Math.max(0, Math.min(1, progress))
    const pointerOffset = clampedPointer(pointer)
    const pointerInfluence = 4 * t * (1 - t)
    const jitter = Number.isFinite(particle.jitter) ? particle.jitter : 0
    const wave = Number.isFinite(particle.wave) ? particle.wave : 0

    return {
      x: cubicBezier(band[0][0], band[1][0], band[2][0], band[3][0], t) * viewport.width +
        pointerOffset.x * pointerInfluence,
      y: cubicBezier(band[0][1], band[1][1], band[2][1], band[3][1], t) * viewport.height +
        Math.sin(t * TAU + wave) * jitter * viewport.height +
        pointerOffset.y * pointerInfluence
    }
  }

  function advancePhase (phase, elapsedSeconds, lifetimeSeconds) {
    const next = (phase + elapsedSeconds / lifetimeSeconds) % 1
    return next < 0 ? next + 1 : next
  }

  function smoothstep (edge0, edge1, value) {
    const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)
  }

  function edgeFade (progress) {
    return smoothstep(0, 0.08, progress) * (1 - smoothstep(0.92, 1, progress))
  }

  function nextQuality (state, averageFrameMs) {
    const level = Number.isInteger(state.level) ? state.level : MAX_QUALITY
    const previous = Array.isArray(state.frameTimes) ? state.frameTimes : []
    const frameTimes = previous.concat(averageFrameMs).slice(-QUALITY_WINDOW)

    if (frameTimes.length < QUALITY_WINDOW) return { ...state, level, frameTimes }

    let sum = 0
    let compensation = 0
    for (const frameTime of frameTimes) {
      const corrected = frameTime - compensation
      const nextSum = sum + corrected
      compensation = (nextSum - sum) - corrected
      sum = nextSum
    }
    const windowAverage = sum / QUALITY_WINDOW
    if (windowAverage > 18.2 && level > 0) {
      return { ...state, level: level - 1, frameTimes: [] }
    }
    if (windowAverage < 15.5 && level < MAX_QUALITY) {
      return { ...state, level: level + 1, frameTimes: [] }
    }
    return { ...state, level, frameTimes }
  }

  return {
    createRng,
    createParticle,
    cubicBezier,
    positionParticle,
    advancePhase,
    edgeFade,
    nextQuality
  }
})
