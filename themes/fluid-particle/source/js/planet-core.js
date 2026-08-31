(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.FluidPlanetCore = api
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict'

  const TAU = Math.PI * 2
  const ROTATION_PERIOD_MS = 70000
  const TEXTURE_WIDTH = 1024
  const TEXTURE_HEIGHT = 512
  const QUALITY_WINDOW = 120
  const DESKTOP_LEVELS = Object.freeze([
    Object.freeze({ maxWidth: 384, fps: 20 }),
    Object.freeze({ maxWidth: 448, fps: 24 }),
    Object.freeze({ maxWidth: 512, fps: 30 })
  ])
  const MOBILE_LEVELS = Object.freeze([
    Object.freeze({ maxWidth: 256, fps: 15 }),
    Object.freeze({ maxWidth: 288, fps: 18 }),
    Object.freeze({ maxWidth: 320, fps: 20 })
  ])

  function modulo (value, divisor) {
    const result = value % divisor
    return result < 0 ? result + divisor : result
  }

  function latitudeSpeedFactor (latitudeRadians) {
    const cosine = Math.cos(latitudeRadians)
    return 0.94 + 0.06 * cosine * cosine
  }

  function advanceBasePhase (basePhase, elapsedMs, periodMs) {
    return basePhase + Math.max(0, elapsedMs) / (periodMs || ROTATION_PERIOD_MS) * TAU
  }

  function sampleLongitude (baseLongitude, basePhase, speedFactor) {
    return modulo(baseLongitude + basePhase * speedFactor, TAU)
  }

  function roundToEight (value) {
    return Math.max(8, Math.round(value / 8) * 8)
  }

  function computeBackingSize (options) {
    const levels = options.mobile ? MOBILE_LEVELS : DESKTOP_LEVELS
    const level = Math.max(0, Math.min(2, options.level | 0))
    const policy = levels[level]
    const requestedDpr = Number.isFinite(options.devicePixelRatio) && options.devicePixelRatio > 0 ? options.devicePixelRatio : 1
    const effectiveDpr = Math.min(requestedDpr, options.mobile ? 1.25 : 1.5)
    const width = roundToEight(Math.min(policy.maxWidth, Math.max(1, options.cssWidth) * effectiveDpr))
    const height = roundToEight(width / options.aspectRatio)
    return { width, height, effectiveDpr, fps: policy.fps, maxWidth: policy.maxWidth }
  }

  function createQualityState (level) {
    return {
      level: Math.max(0, Math.min(2, Number.isInteger(level) ? level : 2)),
      samples: new Float64Array(QUALITY_WINDOW),
      sorted: new Float64Array(QUALITY_WINDOW),
      count: 0,
      cursor: 0,
      warmupComplete: false,
      restoreWindows: 0,
      averageDrawMs: 0,
      p95DrawMs: 0,
      maxDrawMs: 0,
      over8msPercent: 0
    }
  }

  function recordDrawCost (state, drawMs) {
    state.samples[state.cursor] = Math.max(0, drawMs)
    state.cursor++
    state.count++
    if (state.count < QUALITY_WINDOW) return state.level

    let sum = 0
    let maximum = 0
    let overEight = 0
    state.sorted.set(state.samples)
    state.sorted.sort()
    for (let index = 0; index < QUALITY_WINDOW; index++) {
      const sample = state.samples[index]
      sum += sample
      if (sample > maximum) maximum = sample
      if (sample > 8) overEight++
    }
    state.averageDrawMs = sum / QUALITY_WINDOW
    state.p95DrawMs = state.sorted[Math.ceil(0.95 * QUALITY_WINDOW) - 1]
    state.maxDrawMs = maximum
    state.over8msPercent = overEight / QUALITY_WINDOW * 100
    state.count = 0
    state.cursor = 0

    if (!state.warmupComplete) {
      state.warmupComplete = true
      state.restoreWindows = 0
      return state.level
    }
    if (state.p95DrawMs > 4 || state.over8msPercent > 2) {
      state.level = Math.max(0, state.level - 1)
      state.restoreWindows = 0
      return state.level
    }
    const restorative = state.averageDrawMs <= 2.2 && state.p95DrawMs <= 3.2 && state.maxDrawMs <= 6
    if (!restorative || state.level === 2) {
      state.restoreWindows = 0
      return state.level
    }
    state.restoreWindows++
    if (state.restoreWindows >= 2) {
      state.level++
      state.restoreWindows = 0
    }
    return state.level
  }

  function resetQualitySamples (state) {
    state.samples.fill(0)
    state.sorted.fill(0)
    state.count = 0
    state.cursor = 0
    state.restoreWindows = 0
    return state
  }

  return Object.freeze({
    TAU,
    ROTATION_PERIOD_MS,
    TEXTURE_WIDTH,
    TEXTURE_HEIGHT,
    QUALITY_WINDOW,
    DESKTOP_LEVELS,
    MOBILE_LEVELS,
    modulo,
    latitudeSpeedFactor,
    advanceBasePhase,
    sampleLongitude,
    computeBackingSize,
    createQualityState,
    recordDrawCost,
    resetQualitySamples
  })
})
