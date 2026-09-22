import { RULES } from './three-body-core.mjs'

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const sub = (a, b) => a.map((x, i) => x - b[i])
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = a => { const length = Math.hypot(...a); return a.map(x => x / length) }
const finiteVector = a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite)
const validBody = b => b && typeof b.id === 'string' && Number.isFinite(b.mass) && b.mass > 0 && finiteVector(b.position) && finiteVector(b.velocity)

function bisect (f, left, right) {
  for (let i = 0; i < 80; i++) {
    const mid = (left + right) / 2
    if (f(mid) > 0) right = mid
    else left = mid
  }
  return (left + right) / 2
}

/** Instantaneous circular restricted three-body approximation, not four-body equilibria.
 * The two selected masses define an unsoftened CR3BP reference rotating at its
 * circular Kepler rate. The other bodies and actual eccentric motion are omitted.
 */
export function lagrangePoints (system, primaryId, secondaryId) {
  if (!Array.isArray(system?.bodies) || primaryId === secondaryId) return []
  let a = system.bodies.find(b => b.id === primaryId)
  let b = system.bodies.find(b => b.id === secondaryId)
  if (!validBody(a) || !validBody(b) || a.active === false || b.active === false) return []
  if (a.mass < b.mass || (a.mass === b.mass && a.id > b.id)) [a, b] = [b, a]
  const distance = Math.hypot(...sub(b.position, a.position))
  if (!Number.isFinite(distance) || distance < 1e-9) return []
  const mass = a.mass + b.mass, mu = b.mass / mass
  if (!Number.isFinite(mass) || mu <= 0 || mu > 0.5) return []
  const xAxis = unit(sub(b.position, a.position))
  const angular = cross(xAxis, sub(b.velocity, a.velocity))
  // Radial/resting pairs have no orbital plane; use a deterministic reference plane.
  const normal = Math.hypot(...angular) > 1e-12 ? angular : cross(xAxis, Math.abs(xAxis[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0])
  const yAxis = unit(cross(normal, xAxis))
  const center = a.position.map((x, i) => (a.mass * x + b.mass * b.position[i]) / mass)
  const f = x => x - (1 - mu) * (x + mu) / Math.abs(x + mu) ** 3 - mu * (x - 1 + mu) / Math.abs(x - 1 + mu) ** 3
  const epsilon = 1e-12
  const normalized = [
    [bisect(f, -mu + epsilon, 1 - mu - epsilon), 0],
    [bisect(f, 1 - mu + epsilon, 2), 0],
    [bisect(f, -2, -mu - epsilon), 0],
    [0.5 - mu, Math.sqrt(3) / 2], [0.5 - mu, -Math.sqrt(3) / 2]
  ]
  const points = normalized.map(([x, y], i) => ({ id: `L${i + 1}`, position: center.map((c, axis) => c + distance * (x * xAxis[axis] + y * yAxis[axis])) }))
  return points.every(p => finiteVector(p.position)) ? points : []
}

function validateSystem (system) {
  if (!system || !Number.isFinite(system.G) || system.G <= 0 || !Number.isFinite(system.softening) || system.softening < 0 || !Number.isFinite(system.time)) throw new RangeError('环带引力参数或时间无效')
  if (!Array.isArray(system.bodies) || system.bodies.length < 1 || system.bodies.length > 4 || new Set(system.bodies.map(b => b.id)).size !== system.bodies.length) throw new RangeError('环带需要一至四个不同引力源')
  for (const body of system.bodies) if (!validBody(body) || !Number.isFinite(body.radius) || body.radius <= 0) throw new RangeError('环带引力源必须包含有限位置、速度和正质量、半径')
  if (!system.bodies.some(b => b.active !== false)) throw new RangeError('环带需要有效引力源')
}

/** A Kuiper-inspired annulus in simulation units, not a scale model of our Solar System.
 * Particles are massless tracers: their initial circular speed uses total mass,
 * then advanceBelt integrates the actual moving sources without back reaction.
 */
export function makeBelt (system, { count = 128, inner = 14, outer = 24, inclination = 12, seed = 7301 } = {}) {
  try {
    validateSystem(system)
    if (!Number.isInteger(count) || count < 64 || count > 256) throw new RangeError('环带粒子数须为 64—256 的整数')
    if (!Number.isFinite(inner) || !Number.isFinite(outer) || inner < 6 || outer > 60 || inner >= outer) throw new RangeError('环带半径须在 6—60 之间，且内径小于外径')
    if (!Number.isFinite(inclination) || inclination < 0 || inclination > 60) throw new RangeError('环带倾角须在 0—60 度之间')
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('环带种子须为无符号 32 位整数')
    const sources = system.bodies.filter(b => b.active !== false)
    const mass = sources.reduce((total, b) => total + b.mass, 0)
    const center = key => [0, 1, 2].map(axis => sources.reduce((total, b) => total + b.mass * b[key][axis], 0) / mass)
    const origin = center('position'), drift = center('velocity')
    let state = seed >>> 0
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296 }
    const particles = Array.from({ length: count }, () => {
      const radius = Math.sqrt(inner * inner + random() * (outer * outer - inner * inner))
      const theta = random() * Math.PI * 2, node = random() * Math.PI * 2, tilt = (random() * 2 - 1) * inclination * Math.PI / 180
      const u = [Math.cos(node), Math.sin(node), 0], v = [-Math.sin(node) * Math.cos(tilt), Math.cos(node) * Math.cos(tilt), Math.sin(tilt)]
      const speed = Math.sqrt(system.G * mass / radius)
      return {
        position: origin.map((x, axis) => x + radius * (Math.cos(theta) * u[axis] + Math.sin(theta) * v[axis])),
        velocity: drift.map((x, axis) => x + speed * (-Math.sin(theta) * u[axis] + Math.cos(theta) * v[axis])),
        active: true
      }
    })
    if (particles.some(p => !finiteVector(p.position) || !finiteVector(p.velocity))) throw new RangeError('环带初始化产生非有限数值')
    return { particles, error: null }
  } catch (error) { return { particles: [], error: error.message } }
}

function acceleration (position, sources, G, softening) {
  const result = [0, 0, 0], epsilon2 = softening * softening
  for (const source of sources) if (source.active !== false) {
    // Same softened Newtonian acceleration as core pairForce / tracer mass;
    // scalar components avoid temporary per-pair vectors for every tracer.
    const dx = source.position[0] - position[0], dy = source.position[1] - position[1], dz = source.position[2] - position[2]
    const squared = dx * dx + dy * dy + dz * dz + epsilon2
    if (squared === 0) continue
    const scale = G * source.mass / (squared * Math.sqrt(squared))
    result[0] += dx * scale; result[1] += dy * scale; result[2] += dz * scale
  }
  return result
}

function contactFraction (start, end, sourceStart, sourceEnd) {
  const rx = start[0] - sourceStart.position[0], ry = start[1] - sourceStart.position[1], rz = start[2] - sourceStart.position[2]
  const dx = end[0] - start[0] - sourceEnd.position[0] + sourceStart.position[0]
  const dy = end[1] - start[1] - sourceEnd.position[1] + sourceStart.position[1]
  const dz = end[2] - start[2] - sourceEnd.position[2] + sourceStart.position[2]
  const c = rx * rx + ry * ry + rz * rz - sourceStart.radius ** 2
  if (c <= 0) return 0
  const a = dx * dx + dy * dy + dz * dz, b = rx * dx + ry * dy + rz * dz, discriminant = b * b - a * c
  if (a === 0 || b >= 0 || discriminant < 0) return null
  const fraction = c / (-b + Math.sqrt(discriminant))
  return fraction >= 0 && fraction <= 1 ? fraction : null
}

/** Advance one main-system step with linearly interpolated sources and adaptive
 * velocity Verlet. A finite-number/budget failure is latched and rolls back this
 * whole call; only rebuilding the belt clears it. Main bodies are never mutated.
 */
export function advanceBelt (belt, beforeSystem, afterSystem, deltaYears) {
  if (belt.error) return belt
  try {
    if (!Number.isFinite(deltaYears) || deltaYears < 0) throw new RangeError('环带每次只能推进一个固定时间步')
    validateSystem(beforeSystem); validateSystem(afterSystem)
    // The difference of large absolute clocks can be several ULPs wider than DT.
    const clockTolerance = Math.min(RULES.DT / 4, Math.max(1e-12, Number.EPSILON * Math.max(1, Math.abs(beforeSystem.time), Math.abs(afterSystem.time)) * 8))
    if (deltaYears > RULES.DT + clockTolerance) throw new RangeError('环带每次只能推进一个固定时间步')
    if (Math.abs(afterSystem.time - beforeSystem.time - deltaYears) > 1e-9 || beforeSystem.G !== afterSystem.G || beforeSystem.softening !== afterSystem.softening) throw new RangeError('环带前后时间或引力参数不一致')
    const endpoints = beforeSystem.bodies.map(b => afterSystem.bodies.find(end => end.id === b.id))
    if (endpoints.length !== afterSystem.bodies.length || endpoints.some((b, i) => !b || b.mass !== beforeSystem.bodies[i].mass || b.radius !== beforeSystem.bodies[i].radius)) throw new RangeError('环带引力源在单步内改变')
    if (!Array.isArray(belt.particles) || belt.particles.length < 64 || belt.particles.length > 256 || belt.particles.some(p => !finiteVector(p.position) || !finiteVector(p.velocity) || typeof p.active !== 'boolean')) throw new RangeError('环带粒子状态无效')
    if (deltaYears === 0) return belt
    const particles = belt.particles.map(p => ({ ...p, position: [...p.position], velocity: [...p.velocity] }))
    const { G, softening } = beforeSystem
    const sourcesAt = fraction => beforeSystem.bodies.map((b, i) => ({ ...b, position: b.position.map((x, axis) => x + fraction * (endpoints[i].position[axis] - x)) }))
    let elapsed = 0, steps = 0
    while (elapsed < deltaYears) {
      // Bounded work per main DT; never catch up near an unresolved singularity.
      if (++steps > 64) throw new RangeError('环带积分预算耗尽，请调整近距离初值或软化长度')
      const start = sourcesAt(elapsed / deltaYears)
      let h = deltaYears - elapsed
      for (const p of particles) if (p.active) for (const b of start) if (b.active !== false) {
        const dx = p.position[0] - b.position[0], dy = p.position[1] - b.position[1], dz = p.position[2] - b.position[2]
        const distance = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz + softening * softening), b.radius)
        h = Math.min(h, 0.05 * Math.sqrt(distance ** 3 / (G * b.mass)))
      }
      if (!Number.isFinite(h) || h <= 0 || elapsed + h === elapsed) throw new RangeError('环带积分预算不足以解析当前时间步')
      const end = sourcesAt((elapsed + h) / deltaYears)
      for (const p of particles) if (p.active) {
        const a0 = acceleration(p.position, start, G, softening)
        const next = p.position.map((x, axis) => x + p.velocity[axis] * h + a0[axis] * h * h / 2)
        let hit = null
        for (let i = 0; i < start.length; i++) if (start[i].active !== false && start[i].id !== 'planet') {
          const fraction = contactFraction(p.position, next, start[i], end[i])
          if (fraction !== null && (hit === null || fraction < hit)) hit = fraction
        }
        if (hit !== null) {
          p.position = p.position.map((x, axis) => x + hit * (next[axis] - x))
          p.velocity = [0, 0, 0]; p.active = false
        } else {
          const a1 = acceleration(next, end, G, softening)
          p.velocity = p.velocity.map((x, axis) => x + (a0[axis] + a1[axis]) * h / 2)
          p.position = next
        }
        if (!finiteVector(p.position) || !finiteVector(p.velocity)) throw new RangeError('环带积分出现非有限数值')
      }
      elapsed += h
    }
    belt.particles = particles
  } catch (error) { belt.error = error.message }
  return belt
}
