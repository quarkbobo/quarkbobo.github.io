const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const corePath = path.resolve(__dirname, '../themes/fluid-particle/source/js/particle-core.js')
const Core = require(corePath)

test('seeded particle creation is deterministic and respects layer ratios', () => {
  const make = () => {
    const rng = Core.createRng(42)
    return Array.from({ length: 1000 }, (_, i) => Core.createParticle(i, rng))
  }
  const a = make()
  const b = make()

  assert.deepEqual(a, b)
  const counts = a.reduce((out, particle) => {
    out[particle.layer]++
    return out
  }, { dust: 0, glint: 0, streak: 0 })
  assert.ok(counts.dust >= 820 && counts.dust <= 860, JSON.stringify(counts))
  assert.ok(counts.glint >= 110 && counts.glint <= 150, JSON.stringify(counts))
  assert.ok(counts.streak >= 20 && counts.streak <= 40, JSON.stringify(counts))

  for (const particle of a) {
    const lifetimeRange = {
      dust: [12, 25],
      glint: [6, 11],
      streak: [1.8, 3.4]
    }[particle.layer]
    assert.ok(particle.lifetime >= lifetimeRange[0] && particle.lifetime <= lifetimeRange[1])
    assert.ok(particle.band === 0 || particle.band === 1 || particle.band === 2)
  }
})

test('cubicBezier evaluates a hand-checked cubic curve', () => {
  assert.equal(Core.cubicBezier(0, 0, 0, 8, 0), 0)
  assert.equal(Core.cubicBezier(0, 0, 0, 8, 0.5), 1)
  assert.equal(Core.cubicBezier(0, 0, 0, 8, 1), 8)
})

test('delta-time phase advance is frame-rate independent', () => {
  const at60 = Array.from({ length: 60 }).reduce(phase => Core.advancePhase(phase, 1 / 60, 10), 0)
  const at30 = Array.from({ length: 30 }).reduce(phase => Core.advancePhase(phase, 1 / 30, 10), 0)

  assert.ok(Math.abs(at60 - at30) < 1e-12)
  assert.ok(Math.abs(Core.advancePhase(0.95, 1, 10) - 0.05) < 1e-12)
})

test('all orbit bands move from lower-left toward the Saturn region', () => {
  for (const band of [0, 1, 2]) {
    const particle = { band, jitter: 0, wave: 0 }
    const start = Core.positionParticle(particle, 0.05, { width: 1280, height: 592 }, { x: 0, y: 0 })
    const middle = Core.positionParticle(particle, 0.5, { width: 1280, height: 592 }, { x: 0, y: 0 })
    const end = Core.positionParticle(particle, 0.95, { width: 1280, height: 592 }, { x: 0, y: 0 })

    assert.ok(end.x > middle.x && middle.x > start.x, `band ${band} x direction`)
    assert.ok(end.y < middle.y && middle.y < start.y, `band ${band} y direction`)
  }
})

test('pointer displacement is clamped to eight pixels', () => {
  const particle = { band: 1, jitter: 0, wave: 0 }
  const viewport = { width: 1280, height: 592 }
  const base = Core.positionParticle(particle, 0.5, viewport, { x: 0, y: 0 })
  const moved = Core.positionParticle(particle, 0.5, viewport, { x: 99, y: 99 })

  assert.ok(Math.hypot(moved.x - base.x, moved.y - base.y) <= 8.01)
  assert.ok(moved.x > base.x && moved.y > base.y)
})

test('edge fade prevents respawn flashes', () => {
  assert.equal(Core.edgeFade(0), 0)
  assert.equal(Core.edgeFade(1), 0)
  assert.ok(Core.edgeFade(0.02) < Core.edgeFade(0.06))
  assert.ok(Core.edgeFade(0.94) > Core.edgeFade(0.98))
  assert.ok(Core.edgeFade(0.5) > 0.99)
})

test('quality changes only after a complete 120-frame window and keeps hysteresis', () => {
  const feed = (state, frameMs, count) => {
    let next = state
    for (let i = 0; i < count; i++) next = Core.nextQuality(next, frameMs)
    return next
  }

  const initial = { level: 2, frameTimes: [] }
  const beforeSlowWindow = feed(initial, 20, 119)
  assert.equal(beforeSlowWindow.level, 2)
  assert.equal(beforeSlowWindow.frameTimes.length, 119)

  const lowered = Core.nextQuality(beforeSlowWindow, 20)
  assert.equal(lowered.level, 1)
  assert.deepEqual(lowered.frameTimes, [])

  const hysteresis = feed(lowered, 16.5, 240)
  assert.equal(hysteresis.level, 1)

  const exactUpperBoundary = feed({ level: 2, frameTimes: [] }, 18.2, 120)
  assert.equal(exactUpperBoundary.level, 2)
  const exactLowerBoundary = feed({ level: 1, frameTimes: [] }, 15.5, 120)
  assert.equal(exactLowerBoundary.level, 1)

  const justAboveUpper = feed({ level: 2, frameTimes: [] }, 18.2000000005, 120)
  assert.equal(justAboveUpper.level, 1)
  const justBelowLower = feed({ level: 1, frameTimes: [] }, 15.4999999995, 120)
  assert.equal(justBelowLower.level, 2)

  const restored = feed({ level: 1, frameTimes: [] }, 15, 120)
  assert.equal(restored.level, 2)
  assert.deepEqual(restored.frameTimes, [])
})

test('browser script exposes the same pure API without CommonJS', () => {
  const source = fs.readFileSync(corePath, 'utf8')
  const context = { window: {} }
  vm.runInNewContext(source, context)

  assert.deepEqual(
    Object.keys(context.window.FluidParticleCore).sort(),
    ['advancePhase', 'createParticle', 'createRng', 'cubicBezier', 'edgeFade', 'nextQuality', 'positionParticle']
  )
})
