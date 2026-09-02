const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const modulePath = path.resolve(__dirname, '../themes/fluid-particle/source/js/planet-core.js')
const core = require(modulePath)
const feedWindow = (state, values) => {
  for (let index = 0; index < core.QUALITY_WINDOW; index++) {
    core.recordDrawCost(state, values[index] ?? values.at(-1))
  }
}

test('rotation is frame-rate independent and keeps the equatorial base phase unwrapped', () => {
  const split = core.advanceBasePhase(core.advanceBasePhase(0, 400), 600)
  const whole = core.advanceBasePhase(0, 1000)
  assert.ok(Math.abs(split - whole) < 1e-12)
  assert.ok(core.advanceBasePhase(0, 70001) > core.TAU)
  assert.equal(core.ROTATION_PERIOD_MS, 70000)
})

test('latitude speed and sampling stay continuous across the equatorial 2π boundary', () => {
  assert.equal(core.latitudeSpeedFactor(0), 1)
  assert.ok(Math.abs(core.latitudeSpeedFactor(Math.PI / 4) - 0.97) < 1e-12)
  assert.ok(Math.abs(core.latitudeSpeedFactor(Math.PI / 2) - 0.94) < 1e-12)
  const factor = core.latitudeSpeedFactor(Math.PI / 3)
  const before = core.sampleLongitude(0.7, core.TAU - 1e-6, factor)
  const after = core.sampleLongitude(0.7, core.TAU + 1e-6, factor)
  const circularDelta = Math.abs(core.modulo(after - before + Math.PI, core.TAU) - Math.PI)
  assert.ok(circularDelta < 3e-6, circularDelta)
})

test('backing sizes obey caps, eight-pixel rounding, aspect, and policy levels', () => {
  assert.deepEqual(core.computeBackingSize({ cssWidth: 400, aspectRatio: 43 / 38, devicePixelRatio: 2, mobile: false, level: 2 }), {
    width: 512, height: 456, effectiveDpr: 1.5, fps: 30, maxWidth: 512
  })
  assert.deepEqual(core.computeBackingSize({ cssWidth: 400, aspectRatio: 43 / 38, devicePixelRatio: 2, mobile: true, level: 2 }), {
    width: 320, height: 280, effectiveDpr: 1.25, fps: 20, maxWidth: 320
  })
  assert.equal(core.computeBackingSize({ cssWidth: 3, aspectRatio: 43 / 38, devicePixelRatio: 1, mobile: false, level: 0 }).width, 8)
  assert.deepEqual(core.DESKTOP_LEVELS.map(level => [level.maxWidth, level.fps]), [[384, 20], [448, 24], [512, 30]])
  assert.deepEqual(core.MOBILE_LEVELS.map(level => [level.maxWidth, level.fps]), [[256, 15], [288, 18], [320, 20]])
})

test('quality ignores warmup, degrades one level per bad window, and needs two good windows to restore', () => {
  const state = core.createQualityState(2)
  const samples = state.samples
  feedWindow(state, [5])
  assert.equal(state.level, 2)
  feedWindow(state, [5])
  assert.equal(state.level, 1)
  feedWindow(state, [9, 9, 9, ...Array(117).fill(3)])
  assert.equal(state.level, 0)
  feedWindow(state, [2])
  assert.equal(state.level, 0)
  feedWindow(state, [2])
  assert.equal(state.level, 1)
  assert.equal(state.samples, samples)
  core.resetQualitySamples(state)
  assert.equal(state.level, 1)
  assert.equal(state.count, 0)
})

test('fixed-seed gas texture is deterministic, opaque, detailed, low-contrast blue-purple, and horizontally periodic', () => {
  const width = 128
  const height = 64
  const first = new Uint8ClampedArray(width * height * 4)
  const second = new Uint8ClampedArray(first.length)
  const different = new Uint8ClampedArray(first.length)
  assert.equal(core.fillTexturePixels(first, width, height, 0x706C616E), first)
  core.fillTexturePixels(second, width, height, 0x706C616E)
  core.fillTexturePixels(different, width, height, 0x706C616F)
  assert.deepEqual(first, second)
  assert.notDeepEqual(first, different)

  const colors = new Set()
  let warm = 0
  let bluePurple = 0
  let purple = 0
  const channelTotals = [0, 0, 0]
  const horizontalDeltas = []
  const verticalDeltas = []
  const textureLuminance = []
  const rowMeans = Array.from({ length: height }, () => [0, 0, 0])
  for (let offset = 0; offset < first.length; offset += 4) {
    const pixel = offset / 4
    const x = pixel % width
    const y = Math.floor(pixel / width)
    const red = first[offset]
    const green = first[offset + 1]
    const blue = first[offset + 2]
    colors.add(`${red},${green},${blue}`)
    if (red > blue * 1.05) warm++
    if (blue >= red + 12 && blue >= green + 8) bluePurple++
    if (red >= green + 4) purple++
    channelTotals[0] += red
    channelTotals[1] += green
    channelTotals[2] += blue
    textureLuminance.push(red * 0.2126 + green * 0.7152 + blue * 0.0722)
    rowMeans[y][0] += red / width
    rowMeans[y][1] += green / width
    rowMeans[y][2] += blue / width
    if (x > 0) {
      horizontalDeltas.push((Math.abs(red - first[offset - 4]) + Math.abs(green - first[offset - 3]) + Math.abs(blue - first[offset - 2])) / 3)
    }
    if (y > 0) {
      const above = offset - width * 4
      verticalDeltas.push((Math.abs(red - first[above]) + Math.abs(green - first[above + 1]) + Math.abs(blue - first[above + 2])) / 3)
    }
    assert.equal(first[offset + 3], 255)
  }
  const pixelCount = width * height
  const channelMeans = channelTotals.map(total => total / pixelCount)
  assert.ok(colors.size > 700, colors.size)
  assert.ok(warm < pixelCount * 0.02, warm)
  assert.ok(bluePurple > pixelCount * 0.72, bluePurple)
  assert.ok(purple > pixelCount * 0.25, purple)
  assert.ok(channelMeans[2] - channelMeans[0] > 30, channelMeans)
  assert.ok(channelMeans[2] - channelMeans[1] > 22, channelMeans)
  textureLuminance.sort((left, right) => left - right)
  const textureP5 = textureLuminance[Math.ceil(textureLuminance.length * 0.05) - 1]
  const textureP95 = textureLuminance[Math.ceil(textureLuminance.length * 0.95) - 1]
  const textureP99 = textureLuminance[Math.ceil(textureLuminance.length * 0.99) - 1]
  assert.ok(textureP95 - textureP5 > 22, textureP95 - textureP5)
  assert.ok(textureP99 < 110, textureP99)

  horizontalDeltas.sort((left, right) => left - right)
  verticalDeltas.sort((left, right) => left - right)
  const percentile = (values, amount) => values[Math.ceil(values.length * amount) - 1]
  const horizontalMean = horizontalDeltas.reduce((sum, value) => sum + value, 0) / horizontalDeltas.length
  assert.ok(horizontalMean > 0.5, horizontalMean)
  assert.ok(percentile(horizontalDeltas, 0.99) < 32, percentile(horizontalDeltas, 0.99))
  assert.ok(horizontalDeltas.at(-1) < 16, horizontalDeltas.at(-1))
  assert.ok(percentile(verticalDeltas, 0.95) < 20, percentile(verticalDeltas, 0.95))
  assert.ok(percentile(verticalDeltas, 0.99) < 32, percentile(verticalDeltas, 0.99))
  const rowDeltas = rowMeans.slice(1).map((row, index) => (
    Math.abs(row[0] - rowMeans[index][0]) +
    Math.abs(row[1] - rowMeans[index][1]) +
    Math.abs(row[2] - rowMeans[index][2])
  ) / 3).sort((left, right) => left - right)
  const rowMean = rowDeltas.reduce((sum, value) => sum + value, 0) / rowDeltas.length
  const rowP95 = rowDeltas[Math.ceil(rowDeltas.length * 0.95) - 1]
  assert.ok(rowMean < 8, rowMean)
  assert.ok(rowP95 < 16, rowP95)

  const contactLuminance = []
  const outflowLuminance = []
  const flowCenterU = 0.44
  const flowCenterV = 0.48
  for (let y = 0; y < height; y++) {
    const v = y / (height - 1)
    for (let x = 0; x < width; x++) {
      const u = x / width
      const dx = core.modulo(u - flowCenterU + 0.5, 1) - 0.5
      const dy = v - flowCenterV
      const radius = Math.hypot(dx / 0.2, dy / 0.22)
      const offset = (y * width + x) * 4
      const luminance = first[offset] * 0.2126 + first[offset + 1] * 0.7152 + first[offset + 2] * 0.0722
      if (radius < 0.18) contactLuminance.push(luminance)
      else if (radius > 0.32 && radius < 0.62) outflowLuminance.push(luminance)
    }
  }
  contactLuminance.sort((left, right) => left - right)
  outflowLuminance.sort((left, right) => left - right)
  const contactP95 = percentile(contactLuminance, 0.95)
  const outflowP95 = percentile(outflowLuminance, 0.95)
  assert.ok(contactP95 <= outflowP95 + 8, `${contactP95} > ${outflowP95}`)

  let seamDelta = 0
  let interiorDelta = 0
  for (let y = 0; y < height; y++) {
    for (let channel = 0; channel < 3; channel++) {
      seamDelta += Math.abs(first[(y * width) * 4 + channel] - first[(y * width + width - 1) * 4 + channel])
      for (let x = 0; x < width - 1; x++) {
        interiorDelta += Math.abs(first[(y * width + x) * 4 + channel] - first[(y * width + x + 1) * 4 + channel])
      }
    }
  }
  const seamMean = seamDelta / (height * 3)
  const interiorMean = interiorDelta / (height * 3 * (width - 1))
  assert.ok(seamMean <= interiorMean * 1.5 + 1, `${seamMean} > ${interiorMean}`)

  for (const channel of [0, 1, 2, 3]) {
    assert.equal(
      core.sampleTextureChannel(first, width, height, -0.25, 13.4, channel),
      core.sampleTextureChannel(first, width, height, width - 0.25, 13.4, channel)
    )
  }

  const source = require('node:fs').readFileSync(modulePath, 'utf8')
  const fillBody = source.match(/function fillTexturePixels[\s\S]*?\n  }/)?.[0] || ''
  assert.match(fillBody, /writeGasFlowVector\(/)
})

test('gas flow enters vertically, spreads around its contact point, curls slightly, and fades into the ambient bands', () => {
  assert.equal(typeof core.writeGasFlowVector, 'function')
  const flowCenterU = 0.44
  const flowCenterV = 0.48
  const inletUpperV = flowCenterV - 0.23
  const inletMiddleV = flowCenterV - 0.14
  const sample = (u, v) => {
    const output = new Float64Array(2)
    assert.equal(core.writeGasFlowVector(output, u, v), output)
    assert.ok(Number.isFinite(output[0]) && Number.isFinite(output[1]))
    return output
  }

  const inletUpper = sample(flowCenterU, inletUpperV)
  const inletMiddle = sample(flowCenterU, inletMiddleV)
  assert.ok(inletUpper[1] > 0.012, inletUpper)
  assert.ok(inletMiddle[1] > 0.006, inletMiddle)
  assert.ok(Math.abs(inletUpper[0]) < inletUpper[1] * 0.55, inletUpper)
  assert.ok(Math.abs(inletMiddle[0]) < inletMiddle[1] * 0.65, inletMiddle)
  const inletLeft = sample(flowCenterU - 0.08, inletUpperV)
  const inletRight = sample(flowCenterU + 0.08, inletUpperV)
  assert.ok(inletLeft[1] < inletUpper[1] * 0.5, { inletLeft, inletUpper })
  assert.ok(inletRight[1] < inletUpper[1] * 0.5, { inletRight, inletUpper })

  const contact = sample(flowCenterU, flowCenterV)
  assert.ok(Math.hypot(contact[0], contact[1]) < 0.002, contact)

  const left = sample(flowCenterU - 0.09, flowCenterV)
  const right = sample(flowCenterU + 0.09, flowCenterV)
  const lower = sample(flowCenterU, flowCenterV + 0.1)
  assert.ok(left[0] < -0.008, left)
  assert.ok(right[0] > 0.008, right)
  assert.ok(lower[1] > 0.008, lower)

  const ringAngles = [0, Math.PI / 6, Math.PI / 3, Math.PI / 2, Math.PI * 2 / 3, Math.PI * 5 / 6, Math.PI, Math.PI * 7 / 6, Math.PI * 11 / 6]
  const components = ringAngles.map(angle => {
    const dx = 0.11 * Math.cos(angle)
    const dy = 0.11 * Math.sin(angle)
    const vector = sample(flowCenterU + dx, flowCenterV + dy)
    const radial = vector[0] * Math.cos(angle) + vector[1] * Math.sin(angle)
    const tangential = -vector[0] * Math.sin(angle) + vector[1] * Math.cos(angle)
    return { radial, tangential, magnitude: Math.hypot(vector[0], vector[1]) }
  })
  assert.ok(components.every(value => value.radial > 0.006), components)
  assert.ok(components.every(value => value.magnitude < 0.05), components)
  const radialTotal = components.reduce((sum, value) => sum + value.radial, 0)
  const tangentialTotal = components.reduce((sum, value) => sum + Math.abs(value.tangential), 0)
  const signedTangential = components.reduce((sum, value) => sum + value.tangential, 0)
  const positiveCurl = components.filter(value => value.tangential > 0.0001).length
  const negativeCurl = components.filter(value => value.tangential < -0.0001).length
  assert.ok(tangentialTotal / radialTotal > 0.05 && tangentialTotal / radialTotal < 0.25, tangentialTotal / radialTotal)
  assert.ok(positiveCurl >= 2 && negativeCurl >= 2, { positiveCurl, negativeCurl })
  assert.ok(Math.abs(signedTangential) / tangentialTotal < 0.55, signedTangential / tangentialTotal)

  const farPoints = [
    [flowCenterU - 0.32, 0.15], [flowCenterU - 0.32, 0.9],
    [flowCenterU + 0.32, 0.15], [flowCenterU + 0.32, 0.9],
    [flowCenterU - 0.48, 0.5], [flowCenterU + 0.48, 0.5]
  ]
  for (const point of farPoints) {
    const far = sample(point[0], point[1])
    assert.ok(Math.hypot(far[0], far[1]) < 0.003, { point, far })
  }
  for (const point of [[flowCenterU, inletUpperV], [flowCenterU - 0.09, flowCenterV], [flowCenterU + 0.09, flowCenterV], [flowCenterU + 0.05, flowCenterV + 0.08]]) {
    const original = sample(point[0], point[1])
    const wrapped = sample(point[0] + 1, point[1])
    assert.ok(Math.abs(original[0] - wrapped[0]) < 1e-12, { point, original, wrapped })
    assert.ok(Math.abs(original[1] - wrapped[1]) < 1e-12, { point, original, wrapped })
  }
})

test('sphere map excludes corners, stays in bounds, and records differential latitude speed', () => {
  const map = core.createSphereMap({
    width: 64,
    height: 56,
    sourceWidth: 128,
    sourceHeight: 64,
    equatorRadians: -10 * Math.PI / 180
  })
  assert.ok(map.visibleCount > 0 && map.visibleCount < 64 * 56)
  assert.equal(map.targetOffsets.length, map.visibleCount)
  assert.ok(map.targetOffsets instanceof Uint32Array)
  assert.ok(map.sourceRows instanceof Uint16Array || map.sourceRows instanceof Uint32Array)
  assert.ok(map.baseSourceX instanceof Float32Array)
  assert.ok(map.speedFactors instanceof Float32Array)
  assert.ok(map.limbCoverage instanceof Uint8Array)
  for (let index = 0; index < map.visibleCount; index++) {
    assert.ok(map.targetOffsets[index] <= (64 * 56 - 1) * 4)
    assert.ok(map.sourceRows[index] < 64)
    assert.ok(map.baseSourceX[index] >= 0 && map.baseSourceX[index] < 128)
    assert.ok(map.speedFactors[index] >= 0.94 && map.speedFactors[index] <= 1)
    assert.ok(map.limbCoverage[index] >= 0 && map.limbCoverage[index] <= 255)
  }
})

test('projection lookup covers every visible target exactly once and leaves corners zero', () => {
  const map = core.createSphereMap({
    width: 64,
    height: 56,
    sourceWidth: 128,
    sourceHeight: 64,
    equatorRadians: -10 * Math.PI / 180
  })
  assert.ok(map.projectionIndexByPixel instanceof Uint32Array)
  assert.equal(map.projectionIndexByPixel.length, map.width * map.height)
  assert.equal(map.projectionIndexByPixel[0], 0)
  assert.equal(map.projectionIndexByPixel[map.width - 1], 0)
  assert.equal(map.projectionIndexByPixel[(map.height - 1) * map.width], 0)
  assert.equal(map.projectionIndexByPixel.at(-1), 0)

  let lookupCount = 0
  const visitsByVisibleIndex = new Uint8Array(map.visibleCount)
  for (let pixel = 0; pixel < map.projectionIndexByPixel.length; pixel++) {
    const lookup = map.projectionIndexByPixel[pixel]
    if (lookup === 0) continue
    const visibleIndex = lookup - 1
    assert.ok(visibleIndex < map.visibleCount)
    assert.equal(map.targetOffsets[visibleIndex] / 4, pixel)
    visitsByVisibleIndex[visibleIndex]++
    lookupCount++
  }
  assert.equal(lookupCount, map.visibleCount)
  for (let index = 0; index < map.visibleCount; index++) {
    assert.equal(visitsByVisibleIndex[index], 1)
    assert.equal(map.projectionIndexByPixel[map.targetOffsets[index] / 4], index + 1)
  }
})

test('sphere map inverse-rotates minus ten degrees with exact longitude and symmetric latitude speeds', () => {
  const map = core.createSphereMap({
    width: 3,
    height: 3,
    sourceWidth: 360,
    sourceHeight: 181,
    equatorRadians: -10 * Math.PI / 180
  })
  const center = 4
  const rightMiddle = 5
  const northMiddle = 1
  const southMiddle = 7

  assert.equal(map.visibleCount, 9)
  assert.equal(map.sourceRows[center], 90)
  assert.equal(map.baseSourceX[center], 180)
  assert.equal(map.speedFactors[center], 1)
  assert.equal(map.sourceRows[rightMiddle], 97)
  assert.ok(Math.abs(map.baseSourceX[rightMiddle] - 221.37484741210938) < 1e-5)
  assert.ok(Math.abs(map.speedFactors[rightMiddle] - 0.9991958737373352) < 1e-7)
  assert.equal(map.sourceRows[northMiddle], 49)
  assert.equal(map.sourceRows[southMiddle], 131)
  assert.ok(Math.abs(map.speedFactors[northMiddle] - map.speedFactors[southMiddle]) < 1e-7)
  assert.ok(map.speedFactors[northMiddle] < map.speedFactors[center])
})

test('projected redraw changes phase while reusing every caller-owned buffer', () => {
  const texture = new Uint8ClampedArray(128 * 64 * 4)
  core.fillTexturePixels(texture, 128, 64, 0x706C616E)
  const map = core.createSphereMap({ width: 64, height: 56, sourceWidth: 128, sourceHeight: 64, equatorRadians: -10 * Math.PI / 180 })
  const output = new Uint8ClampedArray(64 * 56 * 4)
  const targetOffsets = map.targetOffsets
  assert.equal(core.renderProjectedFrame(texture, 128, map, 0, output), output)
  const firstFrame = Uint8ClampedArray.from(output)
  assert.equal(core.renderProjectedFrame(texture, 128, map, 0.07, output), output)
  assert.notDeepEqual(output, firstFrame)
  assert.equal(map.targetOffsets, targetOffsets)
})

test('localized gas displacement changes only its mapped radius and preserves alpha', () => {
  const texture = new Uint8ClampedArray(128 * 64 * 4)
  core.fillTexturePixels(texture, 128, 64, 0x706C616E)
  const map = core.createSphereMap({ width: 64, height: 56, sourceWidth: 128, sourceHeight: 64, equatorRadians: -10 * Math.PI / 180 })
  const baseline = new Uint8ClampedArray(64 * 56 * 4)
  const disturbed = new Uint8ClampedArray(64 * 56 * 4)
  core.renderProjectedFrame(texture, 128, map, 0.07, baseline)
  disturbed.set(baseline)
  const interaction = { hoverX: 0, hoverY: 0, hoverEnergy: 1, impactX: 0, impactY: 0, impactEnergy: 0 }
  assert.equal(core.applyLocalizedGasDisplacement(texture, 128, 64, map, 0.07, interaction, disturbed), disturbed)
  let changed = 0
  for (let pixel = 0; pixel < map.width * map.height; pixel++) {
    const offset = pixel * 4
    assert.equal(disturbed[offset + 3], baseline[offset + 3])
    const x = ((pixel % map.width) + 0.5) / map.width * 2 - 1
    const y = (Math.floor(pixel / map.width) + 0.5) / map.height * 2 - 1
    const differs = disturbed[offset] !== baseline[offset] || disturbed[offset + 1] !== baseline[offset + 1] || disturbed[offset + 2] !== baseline[offset + 2]
    if (Math.hypot(x, y) > 0.32) assert.equal(differs, false)
    else if (differs) changed++
  }
  assert.ok(changed > 0)
})

test('impact at equal energy changes more pixels with a larger channel delta than hover', () => {
  const texture = new Uint8ClampedArray(128 * 64 * 4)
  core.fillTexturePixels(texture, 128, 64, 0x706C616E)
  const map = core.createSphereMap({ width: 64, height: 56, sourceWidth: 128, sourceHeight: 64, equatorRadians: -10 * Math.PI / 180 })
  const baseline = new Uint8ClampedArray(64 * 56 * 4)
  const hover = new Uint8ClampedArray(baseline.length)
  const impact = new Uint8ClampedArray(baseline.length)
  core.renderProjectedFrame(texture, 128, map, 0.07, baseline)
  hover.set(baseline)
  impact.set(baseline)
  core.applyLocalizedGasDisplacement(texture, 128, 64, map, 0.07, {
    hoverX: 0,
    hoverY: 0,
    hoverEnergy: 1,
    impactX: 0,
    impactY: 0,
    impactEnergy: 0
  }, hover)
  core.applyLocalizedGasDisplacement(texture, 128, 64, map, 0.07, {
    hoverX: 0,
    hoverY: 0,
    hoverEnergy: 0,
    impactX: 0,
    impactY: 0,
    impactEnergy: 1
  }, impact)

  let hoverChanged = 0
  let hoverDelta = 0
  let impactChanged = 0
  let impactDelta = 0
  for (let offset = 0; offset < baseline.length; offset += 4) {
    const hoverPixelDelta = Math.abs(hover[offset] - baseline[offset]) +
      Math.abs(hover[offset + 1] - baseline[offset + 1]) +
      Math.abs(hover[offset + 2] - baseline[offset + 2])
    const impactPixelDelta = Math.abs(impact[offset] - baseline[offset]) +
      Math.abs(impact[offset + 1] - baseline[offset + 1]) +
      Math.abs(impact[offset + 2] - baseline[offset + 2])
    if (hoverPixelDelta > 0) hoverChanged++
    if (impactPixelDelta > 0) impactChanged++
    hoverDelta += hoverPixelDelta
    impactDelta += impactPixelDelta
  }
  assert.ok(impactChanged > hoverChanged, { hoverChanged, impactChanged })
  assert.ok(impactDelta > hoverDelta, { hoverDelta, impactDelta })
})

test('far-separated localized effects do not read projection lookups in the inactive gap', () => {
  const width = 32
  const height = 16
  const leftPixel = 8 * width + 4
  const rightPixel = 8 * width + 24
  const lookupStorage = new Uint32Array(width * height)
  lookupStorage[leftPixel] = 1
  lookupStorage[rightPixel] = 2
  let gapReads = 0
  const projectionIndexByPixel = new Proxy(lookupStorage, {
    get (target, property) {
      const pixel = typeof property === 'string' ? Number(property) : NaN
      if (Number.isInteger(pixel)) {
        const x = pixel % width
        if (x >= 9 && x <= 18) gapReads++
      }
      return target[property]
    }
  })
  const map = {
    width,
    height,
    visibleCount: 2,
    projectionIndexByPixel,
    targetOffsets: new Uint32Array([leftPixel * 4, rightPixel * 4]),
    sourceRows: new Uint16Array([2, 2]),
    baseSourceX: new Float32Array([2, 2]),
    speedFactors: new Float32Array([0, 0]),
    limbCoverage: new Uint8Array([255, 255])
  }
  const texture = new Uint8ClampedArray(4 * 4 * 4)
  core.fillTexturePixels(texture, 4, 4, 0x706C616E)
  const output = new Uint8ClampedArray(width * height * 4)

  assert.equal(core.applyLocalizedGasDisplacement(texture, 4, 4, map, 0, {
    hoverX: -0.8,
    hoverY: 0,
    hoverEnergy: 1,
    impactX: 0.8,
    impactY: 0,
    impactEnergy: 1
  }, output), output)
  assert.equal(gapReads, 0)
})

test('localized gas displacement wraps longitude and clamps latitude at texture poles', () => {
  const texture = new Uint8ClampedArray([
    0, 0, 0, 255, 10, 10, 10, 255, 20, 20, 20, 255, 30, 30, 30, 255,
    100, 100, 100, 255, 110, 110, 110, 255, 120, 120, 120, 255, 130, 130, 130, 255,
    200, 200, 200, 255, 210, 210, 210, 255, 220, 220, 220, 255, 230, 230, 230, 255
  ])
  const projectionIndexByPixel = new Uint32Array(8 * 8)
  const seamPixel = 3 * 8 + 4
  const polePixel = 4 * 8 + 5
  projectionIndexByPixel[seamPixel] = 1
  projectionIndexByPixel[polePixel] = 2
  const map = {
    width: 8,
    height: 8,
    visibleCount: 2,
    projectionIndexByPixel,
    targetOffsets: new Uint32Array([seamPixel * 4, polePixel * 4]),
    sourceRows: new Uint16Array([1, 2]),
    baseSourceX: new Float32Array([3.5, 1]),
    speedFactors: new Float32Array([0, 0]),
    limbCoverage: new Uint8Array([255, 255])
  }
  const output = new Uint8ClampedArray(8 * 8 * 4).fill(77)
  const distance = 0.25
  const normalizedDistance = distance / 0.56
  const falloff = 1 - normalizedDistance * normalizedDistance * (3 - 2 * normalizedDistance)
  const shift = falloff * 6
  core.applyLocalizedGasDisplacement(texture, 4, 3, map, 0, {
    hoverX: 0.125,
    hoverY: 0.125,
    hoverEnergy: 0,
    impactX: 0.125,
    impactY: 0.125,
    impactEnergy: 1
  }, output)

  const wrappedExpected = new Uint8ClampedArray([core.sampleTextureChannel(texture, 4, 3, 3.5 + shift, 1, 0)])[0]
  assert.equal(output[seamPixel * 4], wrappedExpected)
  assert.equal(output[polePixel * 4], 210)
  assert.equal(output[seamPixel * 4 + 3], 77)
  assert.equal(output[polePixel * 4 + 3], 77)
})

test('localized gas displacement with zero energy returns the same buffer unchanged', () => {
  const texture = new Uint8ClampedArray(16 * 8 * 4)
  core.fillTexturePixels(texture, 16, 8, 0x706C616E)
  const map = core.createSphereMap({ width: 8, height: 8, sourceWidth: 16, sourceHeight: 8, equatorRadians: 0 })
  const output = new Uint8ClampedArray(8 * 8 * 4)
  core.renderProjectedFrame(texture, 16, map, 0.07, output)
  const baseline = Uint8ClampedArray.from(output)
  assert.equal(core.applyLocalizedGasDisplacement(texture, 16, 8, map, 0.07, {
    hoverX: -0.25,
    hoverY: 0.25,
    hoverEnergy: 0,
    impactX: 0.25,
    impactY: -0.25,
    impactEnergy: 0
  }, output), output)
  assert.deepEqual(output, baseline)
})

test('projected redraw interpolates, wraps, applies speed, and only writes mapped RGBA bytes', () => {
  const texture = new Uint8ClampedArray([
    0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150,
    160, 170, 180, 190, 200, 210, 220, 230, 240, 250, 251, 252, 20, 30, 40, 50
  ])
  const map = {
    visibleCount: 3,
    targetOffsets: new Uint32Array([4, 16, 28]),
    sourceRows: new Uint16Array([0, 0, 1]),
    baseSourceX: new Float32Array([0.25, 3.75, 1]),
    speedFactors: new Float32Array([0.5, 0, 0.25]),
    limbCoverage: new Uint8Array([200, 75, 255])
  }
  const output = new Uint8ClampedArray(32)
  assert.equal(core.renderProjectedFrame(texture, 4, map, 0, output), output)
  assert.deepEqual(Array.from(output.slice(4, 8)), [10, 20, 30, 200])
  assert.deepEqual(Array.from(output.slice(16, 20)), [30, 40, 50, 75])
  assert.deepEqual(Array.from(output.slice(28, 32)), [200, 210, 220, 255])
  for (const offset of [0, 8, 12, 20, 24]) assert.deepEqual(Array.from(output.slice(offset, offset + 4)), [0, 0, 0, 0])

  assert.equal(core.renderProjectedFrame(texture, 4, map, core.TAU, output), output)
  assert.deepEqual(Array.from(output.slice(4, 8)), [90, 100, 110, 200])
  assert.deepEqual(Array.from(output.slice(16, 20)), [30, 40, 50, 75])
  assert.deepEqual(Array.from(output.slice(28, 32)), [240, 250, 251, 255])

  const sentinel = new Uint8ClampedArray(32).fill(173)
  assert.equal(core.renderProjectedFrame(texture, 4, map, core.TAU, sentinel), sentinel)
  assert.deepEqual(Array.from(sentinel.slice(4, 8)), [90, 100, 110, 200])
  assert.deepEqual(Array.from(sentinel.slice(16, 20)), [30, 40, 50, 75])
  assert.deepEqual(Array.from(sentinel.slice(28, 32)), [240, 250, 251, 255])
  for (const offset of [0, 8, 12, 20, 24]) assert.deepEqual(Array.from(sentinel.slice(offset, offset + 4)), [173, 173, 173, 173])
})

test('texture sampler bilinearly interpolates distinct channels, wraps, and clamps vertical rows', () => {
  const pixels = new Uint8ClampedArray([
    0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110,
    120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230
  ])
  assert.equal(core.sampleTextureChannel(pixels, 3, 2, 0.25, 0.5, 0), 70)
  assert.equal(core.sampleTextureChannel(pixels, 3, 2, 0.25, 0.5, 2), 90)
  assert.equal(core.sampleTextureChannel(pixels, 3, 2, 2.5, 0.5, 0), 100)
  assert.equal(core.sampleTextureChannel(pixels, 3, 2, -0.5, 0.5, 3), 130)
  assert.equal(core.sampleTextureChannel(pixels, 3, 2, 1.5, -9, 1), 70)
  assert.equal(core.sampleTextureChannel(pixels, 3, 2, 1.5, 9, 1), 190)
})

test('projected hot loop contains no allocation or DOM work', () => {
  const source = require('node:fs').readFileSync(modulePath, 'utf8')
  const body = source.match(/function renderProjectedFrame[\s\S]*?\n  }/)?.[0] || ''
  assert.ok(body)
  assert.doesNotMatch(body, /\bnew\s+|Array\.|Object\.|getContext|getComputedStyle|querySelector|createElement|createImageData/)
})

test('localized gas displacement hot loop contains no allocation, Canvas, or DOM work', () => {
  const source = require('node:fs').readFileSync(modulePath, 'utf8')
  const body = source.match(/function applyLocalizedGasDisplacement[\s\S]*?\n  }/)?.[0] || ''
  assert.ok(body)
  assert.doesNotMatch(body, /\bnew\s+|\b(?:Array|Object)\s*\(|Array\.|Object\.|getContext|getComputedStyle|querySelector|createElement|createImageData/)
})

test('browser UMD export exposes the same frozen core API as CommonJS', () => {
  const fs = require('node:fs')
  const vm = require('node:vm')
  const source = fs.readFileSync(modulePath, 'utf8')
  const window = {}
  vm.runInNewContext(source, { window, globalThis: window, Math, Object, Number, Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray, Float32Array, Float64Array, TypeError })
  assert.deepEqual(Object.keys(window.FluidPlanetCore).sort(), Object.keys(core).sort())
  assert.equal(typeof window.FluidPlanetCore.applyLocalizedGasDisplacement, 'function')
  assert.ok(Object.isFrozen(core))
  assert.ok(Object.isFrozen(window.FluidPlanetCore))
})
