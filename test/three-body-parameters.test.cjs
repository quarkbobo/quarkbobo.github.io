const test = require('node:test')
const assert = require('node:assert/strict')
const core = () => import('../themes/fluid-particle/source/js/three-body-core.mjs')

test('editable boundary is validated atomically and cannot teleport a body when shrinking', async () => {
  const c = await core(), s = c.makeSystem(), before = structuredClone(s)
  for (const boundary of [NaN, Infinity, 5, 41, 6]) {
    assert.throws(() => c.setParameters(s, { boundary, G: 2 }))
    assert.deepEqual(s, before)
  }
  c.setParameters(s, { boundary: 24 })
  assert.equal(s.boundary, 24)
  assert.deepEqual(s.bodies, before.bodies)
  s.bodies = [{ ...s.bodies[3], position: [23.90, 0, 0], velocity: [10, 0, 0] }]
  c.step(s, 1 / 240)
  assert.equal(s.error, null)
  assert.ok(s.bodies[0].position[0] <= 24 - s.bodies[0].radius)
  assert.ok(s.bodies[0].velocity[0] < 0)
})

test('softening is a physical parameter and changing it preserves the current state', async () => {
  const c = await core(), s = c.makeSystem(), before = structuredClone(s.bodies)
  const a = s.bodies[0], b = s.bodies[3]
  const original = Math.hypot(...c.pairForce(a, b, s.G, s.softening))
  c.setParameters(s, { softening: 0.2 })
  assert.deepEqual(s.bodies, before)
  assert.ok(Math.hypot(...c.pairForce(a, b, s.G, s.softening)) < original)
})

test('a mode switch cannot fold an escaped body into an undersized boundary', async () => {
  const c = await core(), s = c.makeSystem()
  c.setParameters(s, { mode: 2 })
  c.updateBody(s, 'star-b', { position: [30, 0, 0] })
  const before = structuredClone(s)
  assert.throws(() => c.setParameters(s, { mode: 1 }))
  assert.deepEqual(s, before)
  c.setParameters(s, { mode: 1, boundary: 35 })
  assert.deepEqual(s.bodies, before.bodies)
})

test('natural escape beyond editable initial values does not block unrelated parameter edits', async () => {
  const c = await core(), s = c.makeSystem()
  c.setParameters(s, { mode: 2 })
  c.updateBody(s, 'star-a', { position: [100, 0, 0], velocity: [20, 0, 0] })
  c.step(s, c.RULES.DT)
  assert.ok(s.bodies[0].position[0] > 100)
  const before = structuredClone(s.bodies)
  c.updateBody(s, 'star-a', { mass: 1.5 })
  c.setParameters(s, { softening: 0.02 })
  assert.deepEqual(s.bodies[0].position, before[0].position)
  assert.deepEqual(s.bodies[0].velocity, before[0].velocity)
  assert.throws(() => c.updateBody(s, 'star-a', { position: [101, 0, 0] }))
})

test('belt accepts fixed-step clock roundoff at late epochs but still rejects two steps', async () => {
  const c = await core(), overlay = await import('../themes/fluid-particle/source/js/three-body-overlays.mjs')
  for (const epoch of [16384, 32768]) {
    const s = c.makeSystem(); s.time = epoch
    const belt = overlay.makeBelt(s)
    for (let i = 0; i < 8; i++) {
      const before = structuredClone(s)
      c.step(s, c.RULES.DT)
      overlay.advanceBelt(belt, before, s, s.time - before.time)
      assert.equal(belt.error, null)
    }
    const before = structuredClone(s)
    c.step(s, 2 * c.RULES.DT)
    overlay.advanceBelt(belt, before, s, s.time - before.time)
    assert.ok(belt.error)
  }
})
