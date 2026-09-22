const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const target = path.resolve(__dirname, '../themes/fluid-particle/source/js/three-body-overlays.mjs')
async function load () { assert.ok(fs.existsSync(target), 'overlay implementation exists'); return import(pathToFileURL(target)) }
const DT = 1 / 240
const near = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`)
const body = (id, mass, position, velocity = [0, 0, 0], radius = 0.01) => ({ id, mass, position, velocity, radius, active: true })
const system = bodies => ({ bodies, G: 1, softening: 0.01, time: 0, mode: 2 })
const after = (s, h = DT) => ({ ...structuredClone(s), time: s.time + h })
const norm = p => Math.hypot(...p)
const particles = p => ({ particles: Array.from({ length: 64 }, () => structuredClone(p)), error: null })
const finite = b => b.particles.every(p => [...p.position, ...p.velocity].every(Number.isFinite))

test('L1-L3 solve the normalized CR3BP force balance for equal and extreme mass ratios', async () => {
  const { lagrangePoints } = await load()
  for (const mu of [0.5, 0.1, 0.000003]) {
    const s = system([body('a', 1 - mu, [-mu, 0, 0]), body('b', mu, [1 - mu, 0, 0], [0, 1, 0])])
    const points = lagrangePoints(s, 'a', 'b')
    assert.deepEqual(points.map(p => p.id), ['L1', 'L2', 'L3', 'L4', 'L5'])
    for (const p of points.slice(0, 3)) {
      const x = p.position[0]
      const residual = x - (1 - mu) * (x + mu) / Math.abs(x + mu) ** 3 - mu * (x - 1 + mu) / Math.abs(x - 1 + mu) ** 3
      near(residual, 0, 2e-10); near(p.position[1], 0); near(p.position[2], 0)
    }
    assert.ok(points[0].position[0] > -mu && points[0].position[0] < 1 - mu)
    assert.ok(points[1].position[0] > 1 - mu && points[2].position[0] < -mu)
    near(points[3].position[0], 0.5 - mu); near(points[3].position[1], Math.sqrt(3) / 2)
    near(points[4].position[1], -Math.sqrt(3) / 2)
  }
})

test('L4/L5 follow the instantaneous three-dimensional orbital plane and input order does not change the heavier primary', async () => {
  const { lagrangePoints } = await load()
  const s = system([body('a', 4, [2, 3, 4]), body('b', 1, [2, 3, 6], [-0.3, 0, 0])])
  const before = structuredClone(s), points = lagrangePoints(s, 'a', 'b')
  assert.deepEqual(lagrangePoints(s, 'b', 'a'), points)
  for (const [i, sign] of [[3, -1], [4, 1]]) {
    near(points[i].position[0], 2 + sign * Math.sqrt(3)); near(points[i].position[1], 3); near(points[i].position[2], 5)
    for (const b of s.bodies) near(norm(points[i].position.map((x, j) => x - b.position[j])), 2)
  }
  s.bodies[1].mass = 0.1
  assert.notDeepEqual(lagrangePoints(s, 'a', 'b')[0], points[0])
  s.bodies[1].mass = 1
  assert.deepEqual(s, before)
})

test('degenerate or invalid Lagrange pairs return no markers; radial motion has a finite deterministic fallback plane', async () => {
  const { lagrangePoints } = await load()
  const s = system([body('a', 1, [0, 0, 0]), body('b', 0.1, [0, 0, 0])])
  assert.deepEqual(lagrangePoints(s, 'a', 'b'), [])
  assert.deepEqual(lagrangePoints(s, 'a', 'missing'), [])
  assert.deepEqual(lagrangePoints(s, 'a', 'a'), [])
  s.bodies[1].position = [0, 0, 2]; s.bodies[1].velocity = [0, 0, 1]
  const p = lagrangePoints(s, 'a', 'b')
  assert.equal(p.length, 5); assert.ok(p.every(point => point.position.every(Number.isFinite)))
  assert.deepEqual(lagrangePoints(s, 'a', 'b'), p)
  s.bodies[0].mass = NaN
  assert.deepEqual(lagrangePoints(s, 'a', 'b'), [])
})

test('seeded belt initialization is reproducible, bounded, inclined, and relative to the four-body barycenter', async () => {
  const { makeBelt } = await load()
  const s = system([body('a', 1, [3, 1, 2], [1, 2, 3]), body('b', 1, [1, 1, 2], [1, 2, 3]), body('c', 1, [2, 2, 2], [1, 2, 3]), body('planet', 1, [2, 0, 2], [1, 2, 3])])
  const before = structuredClone(s), a = makeBelt(s), b = makeBelt(s)
  assert.equal(a.error, null); assert.equal(a.particles.length, 128); assert.deepEqual(a, b)
  assert.notDeepEqual(makeBelt(s, { seed: 7302 }).particles, a.particles)
  assert.notEqual(a.particles[0].position, b.particles[0].position)
  for (const p of a.particles) {
    const r = p.position.map((x, i) => x - [2, 1, 2][i]), v = p.velocity.map((x, i) => x - [1, 2, 3][i])
    assert.ok(norm(r) >= 14 && norm(r) <= 24); assert.equal(p.active, true)
    near(r.reduce((sum, x, i) => sum + x * v[i], 0), 0, 1e-10)
    assert.ok(Math.abs(r[2]) / norm(r) <= Math.sin(12 * Math.PI / 180) + 1e-12)
  }
  assert.ok(a.particles.some(p => Math.abs(p.position[2] - 2) > 0.01))
  assert.deepEqual(s, before)
})

test('belt Verlet uses every active source, real softening and interpolated moving positions without back reaction', async () => {
  const { advanceBelt } = await load(), h = 0.0001
  const s = system([body('a', 1, [0, 0, 0]), body('b', 2, [1, 0, 0]), body('c', 3, [0, 1, 0]), body('planet', 4, [0, 0, 1])])
  s.softening = 0.2; s.G = 1.4
  const end = after(s, h); end.bodies.forEach(b => { b.position[0] += 0.2 })
  const original = structuredClone([s, end]), p = { position: [15, 1, 2], velocity: [0, 0, 0], active: true }, belt = particles(p)
  const acceleration = (position, sources) => [0, 1, 2].map(axis => sources.reduce((sum, b) => {
    const d = b.position.map((x, i) => x - position[i])
    return sum + s.G * b.mass * d[axis] / (d.reduce((q, x) => q + x * x, 0) + s.softening ** 2) ** 1.5
  }, 0))
  const a0 = acceleration(p.position, s.bodies), expected = p.position.map((x, i) => x + a0[i] * h * h / 2), a1 = acceleration(expected, end.bodies)
  advanceBelt(belt, s, end, h)
  assert.equal(belt.error, null)
  for (let i = 0; i < 3; i++) { near(belt.particles[0].position[i], expected[i], 1e-13); near(belt.particles[0].velocity[i], (a0[i] + a1[i]) * h / 2, 1e-13) }
  assert.deepEqual([s, end], original)
})

test('belt trajectories evolve under forces, stay finite and are never reflected by mode-one box walls', async () => {
  const { makeBelt, advanceBelt } = await load()
  const s = system([body('a', 1, [-3, 0, 0]), body('b', 2, [2, 1, 0]), body('c', 1, [0, -2, 1]), body('planet', 0.1, [1, 2, 0])])
  s.mode = 1; s.boundary = 12
  const belt = makeBelt(s, { count: 64, inclination: 0 }), initial = structuredClone(belt.particles)
  for (let i = 0; i < 200; i++) { const end = after(s); advanceBelt(belt, s, end, DT); s.time = end.time }
  assert.equal(belt.error, null); assert.ok(finite(belt))
  assert.notDeepEqual(belt.particles, initial)
  assert.ok(belt.particles.some((p, i) => Math.abs(norm(p.position) - norm(initial[i].position)) > 1e-4), 'not a prescribed rigid circular orbit')
  assert.ok(belt.particles.some(p => p.position.some(x => Math.abs(x) > 12)), 'belt is not clamped/reflected at the main-system boundary')
})

test('swept particle and moving-star crossings stop only the struck particles at first contact', async () => {
  const { advanceBelt } = await load()
  for (const movingStar of [false, true]) {
    const s = system([body('a', 0.000001, movingStar ? [-1, 0, 0] : [0, 0, 0], [0, 0, 0], 0.1)])
    const end = after(s); if (movingStar) end.bodies[0].position = [1, 0, 0]
    const belt = particles({ position: movingStar ? [0, 0, 0] : [-1, 0, 0], velocity: movingStar ? [0, 0, 0] : [480, 0, 0], active: true })
    belt.particles[1].position[1] = 2
    advanceBelt(belt, s, end, DT)
    assert.equal(belt.error, null); assert.equal(belt.particles[0].active, false); assert.deepEqual(belt.particles[0].velocity, [0, 0, 0])
    assert.equal(belt.particles[1].active, true)
    if (!movingStar) near(belt.particles[0].position[0], -0.1, 1e-9)
    const stopped = structuredClone(belt.particles[0])
    advanceBelt(belt, end, after(end), DT)
    assert.deepEqual(belt.particles[0], stopped)
  }
})

test('invalid belt options return an error without particles or changes to the sources', async () => {
  const { makeBelt } = await load(), s = system([body('a', 1, [0, 0, 0])]), before = structuredClone(s)
  for (const options of [{ count: 63 }, { count: 257 }, { count: 64.2 }, { inner: 5 }, { outer: 61 }, { inner: 24, outer: 14 }, { inner: 14, outer: 14 }, { inclination: -1 }, { inclination: 61 }, { seed: NaN }, { outer: Infinity }]) {
    const belt = makeBelt(s, options)
    assert.ok(belt.error); assert.deepEqual(belt.particles, [])
  }
  assert.deepEqual(s, before)
})

test('invalid elapsed times and non-finite source state latch a belt error without advancing particles', async () => {
  const { makeBelt, advanceBelt } = await load(), s = system([body('a', 1, [0, 0, 0])])
  for (const h of [NaN, Infinity, -DT, DT * 2]) {
    const belt = makeBelt(s), initial = structuredClone(belt.particles)
    advanceBelt(belt, s, after(s), h)
    assert.ok(belt.error); assert.deepEqual(belt.particles, initial)
    advanceBelt(belt, s, after(s), DT)
    assert.ok(belt.error); assert.deepEqual(belt.particles, initial)
  }
  const belt = makeBelt(s), initial = structuredClone(belt.particles), end = after(s)
  end.bodies[0].position[0] = NaN
  advanceBelt(belt, s, end, DT)
  assert.ok(belt.error); assert.deepEqual(belt.particles, initial)
})

test('near-source integration budget fails safely rather than catching up or corrupting the last valid belt', async () => {
  const { advanceBelt } = await load()
  const s = system([body('a', 1, [0, 0, 0], [0, 0, 0], 0.000001)]); s.softening = 0
  const belt = particles({ position: [0.0001, 0, 0], velocity: [0, 100, 0], active: true }), initial = structuredClone(belt.particles)
  advanceBelt(belt, s, after(s), DT)
  assert.match(belt.error, /预算/); assert.deepEqual(belt.particles, initial); assert.ok(finite(belt))
})
