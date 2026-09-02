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
    abyss: [26, 29, 78],
    indigo: [38, 38, 96],
    violet: [52, 47, 114],
    haze: [67, 61, 133]
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

  function clamp01 (value) {
    return Math.max(0, Math.min(1, value))
  }

  function smoothFalloff (value) {
    const clamped = clamp01(value)
    return 1 - clamped * clamped * (3 - 2 * clamped)
  }

  function writeGasFlowVector (output, u, v) {
    if (!output || output.length < 2) throw new TypeError('gas flow output requires two channels')

    const centerU = 0.44
    const centerV = 0.48
    const dx = modulo(u - centerU + 0.5, 1) - 0.5
    const dy = v - centerV
    const normalizedX = dx / 0.25
    const normalizedY = dy / 0.18
    const radius = Math.hypot(normalizedX, normalizedY)
    const centerFade = 1 - Math.exp(-radius * radius * 13)
    const outerFade = Math.exp(-radius * radius * 0.88)
    const entrainment = 1 + 0.09 * Math.sin(TAU * (3 * u + 2 * v)) +
      0.045 * Math.sin(TAU * (7 * u - 3 * v)) + 0.022 * Math.sin(TAU * (13 * u + 5 * v))
    const radialStrength = 0.05 * centerFade * outerFade * entrainment
    const inverseRadius = radius > 1e-9 ? 1 / radius : 0
    const radialX = normalizedX * inverseRadius
    const radialY = normalizedY * inverseRadius
    const flowAngle = Math.atan2(normalizedY, normalizedX)
    const curlRatio = 0.08 * Math.sin(
      flowAngle * 2 + radius * 4.2 + 0.45 * Math.sin(TAU * (5 * u - 3 * v))
    )

    let flowX = radialStrength * (radialX - radialY * curlRatio) * 1.18
    let flowY = radialStrength * (radialY + radialX * curlRatio) * 0.84

    const inletDistance = centerV - v
    if (inletDistance > 0) {
      const meanderedDx = dx - 0.012 * Math.sin(TAU * (1.4 * v + 0.18))
      const inletAcross = meanderedDx / 0.06
      const inletCenterFade = Math.min(1, inletDistance / 0.065)
      const inletLength = (inletDistance - 0.2) / 0.31
      const inletEnvelope = Math.exp(-0.5 * inletAcross * inletAcross) *
        Math.exp(-Math.pow(inletLength, 4)) * inletCenterFade
      const inlet = 0.055 * inletEnvelope
      flowX += inlet * 0.075 * Math.sin(TAU * (2 * v + 3 * u))
      flowY += inlet
    }

    output[0] = flowX
    output[1] = flowY
    return output
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
    const flow = new Float64Array(2)

    for (let y = 0; y < textureHeight; y++) {
      const v = y / Math.max(1, textureHeight - 1)
      for (let x = 0; x < textureWidth; x++) {
        const u = x / textureWidth
        writeGasFlowVector(flow, u, v)
        const qU = modulo(u - flow[0], 1)
        const qV = Math.max(0, Math.min(1, v - flow[1]))
        const fieldA = Math.sin(TAU * (2 * qU + 0.72 * qV) + phases[0])
        const fieldB = Math.sin(TAU * (5 * qU - 1.35 * qV) + phases[1] + 0.34 * fieldA)
        const fieldC = Math.sin(TAU * (11 * qU + 2.65 * qV) + phases[2] + 0.24 * fieldB)
        const fieldD = Math.sin(TAU * (17 * qU - 4.4 * qV) + phases[3] + 0.15 * fieldC)
        const warpedV = qV + 0.015 * fieldA + 0.008 * fieldB + 0.004 * fieldC
        const broadBand = 0.5 + 0.5 * Math.sin(TAU * (4.35 * warpedV + 0.048 * fieldB) + phases[4])
        const fineBand = 0.5 + 0.5 * Math.sin(TAU * (10.6 * warpedV + 0.021 * fieldC) + phases[5])
        const seam = Math.pow(1 - Math.abs(Math.sin(TAU * (7.3 * warpedV + 0.014 * fieldD) + phases[6])), 5)
        const filament = Math.pow(1 - Math.abs(Math.sin(TAU * (13 * qU + 4.8 * warpedV) + phases[7])), 6) * (0.5 + 0.5 * fieldC)
        const darkening = Math.min(0.16, seam * (0.075 + 0.025 * Math.max(0, fieldB)) + filament * 0.05)
        const tone = Math.max(0, Math.min(1,
          0.48 + 0.4 * (broadBand - 0.5) + 0.2 * (fineBand - 0.5) +
          0.125 * fieldA + 0.075 * fieldC + 0.045 * fieldD
        ))
        let colorLow = PALETTE.abyss
        let colorHigh = PALETTE.indigo
        let colorMix = tone / 0.34
        if (tone >= 0.68) {
          colorLow = PALETTE.violet
          colorHigh = PALETTE.haze
          colorMix = (tone - 0.68) / 0.32
        } else if (tone >= 0.34) {
          colorLow = PALETTE.indigo
          colorHigh = PALETTE.violet
          colorMix = (tone - 0.34) / 0.34
        }
        const baseRed = mixChannel(colorLow[0], colorHigh[0], colorMix)
        const baseGreen = mixChannel(colorLow[1], colorHigh[1], colorMix)
        const baseBlue = mixChannel(colorLow[2], colorHigh[2], colorMix)
        const violetVeil = 0.5 + 0.5 * Math.sin(TAU * (1.7 * warpedV + 0.18 * fieldA) + phases[3])
        const offset = (y * textureWidth + x) * 4
        output[offset] = clampChannel((baseRed + violetVeil * 7 + fieldB * 2.4 + fieldD * 1.3) * (1 - darkening * 0.92))
        output[offset + 1] = clampChannel((baseGreen + violetVeil * 2 + fieldC * 2.1 - fieldD * 1.1) * (1 - darkening))
        output[offset + 2] = clampChannel((baseBlue + violetVeil * 7 + fieldD * 3.1 + fieldB * 1.4) * (1 - darkening * 0.7))
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
    const projectionIndexByPixel = new Uint32Array(capacity)
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
        projectionIndexByPixel[targetOffsets[visibleCount] / 4] = visibleCount + 1
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
      projectionIndexByPixel,
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

  function applyLocalizedGasDisplacement (texturePixels, textureWidth, textureHeight, map, basePhase, interaction, outputPixels) {
    const hoverEnergy = clamp01(interaction.hoverEnergy)
    const impactEnergy = clamp01(interaction.impactEnergy)
    if (hoverEnergy === 0 && impactEnergy === 0) return outputPixels

    let minimumX = map.width
    let maximumX = -1
    let minimumY = map.height
    let maximumY = -1
    if (hoverEnergy > 0) {
      minimumX = Math.max(0, Math.floor((interaction.hoverX - 0.32 + 1) * map.width * 0.5))
      maximumX = Math.min(map.width - 1, Math.ceil((interaction.hoverX + 0.32 + 1) * map.width * 0.5) - 1)
      minimumY = Math.max(0, Math.floor((interaction.hoverY - 0.32 + 1) * map.height * 0.5))
      maximumY = Math.min(map.height - 1, Math.ceil((interaction.hoverY + 0.32 + 1) * map.height * 0.5) - 1)
    }
    if (impactEnergy > 0) {
      minimumX = Math.max(0, Math.min(minimumX, Math.floor((interaction.impactX - 0.56 + 1) * map.width * 0.5)))
      maximumX = Math.min(map.width - 1, Math.max(maximumX, Math.ceil((interaction.impactX + 0.56 + 1) * map.width * 0.5) - 1))
      minimumY = Math.max(0, Math.min(minimumY, Math.floor((interaction.impactY - 0.56 + 1) * map.height * 0.5)))
      maximumY = Math.min(map.height - 1, Math.max(maximumY, Math.ceil((interaction.impactY + 0.56 + 1) * map.height * 0.5) - 1))
    }

    const phaseScale = basePhase / TAU * textureWidth
    for (let y = minimumY; y <= maximumY; y++) {
      const normalizedY = ((y + 0.5) / map.height) * 2 - 1
      for (let x = minimumX; x <= maximumX; x++) {
        const lookup = map.projectionIndexByPixel[y * map.width + x]
        if (lookup === 0) continue

        const normalizedX = ((x + 0.5) / map.width) * 2 - 1
        const hoverDx = normalizedX - interaction.hoverX
        const hoverDy = normalizedY - interaction.hoverY
        const impactDx = normalizedX - interaction.impactX
        const impactDy = normalizedY - interaction.impactY
        const distanceToHover = Math.hypot(hoverDx, hoverDy)
        const distanceToImpact = Math.hypot(impactDx, impactDy)
        const hoverFalloff = smoothFalloff(distanceToHover / 0.32) * hoverEnergy
        const impactFalloff = smoothFalloff(distanceToImpact / 0.56) * impactEnergy
        const hoverShift = hoverFalloff * 1.5
        const impactShift = impactFalloff * 6
        if (hoverShift === 0 && impactShift === 0) continue

        let longitudeShift = 0
        let latitudeShift = 0
        if (distanceToHover > 0) {
          longitudeShift -= hoverDy / distanceToHover * hoverShift
          latitudeShift += hoverDx / distanceToHover * hoverShift * 0.5
        }
        if (distanceToImpact > 0) {
          longitudeShift -= impactDy / distanceToImpact * impactShift
          latitudeShift += impactDx / distanceToImpact * impactShift * 0.5
        }

        const index = lookup - 1
        const sourceX = map.baseSourceX[index] + phaseScale * map.speedFactors[index] + longitudeShift
        const sourceY = map.sourceRows[index] + latitudeShift
        const targetOffset = map.targetOffsets[index]
        outputPixels[targetOffset] = sampleTextureChannel(texturePixels, textureWidth, textureHeight, sourceX, sourceY, 0)
        outputPixels[targetOffset + 1] = sampleTextureChannel(texturePixels, textureWidth, textureHeight, sourceX, sourceY, 1)
        outputPixels[targetOffset + 2] = sampleTextureChannel(texturePixels, textureWidth, textureHeight, sourceX, sourceY, 2)
      }
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
    writeGasFlowVector,
    fillTexturePixels,
    sampleTextureChannel,
    createSphereMap,
    renderProjectedFrame,
    applyLocalizedGasDisplacement,
    computeBackingSize,
    createQualityState,
    recordDrawCost,
    resetQualitySamples
  })
})
