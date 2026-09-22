const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const modulePath = path.resolve(__dirname, '../themes/fluid-particle/source/js/three-body-core.mjs')
async function load () {
  assert.ok(fs.existsSync(modulePath), 'the three-body physics implementation must exist')
  return import(pathToFileURL(modulePath))
}
const near = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`)
const body = (id, position, velocity = [0, 0, 0], mass = 1, radius = 0.01, luminosity = 1) => ({ id, name: id, position, velocity, mass, radius, luminosity, active: true })
const environment = (flux, suns = 1) => ({ flux, suns, collision: null })
function isolated (core, bodies) {
  return { ...core.makeSystem(), bodies, mode: 2, softening: 0 }
}

test('all three presets are independent reproducible four-body initial conditions with genuine inertial motion', async () => {
  const c = await load()
  for (const preset of ['balanced', 'chaotic', 'triple']) {
    const a = c.makeSystem(preset), b = c.makeSystem(preset)
    assert.deepEqual(a, b)
    assert.deepEqual(a.bodies.map(b => b.id), ['star-a', 'star-b', 'star-c', 'planet'])
    assert.notEqual(a.bodies[0].position, b.bodies[0].position)
    c.step(a, 1 / 60)
    for (let i = 0; i < 4; i++) assert.notDeepEqual(a.bodies[i].position, b.bodies[i].position)
    assert.equal(a.error, null)
  }
  assert.throws(() => c.makeSystem('unknown'))
})

test('Newtonian forces have the independently calculated magnitude, inverse-square falloff and equal opposite reaction', async () => {
  const { pairForce } = await load()
  const a = body('star-a', [0, 0, 0], undefined, 2), b = body('star-b', [3, 4, 0], undefined, 3)
  const force = pairForce(a, b, 1, 0), reverse = pairForce(b, a, 1, 0)
  near(force[0], 0.144); near(force[1], 0.192); near(force[2], 0)
  force.forEach((value, i) => near(value, -reverse[i]))
  b.position = [6, 8, 0]
  near(Math.hypot(...pairForce(a, b, 1, 0)), 0.06)
  b.position = [0, 0, 0]
  assert.deepEqual(pairForce(a, b, 1, 0.01), [0, 0, 0])
})

test('four-body acceleration includes every active body and divides force by the receiving mass', async () => {
  const c = await load()
  const s = isolated(c, [body('star-a', [0, 0, 0], undefined, 2), body('star-b', [1, 0, 0]), body('star-c', [0, 1, 0]), body('planet', [0, 0, 1], undefined, 0.5)])
  assert.deepEqual(c.accelerations(s)[0], [1, 1, 0.5])
  s.bodies[3].active = false
  assert.deepEqual(c.accelerations(s)[0], [1, 1, 0])
})

test('fixed substeps give the same state for a speed-up batch and equal elapsed smaller frames', async () => {
  const c = await load(), a = c.makeSystem('chaotic'), b = c.makeSystem('chaotic')
  c.step(a, 1)
  for (let i = 0; i < 100; i++) c.step(b, 0.01)
  near(a.time, 1)
  for (let i = 0; i < 4; i++) for (let axis = 0; axis < 3; axis++) near(a.bodies[i].position[axis], b.bodies[i].position[axis], 1e-8)
  const s = c.makeSystem(), previous = structuredClone(s.bodies)
  c.step(s, 1 / 480)
  assert.deepEqual(s.bodies, previous)
  c.step(s, 1 / 480)
  near(s.time, 1 / 240)
})

test('velocity-Verlet preserves the reference circular binary energy over forty simulated years', async () => {
  const c = await load()
  const s = isolated(c, [body('star-a', [-1, 0, 0], [0, -0.5, 0]), body('star-b', [1, 0, 0], [0, 0.5, 0])])
  const initial = c.energy(s)
  near(initial, -0.25)
  for (let i = 0; i < 40; i++) c.step(s, 1)
  assert.equal(s.error, null)
  near(s.time, 40, 1e-8)
  assert.ok(Math.abs((c.energy(s) - initial) / initial) <= 0.001)
  for (let axis = 0; axis < 3; axis++) near(s.bodies[0].velocity[axis] + s.bodies[1].velocity[axis], 0)
})

test('bounded mode reflects overshoot and velocity on all three radius-adjusted walls; free mode does not', async () => {
  const c = await load(), p = body('planet', [11.75, -11.75, 11.75], [20, -20, 20], 0.001, 0.2, 0)
  const s = isolated(c, [structuredClone(p)]); s.mode = 1
  c.step(s, 1 / 120)
  s.bodies[0].position.forEach((v, i) => near(v, [11.683333333333334, -11.683333333333334, 11.683333333333334][i]))
  assert.deepEqual(s.bodies[0].velocity, [-20, 20, -20])
  const free = isolated(c, [p]); c.step(free, 1 / 120)
  assert.ok(free.bodies[0].position[0] > 11.8)
  assert.deepEqual(free.bodies[0].velocity, [20, -20, 20])
})

test('swept detection catches a fast planet crossing a star and emits exactly one collision', async () => {
  const c = await load()
  const s = isolated(c, [body('star-a', [0, 0, 0], [0, 0, 0], 0.000001, 0.001), body('planet', [-0.04, 0, 0], [20, 0, 0], 0.000001, 0.001, 0)])
  s.softening = 0.01
  c.step(s, 1 / 240)
  assert.equal(s.bodies[1].active, false)
  assert.ok(s.bodies[1].position[0] < 0, 'the planet stops at impact, not beyond the star')
  assert.equal(s.collisions.length, 1)
  assert.equal(s.collisions[0].type, 'planet-star')
  const impact = structuredClone(s.bodies[1])
  c.step(s, 1 / 60)
  assert.deepEqual(s.bodies[1], impact)
  assert.equal(s.collisions.length, 1)
  assert.ok(c.environment(s).collision)
  assert.equal(s.error, null)
})

test('star-star impact pauses free-space physics with a finite last valid state', async () => {
  const c = await load()
  const s = isolated(c, [body('star-a', [-0.04, 0, 0], [20, 0, 0], 0.000001, 0.001), body('star-b', [0, 0, 0], [0, 0, 0], 0.000001, 0.001)])
  s.softening = 0.01
  c.step(s, 1 / 240)
  assert.match(s.error, /恒星碰撞/)
  assert.equal(s.collisions[0].type, 'star-star')
  const saved = structuredClone(s)
  c.step(s, 1)
  assert.deepEqual(s, saved)
  assert.ok(s.bodies.every(b => [...b.position, ...b.velocity].every(Number.isFinite)))
})

test('parameter edits reject invalid numbers and ranges atomically and valid mass changes immediately affect gravity', async () => {
  const c = await load(), s = c.makeSystem(), before = structuredClone(s)
  for (const patch of [{ mass: 0 }, { mass: NaN }, { mass: 11 }, { position: [101, 0, 0] }, { position: [0, 0] }, { velocity: [0, Infinity, 0] }, { velocity: [0, 21, 0] }, { luminosity: -1 }, { luminosity: 21 }, { active: true, mass: -1 }]) {
    assert.throws(() => c.updateBody(s, 'star-a', patch))
    assert.deepEqual(s, before)
  }
  for (const patch of [{ G: 0 }, { G: Infinity }, { G: 6 }, { mode: 3 }, { softening: -1 }]) {
    assert.throws(() => c.setParameters(s, patch))
    assert.deepEqual(s, before)
  }
  const force = c.pairForce(s.bodies[0], s.bodies[3], 1, 0.01)
  c.updateBody(s, 'star-a', { mass: s.bodies[0].mass * 2 })
  c.pairForce(s.bodies[0], s.bodies[3], 1, 0.01).forEach((v, i) => near(v, force[i] * 2))
  c.setParameters(s, { G: 2, mode: 2 })
  assert.equal(s.G, 2); assert.equal(s.mode, 2)
})

test('invalid elapsed time and excess step budget cannot advance or corrupt the last valid body state', async () => {
  const c = await load()
  for (const delta of [NaN, Infinity, -1, 1000000]) {
    const s = c.makeSystem(), previous = structuredClone(s.bodies)
    c.step(s, delta)
    assert.ok(s.error)
    assert.equal(s.time, 0)
    assert.deepEqual(s.bodies, previous)
    assert.ok(s.bodies.every(b => [...b.position, ...b.velocity].every(Number.isFinite)))
  }
})

test('radiation uses physical inverse-square distance while the rotating surface normal selects visible suns', async () => {
  const c = await load()
  const s = isolated(c, [body('star-a', [2, 0, 0], undefined, 1, 0.1, 4), body('star-b', [-2, 0, 0], undefined, 1, 0.1, 4), body('star-c', [0, 2, 0], undefined, 1, 0.1, 0.2), body('planet', [0, 0, 0], undefined, 0.001, 0.05, 0)])
  near(c.environment(s).flux, 2.05)
  assert.deepEqual(c.environment(s).sunIds, ['star-a'])
  s.time = 10
  assert.deepEqual(c.environment(s).sunIds, ['star-b'])
  s.bodies[0].position = [4, 0, 0]
  near(c.environment(s).flux, 1.3)
})

test('stable era requires five continuous low-variation single-sun years and resets on unstable samples', async () => {
  const c = await load(), civ = c.createCivilization()
  c.evolveCivilization(civ, environment(1), 4.99, 4.99)
  assert.equal(civ.era, '乱纪元')
  c.evolveCivilization(civ, environment(1.05), 0.01, 5)
  assert.equal(civ.era, '恒纪元')
  c.evolveCivilization(civ, environment(1.5), 0.01, 5.01)
  assert.equal(civ.era, '乱纪元')
  c.evolveCivilization(civ, environment(1.5, 2), 5, 10.01)
  assert.equal(civ.era, '乱纪元')
  assert.equal(civ.dead, false)
})

test('thermal hysteresis needs five continuous danger years and clears only at its exit thresholds', async () => {
  const c = await load()
  for (const [entry, hold, exit, cause] of [[4.1, 3.7, 3.4, '过热'], [0.1, 0.14, 0.17, '严寒']]) {
    const civ = c.createCivilization()
    c.evolveCivilization(civ, environment(entry), 4, 4)
    c.evolveCivilization(civ, environment(exit), 1, 5)
    assert.equal(civ.dead, false)
    c.evolveCivilization(civ, environment(entry), 4, 9)
    assert.equal(c.evolveCivilization(civ, environment(hold), 0.99, 9.99), null)
    const death = c.evolveCivilization(civ, environment(hold), 0.01, 10)
    assert.equal(death.cause, cause)
    assert.equal(death.year, 2010)
  }
})

test('three visible suns kill once after two continuous years, death is latched, and only a new numbered civilization clears it', async () => {
  const c = await load(); let civ = c.createCivilization(7)
  c.evolveCivilization(civ, environment(1, 3), 1.99, 1.99)
  assert.equal(civ.dead, false)
  c.evolveCivilization(civ, environment(1, 2), 0.01, 2)
  c.evolveCivilization(civ, environment(1, 3), 1.99, 3.99)
  assert.equal(civ.dead, false)
  const record = c.evolveCivilization(civ, environment(1, 3), 0.01, 4)
  assert.equal(record.cause, '三日凌空'); assert.equal(record.number, 7)
  assert.equal(c.evolveCivilization(civ, environment(1), 20, 24), null)
  assert.equal(civ.dead, true); assert.equal(civ.history.length, 1)
  civ = c.resetCivilization(civ)
  assert.equal(civ.number, 8); assert.equal(civ.dead, false); assert.equal(civ.history.length, 1)
  for (let i = 0; i < 23; i++) {
    c.evolveCivilization(civ, { flux: 1, suns: 1, collision: { type: 'planet-star' } }, 0, i)
    civ = c.resetCivilization(civ)
  }
  assert.equal(civ.history.length, 20)
  assert.equal(civ.history.at(-1).cause, '行星碰撞')
})

test('the triple preset naturally produces a real two-year three-sun death while every star moves', async () => {
  const c = await load(), s = c.makeSystem('triple'), civ = c.createCivilization()
  const initial = structuredClone(s.bodies)
  for (let i = 0; i < 510 && !civ.dead; i++) {
    const previous = s.time
    c.step(s, 1 / 240)
    assert.equal(s.error, null)
    c.evolveCivilization(civ, c.environment(s), s.time - previous, s.time)
  }
  assert.equal(civ.reason, '三日凌空')
  assert.ok(s.time >= 2 && s.time < 2.1)
  assert.equal(s.collisions.length, 0)
  initial.slice(0, 3).forEach((star, i) => assert.notDeepEqual(s.bodies[i].position, star.position))
})

test('real-time world-space trails fade over eight seconds, do not share live position storage, and remain bounded', async () => {
  const c = await load(), trails = {}, bodies = [body('planet', [0, 0, 0])]
  c.sampleTrails(trails, bodies, 0)
  bodies[0].position[0] = 1
  near(trails.planet[0].position[0], 0)
  for (let i = 1; i <= 1200; i++) c.sampleTrails(trails, bodies, i / 60)
  assert.ok(trails.planet.length <= 512)
  assert.ok(trails.planet.every(point => point.time >= 12))
  const length = trails.planet.length
  c.sampleTrails(trails, bodies, 20)
  assert.equal(trails.planet.length, length)
  near(c.trailAlpha(0), 1); near(c.trailAlpha(8), 0)
  assert.ok(c.trailAlpha(3) > c.trailAlpha(6)); near(c.trailAlpha(20), 0)
})
