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
