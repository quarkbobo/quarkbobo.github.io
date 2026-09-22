// Simulation years and foreground-running seconds are deliberately separate clocks.
export const RULES = Object.freeze({
  DT: 1 / 240, MAX_SUBSTEPS: 4096, START_YEAR: 2000,
  STABLE_MIN: 0.5, STABLE_MAX: 2, STABLE_YEARS: 5, STABLE_VARIATION: 0.1,
  HOT_ENTER: 4, HOT_EXIT: 3.5, COLD_ENTER: 0.12, COLD_EXIT: 0.16,
  THERMAL_DEATH_YEARS: 5, TRIPLE_DEATH_YEARS: 2,
  SUN_THRESHOLD: 0.08, ROTATION_YEARS: 20, TRAIL_SECONDS: 8, TRAIL_CAPACITY: 512
})

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const subtract = (a, b) => a.map((v, i) => v - b[i])
const finiteVector = vector => Array.isArray(vector) && vector.length === 3 && vector.every(Number.isFinite)
function range (value, min, max, label) {
  if (!Number.isFinite(value) || value < min || value > max) throw new RangeError(`${label}须在 ${min}—${max} 之间`)
}
function validateBody (body, editable = false) {
  range(body.mass, 0.000001, 10, '质量')
  range(body.luminosity, 0, 20, '光度')
  range(body.radius, 0.000001, 10, '半径')
  for (const [key, limit] of [['position', 100], ['velocity', 20]]) {
    if (!finiteVector(body[key])) throw new RangeError(`${key}必须为三个有限数`)
    if (editable) body[key].forEach(value => range(value, -limit, limit, key))
  }
}
function validateParameters ({ G, mode, softening }) {
  range(G, 0.1, 5, '引力常数')
  range(softening, 0, 1, '软化长度')
  if (mode !== 1 && mode !== 2) throw new RangeError('模式必须为1或2')
}

export function makeSystem (preset = 'balanced') {
  const body = (id, name, mass, radius, luminosity, position, velocity) => ({ id, name, mass, radius, luminosity, position, velocity, active: true })
  let bodies
  if (preset === 'balanced') {
    // A deliberately hierarchical experiment: all forces remain live, including the low-mass companions.
    bodies = [
      body('star-a', '恒星 A', 1, 0.32, 20, [0, 0, 0], [0, 0, 0]),
      body('star-b', '恒星 B', 0.00001, 0.2, 0.05, [8, 0, 0], [0, Math.sqrt(1 / 8), 0]),
      body('star-c', '恒星 C', 0.000004, 0.16, 0.02, [-10.7, 0, 0], [0, -Math.sqrt(1 / 10.7), 0]),
      body('planet', '文明行星', 0.000003, 0.09, 0, [-4, 0, 0], [0, -0.5, 0])
    ]
    const mass = bodies.reduce((sum, b) => sum + b.mass, 0)
    for (const key of ['position', 'velocity']) {
      const center = [0, 1, 2].map(axis => bodies.reduce((sum, b) => sum + b.mass * b[key][axis], 0) / mass)
      bodies.forEach(b => { b[key] = subtract(b[key], center) })
    }
  } else if (preset === 'chaotic') {
    bodies = [
      body('star-a', '恒星 A', 1, 0.25, 4, [-3, 0, 1], [0.25, 0.25, 0]),
      body('star-b', '恒星 B', 1.3, 0.28, 3, [2, 1, 0], [-0.2, 0.15, 0.12]),
      body('star-c', '恒星 C', 0.8, 0.22, 2, [0, -3, -1], [0.15, -0.12, -0.08]),
      body('planet', '文明行星', 0.000003, 0.09, 0, [-1, 4, 0], [0.35, -0.2, 0.08])
    ]
  } else if (preset === 'triple') {
    bodies = [
      body('star-a', '恒星 A', 0.5, 0.25, 20, [4, -3, 0], [0, 0.08, 0.03]),
      body('star-b', '恒星 B', 0.6, 0.28, 20, [5, 0, 0], [0, 0.08, 0.03]),
      body('star-c', '恒星 C', 0.5, 0.25, 20, [4, 3, 0], [0, 0.08, 0.03]),
      body('planet', '文明行星', 0.000003, 0.09, 0, [-4, 0, 0], [0, 0.03, 0])
    ]
  } else throw new RangeError('未知初值预设')
  bodies.forEach(b => validateBody(b, true))
  return { bodies, time: 0, G: 1, softening: 0.01, mode: 1, boundary: 12, accumulator: 0, error: null, collisions: [] }
}

export function updateBody (system, id, patch) {
  const body = system.bodies.find(body => body.id === id)
  if (!body) throw new RangeError('未找到天体')
  const allowed = ['mass', 'luminosity', 'position', 'velocity', 'radius']
  if (!patch || Object.keys(patch).some(key => !allowed.includes(key))) throw new RangeError('不可修改的天体字段')
  const next = { ...body, ...patch }
  validateBody(next, true)
  Object.assign(body, next, { position: [...next.position], velocity: [...next.velocity] })
  return system
}

export function setParameters (system, patch) {
  if (!patch || Object.keys(patch).some(key => !['G', 'mode', 'softening'].includes(key))) throw new RangeError('未知系统参数')
  const next = { ...system, ...patch }
  validateParameters(next)
  Object.assign(system, patch)
  return system
}

export function pairForce (a, b, G = 1, softening = 0.01) {
  if (a.active === false || b.active === false) return [0, 0, 0]
  const delta = subtract(b.position, a.position)
  const squared = dot(delta, delta) + softening * softening
  if (squared === 0) return [0, 0, 0]
  const scale = G * a.mass * b.mass / (squared * Math.sqrt(squared))
  return delta.map(value => value * scale)
}

export function accelerations (system) {
  const { bodies, G, softening } = system
  const result = bodies.map(() => [0, 0, 0])
  for (let i = 0; i < bodies.length; i++) {
    if (!bodies[i].active) continue
    for (let j = i + 1; j < bodies.length; j++) {
      if (!bodies[j].active) continue
      const force = pairForce(bodies[i], bodies[j], G, softening)
      for (let axis = 0; axis < 3; axis++) {
        result[i][axis] += force[axis] / bodies[i].mass
        result[j][axis] -= force[axis] / bodies[j].mass
      }
    }
  }
  return result
}

export function energy (system) {
  let total = 0
  const bodies = system.bodies.filter(body => body.active)
  for (let i = 0; i < bodies.length; i++) {
    total += bodies[i].mass * dot(bodies[i].velocity, bodies[i].velocity) / 2
    for (let j = i + 1; j < bodies.length; j++) {
      const delta = subtract(bodies[i].position, bodies[j].position)
      total -= system.G * bodies[i].mass * bodies[j].mass / Math.sqrt(dot(delta, delta) + system.softening ** 2)
    }
  }
  return total
}

// First contact of two swept spheres. Endpoint-only overlap misses fast crossings.
function contactFraction (a, b, nextA, nextB) {
  const offset = subtract(a.position, b.position)
  const change = subtract(subtract(nextA.position, a.position), subtract(nextB.position, b.position))
  const c = dot(offset, offset) - (a.radius + b.radius) ** 2
  if (c <= 0) return 0
  const aa = dot(change, change), bb = 2 * dot(offset, change)
  const discriminant = bb * bb - 4 * aa * c
  if (!aa || discriminant < 0 || bb >= 0) return null
  const fraction = (-bb - Math.sqrt(discriminant)) / (2 * aa)
  return fraction >= 0 && fraction <= 1 ? fraction : null
}

function reflect (body, boundary) {
  const limit = boundary - body.radius
  if (!(limit > 0)) throw new RangeError('边界必须大于天体半径')
  for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(body.position[axis]) <= limit) continue
    const folded = ((body.position[axis] + limit) % (4 * limit) + 4 * limit) % (4 * limit)
    body.position[axis] = folded <= 2 * limit ? folded - limit : 3 * limit - folded
    if (folded > 2 * limit) body.velocity[axis] *= -1
  }
}

function substepSize (system, remaining) {
  let h = remaining
  const bodies = system.bodies.filter(body => body.active)
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const delta = subtract(bodies[i].position, bodies[j].position)
    const separation = Math.max(Math.sqrt(dot(delta, delta) + system.softening ** 2), bodies[i].radius + bodies[j].radius)
    h = Math.min(h, 0.05 * Math.sqrt(separation ** 3 / (system.G * (bodies[i].mass + bodies[j].mass))))
  }
  return h
}

function integrate (system, h) {
  const current = system.bodies, acceleration = accelerations(system)
  const next = current.map((body, i) => ({ ...body,
    position: body.active ? body.position.map((value, axis) => value + body.velocity[axis] * h + acceleration[i][axis] * h * h / 2) : [...body.position],
    velocity: [...body.velocity]
  }))
  const contacts = []
  for (let i = 0; i < current.length; i++) for (let j = i + 1; j < current.length; j++) {
    if (!current[i].active || !current[j].active) continue
    const fraction = contactFraction(current[i], current[j], next[i], next[j])
    if (fraction !== null) contacts.push({ i, j, fraction })
  }
  contacts.sort((a, b) => a.fraction - b.fraction)
  const events = []
  for (const { i, j, fraction } of contacts) {
    if (!next[i].active || !next[j].active) continue
    const planetIndex = current[i].id === 'planet' ? i : current[j].id === 'planet' ? j : -1
    const event = { type: planetIndex < 0 ? 'star-star' : 'planet-star', ids: [current[i].id, current[j].id], time: system.time + h * fraction }
    if (planetIndex < 0) {
      system.collisions.push(event)
      system.error = `恒星碰撞：${current[i].name} / ${current[j].name}，请重置物理状态`
      return false
    }
    const planet = next[planetIndex]
    planet.position = planet.position.map((value, axis) => current[planetIndex].position[axis] + (value - current[planetIndex].position[axis]) * fraction)
    planet.velocity = [0, 0, 0]
    planet.active = false
    events.push(event)
  }
  const after = accelerations({ ...system, bodies: next })
  next.forEach((body, i) => {
    if (body.active) {
      body.velocity = body.velocity.map((value, axis) => value + (acceleration[i][axis] + after[i][axis]) * h / 2)
      if (system.mode === 1) reflect(body, system.boundary)
    }
    validateBody(body)
  })
  current.forEach((body, i) => Object.assign(body, next[i]))
  system.collisions.push(...events)
  system.time += h
  return true
}

export function step (system, deltaYears) {
  if (system.error) return system
  try {
    if (!Number.isFinite(deltaYears) || deltaYears < 0) throw new RangeError('时间增量必须为非负有限数')
    validateParameters(system)
    system.bodies.forEach(body => validateBody(body))
    if (!Number.isFinite(system.time) || !Number.isFinite(system.accumulator)) throw new RangeError('模拟时钟异常')
    const pending = system.accumulator + deltaYears
    if (!Number.isFinite(pending) || pending > RULES.DT * RULES.MAX_SUBSTEPS + 1e-12) throw new RangeError('积分预算不足，请降低倍率或重置')
    system.accumulator = pending
    let used = 0
    while (system.accumulator + 1e-12 >= RULES.DT) {
      const start = system.time
      let remaining = RULES.DT
      while (remaining > 1e-14) {
        if (++used > RULES.MAX_SUBSTEPS) throw new RangeError('近距离积分超出预算，已保留最后有效状态')
        const h = substepSize(system, remaining)
        if (!Number.isFinite(h) || h <= 0) throw new RangeError('积分步长异常')
        if (!integrate(system, h)) return system
        system.accumulator = Math.max(0, system.accumulator - h)
        remaining -= h
      }
      // Exact basic-step timestamps keep year boundaries independent of floating-point addition drift.
      system.time = Math.abs(start / RULES.DT - Math.round(start / RULES.DT)) < 1e-7
        ? (Math.round(start / RULES.DT) + 1) * RULES.DT : start + RULES.DT
    }
  } catch (error) {
    system.error = error.message || '数值积分异常，已暂停'
  }
  return system
}

export function environment (system) {
  const planet = system.bodies.find(body => body.id === 'planet')
  const angle = 2 * Math.PI * system.time / RULES.ROTATION_YEARS
  const normal = [Math.cos(angle), Math.sin(angle), 0]
  const starFluxes = planet ? system.bodies.filter(body => body.id !== 'planet' && body.active).map(star => {
    const vector = subtract(star.position, planet.position)
    const distance = Math.hypot(...vector)
    const direction = distance ? vector.map(value => value / distance) : [0, 0, 0]
    return { id: star.id, flux: star.luminosity / Math.max(distance ** 2, (planet.radius + star.radius) ** 2), direction, aboveHorizon: dot(normal, direction) > 1e-12 }
  }) : []
  const sunIds = starFluxes.filter(star => star.aboveHorizon && star.flux >= RULES.SUN_THRESHOLD).map(star => star.id)
  return { flux: starFluxes.reduce((sum, star) => sum + star.flux, 0), suns: sunIds.length, sunIds, normal, starFluxes,
    collision: planet?.active === false ? system.collisions.find(event => event.type === 'planet-star') || null : null }
}

export function createCivilization (number = 1) {
  if (!Number.isSafeInteger(number) || number < 1) throw new RangeError('文明编号必须为正整数')
  return { number, dead: false, reason: null, era: '乱纪元', history: [], death: null,
    stableYears: 0, hotYears: 0, coldYears: 0, tripleYears: 0, hot: false, cold: false, lastFlux: null }
}

export function evolveCivilization (civ, env, deltaYears, simTime) {
  if (civ.dead) return null
  if (!Number.isFinite(deltaYears) || deltaYears < 0 || !Number.isFinite(simTime) || !Number.isFinite(env.flux) || env.flux < 0 || !Number.isInteger(env.suns) || env.suns < 0 || env.suns > 3) throw new RangeError('文明环境或时间输入无效')
  civ.hot = civ.hot ? env.flux >= RULES.HOT_EXIT : env.flux > RULES.HOT_ENTER
  civ.cold = civ.cold ? env.flux <= RULES.COLD_EXIT : env.flux < RULES.COLD_ENTER
  civ.hotYears = civ.hot ? civ.hotYears + deltaYears : 0
  civ.coldYears = civ.cold ? civ.coldYears + deltaYears : 0
  civ.tripleYears = env.suns === 3 ? civ.tripleYears + deltaYears : 0
  const steady = civ.lastFlux === null || Math.abs(env.flux - civ.lastFlux) <= Math.max(civ.lastFlux, 1e-12) * RULES.STABLE_VARIATION
  const stable = env.suns === 1 && env.flux >= RULES.STABLE_MIN && env.flux <= RULES.STABLE_MAX && steady
  civ.stableYears = stable ? civ.stableYears + deltaYears : 0
  civ.era = civ.stableYears + 1e-10 >= RULES.STABLE_YEARS ? '恒纪元' : '乱纪元'
  civ.lastFlux = env.flux
  const cause = env.collision ? '行星碰撞'
    : civ.tripleYears + 1e-10 >= RULES.TRIPLE_DEATH_YEARS ? '三日凌空'
      : civ.hotYears + 1e-10 >= RULES.THERMAL_DEATH_YEARS ? '过热'
        : civ.coldYears + 1e-10 >= RULES.THERMAL_DEATH_YEARS ? '严寒' : null
  if (!cause) return null
  const record = { number: civ.number, time: simTime, year: RULES.START_YEAR + Math.floor(simTime), cause }
  civ.dead = true
  civ.reason = cause
  civ.death = record
  civ.history.push(record)
  if (civ.history.length > 20) civ.history.splice(0, civ.history.length - 20)
  return record
}

export function resetCivilization (civ) {
  return { ...createCivilization(civ.number + 1), history: civ.history.slice(-20).map(record => ({ ...record })) }
}

export const trailAlpha = age => Math.max(0, Math.min(1, 1 - age / RULES.TRAIL_SECONDS))

export function sampleTrails (trails, bodies, runningSeconds) {
  if (!Number.isFinite(runningSeconds) || runningSeconds < 0) throw new RangeError('尾迹时钟无效')
  for (const body of bodies) {
    const points = trails[body.id] ||= []
    while (points.length && points[0].time < runningSeconds - RULES.TRAIL_SECONDS) points.shift()
    if (body.active && (!points.length || runningSeconds - points.at(-1).time >= 1 / 60 - 1e-9)) {
      points.push({ position: [...body.position], time: runningSeconds })
    }
    if (points.length > RULES.TRAIL_CAPACITY) points.splice(0, points.length - RULES.TRAIL_CAPACITY)
  }
  return trails
}
