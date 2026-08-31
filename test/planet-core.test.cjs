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

test('fixed-seed mineral texture is deterministic, opaque, detailed, warm/cool, and horizontally periodic', () => {
  const width = 64
  const height = 32
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
  let cool = 0
  for (let offset = 0; offset < first.length; offset += 4) {
    colors.add(`${first[offset]},${first[offset + 1]},${first[offset + 2]}`)
    if (first[offset] > first[offset + 2] * 1.08) warm++
    if (first[offset + 2] > first[offset] * 1.08) cool++
    assert.equal(first[offset + 3], 255)
  }
  assert.ok(colors.size > 180, colors.size)
  assert.ok(warm > width * height * 0.12, warm)
  assert.ok(cool > width * height * 0.12, cool)

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
  assert.ok(seamMean <= interiorMean * 2.5 + 1, `${seamMean} > ${interiorMean}`)

  for (const channel of [0, 1, 2, 3]) {
    assert.equal(
      core.sampleTextureChannel(first, width, height, -0.25, 13.4, channel),
      core.sampleTextureChannel(first, width, height, width - 0.25, 13.4, channel)
    )
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

test('projected hot loop contains no allocation or DOM work', () => {
  const source = require('node:fs').readFileSync(modulePath, 'utf8')
  const body = source.match(/function renderProjectedFrame[\s\S]*?\n  }/)?.[0] || ''
  assert.ok(body)
  assert.doesNotMatch(body, /\bnew\s+|Array\.|Object\.|getContext|getComputedStyle|querySelector|createElement|createImageData/)
})

test('browser UMD export exposes the same frozen core API as CommonJS', () => {
  const fs = require('node:fs')
  const vm = require('node:vm')
  const source = fs.readFileSync(modulePath, 'utf8')
  const window = {}
  vm.runInNewContext(source, { window, globalThis: window, Math, Object, Number, Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray, Float32Array, Float64Array, TypeError })
  assert.deepEqual(Object.keys(window.FluidPlanetCore).sort(), Object.keys(core).sort())
  assert.ok(Object.isFrozen(core))
  assert.ok(Object.isFrozen(window.FluidPlanetCore))
})
