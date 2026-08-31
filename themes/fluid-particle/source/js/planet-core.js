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
  const PALETTE = Object.freeze({
    night: [23, 19, 44],
    ocean: [22, 58, 87],
    violet: [86, 52, 89],
    terracotta: [180, 95, 104],
    sand: [240, 211, 177]
  })
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

  function mixChannel (left, right, amount) {
    return left + (right - left) * Math.max(0, Math.min(1, amount))
  }

  function clampChannel (value) {
    return Math.max(0, Math.min(255, Math.round(value)))
  }

  function fillTexturePixels (output, width, height, seed) {
    const textureWidth = width || TEXTURE_WIDTH
    const textureHeight = height || TEXTURE_HEIGHT
    if (!(output instanceof Uint8ClampedArray) || output.length !== textureWidth * textureHeight * 4) {
      throw new TypeError('texture output length must equal width × height × 4')
    }
    const rng = createRng(Number.isInteger(seed) ? seed : 0x706C616E)
    const phases = new Float64Array(8)
    for (let index = 0; index < phases.length; index++) phases[index] = rng() * TAU
    const vortexU = 0.68 + rng() * 0.08
    const vortexV = 0.58 + rng() * 0.08

    for (let y = 0; y < textureHeight; y++) {
      const v = y / Math.max(1, textureHeight - 1)
      for (let x = 0; x < textureWidth; x++) {
        const u = x / textureWidth
        const fieldA = Math.sin(TAU * (3 * u + 1.15 * v) + phases[0])
        const fieldB = Math.sin(TAU * (7 * u - 2.4 * v) + phases[1] + 0.48 * fieldA)
        const fieldC = Math.sin(TAU * (13 * u + 4.2 * v) + phases[2] + 0.31 * fieldB)
        const fieldD = Math.sin(TAU * (19 * u - 7.3 * v) + phases[3] + 0.18 * fieldC)
        const warpedV = v + 0.018 * fieldA + 0.01 * fieldB
        const broadBand = 0.5 + 0.5 * Math.sin(TAU * (5.2 * warpedV + 0.07 * fieldB) + phases[4])
        const fineBand = 0.5 + 0.5 * Math.sin(TAU * (12.4 * warpedV + 0.025 * fieldC) + phases[5])
        const seam = Math.pow(1 - Math.abs(Math.sin(TAU * (8.1 * warpedV + 0.018 * fieldD) + phases[6])), 18)
        const filament = Math.pow(1 - Math.abs(Math.sin(TAU * (17 * u + 5.7 * warpedV) + phases[3])), 24) * Math.max(0, fieldC)
        const localizedDarkening = Math.min(0.72, seam * (0.38 + 0.2 * Math.max(0, fieldB)) + filament * 0.34)
        const wrappedDx = modulo(u - vortexU + 0.5, 1) - 0.5
        const vortexDy = (v - vortexV) * 1.8
        const radius = Math.hypot(wrappedDx * 5.4, vortexDy * 5.4)
        const angle = Math.atan2(vortexDy, wrappedDx)
        const vortex = Math.max(0, 1 - radius) * (0.5 + 0.5 * Math.sin(angle * 2.2 + radius * 15 + phases[7]))
        const warmMix = Math.max(0, Math.min(1, broadBand * 0.72 + fineBand * 0.22 + vortex * 0.28))
        const coolMix = Math.max(0, Math.min(1, 0.38 + 0.28 * fieldA - 0.16 * fieldC))
        const base = coolMix > 0.62 ? PALETTE.ocean : coolMix > 0.34 ? PALETTE.violet : PALETTE.night
        const warm = fineBand > 0.57 ? PALETTE.sand : PALETTE.terracotta
        const offset = (y * textureWidth + x) * 4
        output[offset] = clampChannel(mixChannel(base[0], warm[0], warmMix) * (1 - localizedDarkening))
        output[offset + 1] = clampChannel(mixChannel(base[1], warm[1], warmMix) * (1 - localizedDarkening * 1.04))
        output[offset + 2] = clampChannel(mixChannel(base[2], warm[2], warmMix * 0.82) * (1 - localizedDarkening * 0.8))
        output[offset + 3] = 255
      }
    }
    return output
  }

  function sampleTextureChannel (pixels, width, height, x, y, channel) {
    const wrappedX = modulo(x, width)
    const clampedY = Math.max(0, Math.min(height - 1, y))
    const x0 = Math.floor(wrappedX)
    const x1 = x0 + 1 === width ? 0 : x0 + 1
    const y0 = Math.floor(clampedY)
    const y1 = Math.min(height - 1, y0 + 1)
    const horizontal = wrappedX - x0
    const vertical = clampedY - y0
    const topLeft = pixels[(y0 * width + x0) * 4 + channel]
    const topRight = pixels[(y0 * width + x1) * 4 + channel]
    const bottomLeft = pixels[(y1 * width + x0) * 4 + channel]
    const bottomRight = pixels[(y1 * width + x1) * 4 + channel]
    const top = topLeft + (topRight - topLeft) * horizontal
    const bottom = bottomLeft + (bottomRight - bottomLeft) * horizontal
    return top + (bottom - top) * vertical
  }

  function createSphereMap (options) {
    const capacity = options.width * options.height
    const targetOffsets = new Uint32Array(capacity)
    const sourceRows = options.sourceHeight <= 65535 ? new Uint16Array(capacity) : new Uint32Array(capacity)
    const baseSourceX = new Float32Array(capacity)
    const speedFactors = new Float32Array(capacity)
    const limbCoverage = new Uint8Array(capacity)
    const cosine = Math.cos(options.equatorRadians)
    const sine = Math.sin(options.equatorRadians)
    let visibleCount = 0

    for (let y = 0; y < options.height; y++) {
      const normalizedY = ((y + 0.5) / options.height) * 2 - 1
      for (let x = 0; x < options.width; x++) {
        const normalizedX = ((x + 0.5) / options.width) * 2 - 1
        const sphereX = normalizedX * cosine + normalizedY * sine
        const sphereY = -normalizedX * sine + normalizedY * cosine
        const radiusSquared = sphereX * sphereX + sphereY * sphereY
        if (radiusSquared > 1) continue
        const sphereZ = Math.sqrt(Math.max(0, 1 - radiusSquared))
        const latitude = Math.asin(Math.max(-1, Math.min(1, sphereY)))
        const longitude = Math.atan2(sphereX, sphereZ)
        targetOffsets[visibleCount] = (y * options.width + x) * 4
        sourceRows[visibleCount] = Math.min(options.sourceHeight - 1, Math.max(0, Math.round((latitude / Math.PI + 0.5) * (options.sourceHeight - 1))))
        baseSourceX[visibleCount] = modulo(longitude / TAU + 0.5, 1) * options.sourceWidth
        speedFactors[visibleCount] = latitudeSpeedFactor(latitude)
        limbCoverage[visibleCount] = Math.round(Math.min(1, Math.max(0, (1 - Math.sqrt(radiusSquared)) * options.width * 0.7)) * 255)
        visibleCount++
      }
    }

    return {
      targetOffsets: targetOffsets.subarray(0, visibleCount),
      sourceRows: sourceRows.subarray(0, visibleCount),
      baseSourceX: baseSourceX.subarray(0, visibleCount),
      speedFactors: speedFactors.subarray(0, visibleCount),
      limbCoverage: limbCoverage.subarray(0, visibleCount),
      visibleCount,
      width: options.width,
      height: options.height
    }
  }

  function renderProjectedFrame (texturePixels, textureWidth, map, basePhase, outputPixels) {
    const phaseScale = basePhase / TAU * textureWidth
    for (let index = 0; index < map.visibleCount; index++) {
      const sourceX = modulo(map.baseSourceX[index] + phaseScale * map.speedFactors[index], textureWidth)
      const sourceX0 = Math.floor(sourceX)
      const sourceX1 = sourceX0 + 1 === textureWidth ? 0 : sourceX0 + 1
      const horizontal = sourceX - sourceX0
      const rowOffset = map.sourceRows[index] * textureWidth * 4
      const sourceOffset0 = rowOffset + sourceX0 * 4
      const sourceOffset1 = rowOffset + sourceX1 * 4
      const targetOffset = map.targetOffsets[index]
      outputPixels[targetOffset] = texturePixels[sourceOffset0] + (texturePixels[sourceOffset1] - texturePixels[sourceOffset0]) * horizontal
      outputPixels[targetOffset + 1] = texturePixels[sourceOffset0 + 1] + (texturePixels[sourceOffset1 + 1] - texturePixels[sourceOffset0 + 1]) * horizontal
      outputPixels[targetOffset + 2] = texturePixels[sourceOffset0 + 2] + (texturePixels[sourceOffset1 + 2] - texturePixels[sourceOffset0 + 2]) * horizontal
      outputPixels[targetOffset + 3] = map.limbCoverage[index]
    }
    return outputPixels
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
    createRng,
    fillTexturePixels,
    sampleTextureChannel,
    createSphereMap,
    renderProjectedFrame,
    computeBackingSize,
    createQualityState,
    recordDrawCost,
    resetQualitySamples
  })
})
