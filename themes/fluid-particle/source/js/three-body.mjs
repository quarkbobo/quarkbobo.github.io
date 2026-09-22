import { makeSystem, step, setParameters, updateBody, environment, createCivilization, evolveCivilization, resetCivilization, sampleTrails, RULES } from './three-body-core.mjs'
import { lagrangePoints, makeBelt, advanceBelt } from './three-body-overlays.mjs'
import { makeEvents, advanceEvents, triggerEvent, eventEffects } from './three-body-events.mjs'

const root = document.documentElement
const host = document.getElementById('three-body-observatory')
const byId = id => document.getElementById(id)
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const storage = {
  get (key) { try { return localStorage.getItem(key) } catch { return null } },
  set (key, value) { try { localStorage.setItem(key, value) } catch { /* Private browsing may only retain the current session. */ } }
}
const active = true
let system = makeSystem('balanced'), initial = structuredClone(system), preset = 'balanced'
let civilization = createCivilization(), paused = reduced.matches, speed = 1, view = 'station'
let scene = null, canvas = null, loading = null, sceneFailed = false, visible = true, frame = 0, lastTime = 0, realTime = 0
let trails = {}, forceMode = null, selectedId = 'star-a', yaw = 0, pitch = 0, zoom = 1
let lastStatus = '', historyVersion = -1
const visualDefaults = { exposure: 1.1, bloom: 1, particles: 1, nebula: 0.6, starScale: 1, trailWidth: 1.4 }
const visualFields = { exposure: 'exposure', bloom: 'bloom', particles: 'particles', nebula: 'nebula', starScale: 'star-scale', trailWidth: 'trail-width' }
let visual = { ...visualDefaults }
const observations = { lagrangeEnabled: false, lagrangePair: 'a-b', beltEnabled: true, fitBelt: false, beltSettings: { count: 128, inner: 14, outer: 24, inclination: 12, seed: 7301 } }
let belt = host ? makeBelt(system, observations.beltSettings) : null
let events = makeEvents(7301)
const eventSettings = { enabled: true, frequency: 1, intensity: 1 }
const eventNames = { flare: '恒星耀斑', dust: '星尘风暴', aurora: '行星极光' }
let lastEventLabel = ''
advanceEvents(events, 0, eventSettings)
const pairIds = () => observations.lagrangePair.split('-').map(id => 'star-' + id)
const referencePoints = () => observations.lagrangeEnabled ? lagrangePoints(system, ...pairIds()) : []
const dirtyFields = new Set()
const civilizationKey = 'quark-three-body-civilization-v1'
try {
  const saved = JSON.parse(storage.get(civilizationKey) || 'null')
  if (saved && Number.isSafeInteger(saved.number) && saved.number > 0) {
    civilization = createCivilization(saved.number)
    civilization.history = (Array.isArray(saved.history) ? saved.history : []).filter(e => e && Number.isSafeInteger(e.number) && Number.isFinite(e.time) && Number.isFinite(e.year) && ['过热', '严寒', '三日凌空', '行星碰撞'].includes(e.cause)).slice(-20)
    if (saved.dead && civilization.history.some(e => e.number === saved.number)) {
      civilization.dead = true
      civilization.death = civilization.history.findLast(e => e.number === saved.number)
      civilization.reason = civilization.death.cause
    }
  }
} catch { /* Invalid stored data is replaced with a fresh, validated civilization. */ }

const saveCivilization = () => storage.set(civilizationKey, JSON.stringify({ number: civilization.number, dead: civilization.dead, history: civilization.history }))
const running = () => active && host && visible && !document.hidden && !paused && !reduced.matches && !system.error && scene && !sceneFailed
function message (text = '') { if (host) byId('tb-message').textContent = text }
function cancel () { if (frame) cancelAnimationFrame(frame); frame = 0; lastTime = 0 }
function schedule () { if (running() && !frame) frame = requestAnimationFrame(tick) }
function draw (deltaSeconds = 0) {
  if (!active || !host || !scene || sceneFailed || document.hidden || !visible) return
  scene.render(system, { view, deltaSeconds, runningSeconds: realTime, paused, forceMode, selectedId, yaw, pitch, zoom, trails, visual, lagrange: referencePoints(), lagrangePrimaries: pairIds(), belt: observations.beltEnabled ? belt : null, fitBelt: observations.fitBelt, effects: eventEffects(events, realTime, eventSettings.intensity) })
  const diagnostics = scene.diagnostics()
  for (const label of host.querySelectorAll('[data-body-label]')) {
    const point = diagnostics.projections?.[label.dataset.bodyLabel]
    label.hidden = !point?.visible
    if (point?.visible) label.style.transform = `translate(${point.x + 14}px, ${point.y + 15}px)`
  }
  for (const label of host.querySelectorAll('[data-lagrange-label]')) {
    const point = diagnostics.lagrangeProjections?.[label.dataset.lagrangeLabel]
    label.hidden = !observations.lagrangeEnabled || !point?.visible
    if (!label.hidden) {
      const offset = label.dataset.lagrangeLabel === 'L1' ? [-35, 22] : [9, -18]
      label.style.transform = `translate(${point.x + offset[0]}px, ${point.y + offset[1]}px)`
    }
  }
  const readout = byId('tb-force-readout')
  readout.hidden = !forceMode
  const scientific = value => Number(value).toExponential(2)
  if (forceMode === 'gravity') readout.textContent = (diagnostics.forcePairs || []).map(p => `${p.ids?.map(id => id.slice(-1).toUpperCase()).join(' ↔ ') || ''}  ${scientific(p.magnitude)} F₀`).join('   /   ')
  else if (forceMode === 'acceleration' && diagnostics.selectedVectors) {
    const v = diagnostics.selectedVectors
    readout.textContent = `合力 ${scientific(v.forceMagnitude)} F₀ · 加速度 ${scientific(v.accelerationMagnitude)} a₀（两种单位分别缩放）`
  } else if (forceMode === 'radiation') readout.textContent = `行星总辐照 ${environment(system).flux.toFixed(3)} I₀ · 光度 / 距离²`
}
function status () {
  if (!host) return
  const env = environment(system)
  byId('tb-year').textContent = String(2000 + Math.floor(system.time + 1e-9))
  byId('tb-era').textContent = `${civilization.era} · 第${civilization.number}号文明`
  byId('tb-suns').textContent = String(env.suns)
  byId('tb-flux').textContent = env.flux.toFixed(3)
  byId('tb-boundary-label').textContent = system.mode === 1 ? `人为边界 ±${system.boundary}` : '自由演化 · 无边界'
  byId('tb-softening-label').textContent = String(system.softening)
  const eventStatus = byId('tb-event-status'), currentEvent = eventSettings.enabled ? events.active : null
  eventStatus.hidden = !currentEvent
  const eventLabel = currentEvent ? `观测事件 · ${eventNames[currentEvent.type]}${currentEvent.type === 'flare' ? ' / 恒星 ' + currentEvent.starId.slice(-1).toUpperCase() : ''}` : ''
  if (eventLabel !== lastEventLabel) { eventStatus.textContent = eventLabel; lastEventLabel = eventLabel }
  byId('tb-view-name').textContent = byId('tb-view').selectedOptions[0].textContent
  byId('tb-pause').textContent = paused ? '继续' : '暂停'
  byId('tb-pause').setAttribute('aria-pressed', String(paused))
  byId('tb-pause').disabled = reduced.matches || sceneFailed
  byId('tb-pause').title = reduced.matches ? '已按系统偏好减少动态，可用单步观测' : ''
  let text = `${civilization.era} · ${2000 + Math.floor(system.time)}年 · 第${civilization.number}号文明 · ${system.mode === 1 ? '约束观测' : env.suns === 2 ? '双日，高温风险' : env.suns === 0 ? (civilization.cold ? '持续严寒' : '地表夜晚') : civilization.hot ? '高温警戒' : civilization.cold ? '严寒警戒' : '观测中'}`
  if (civilization.dead) text = `${civilization.era} · ${civilization.death.year}年 · 第${civilization.number}号文明毁灭｜${civilization.reason}`
  if (text !== lastStatus) { byId('tb-status').textContent = text; lastStatus = text }
  byId('tb-status').dataset.dead = String(civilization.dead)
  if (historyVersion !== civilization.history.length + civilization.number * 100) {
    byId('tb-history').replaceChildren(...civilization.history.slice().reverse().map(record => {
      const li = document.createElement('li')
      li.textContent = `${record.year}年 · 第${record.number}号文明毁灭｜${record.cause}`
      return li
    }))
    historyVersion = civilization.history.length + civilization.number * 100
  }
  for (const button of host.querySelectorAll('[data-force]')) button.setAttribute('aria-pressed', String(button.dataset.force === forceMode))
}
function advanceYears (years) {
  // Sample the environment on the same fixed cadence as the solver, not on GPU frames.
  if (!Number.isFinite(years) || Math.ceil(years / RULES.DT) > RULES.MAX_SUBSTEPS) {
    system.error = '本次时间间隔超过计算预算，已保留最后状态；请降低倍率后重置轨道。'
  } else {
    let remaining = years
    while (remaining > 1e-12 && !system.error) {
      const part = Math.min(remaining, RULES.DT), before = system.time
      const sourceBefore = observations.beltEnabled ? structuredClone(system) : null
      step(system, part)
      if (sourceBefore && !system.error && system.time > before) {
        advanceBelt(belt, sourceBefore, system, system.time - before)
        if (belt.error) system.error = `碎冰带计算已暂停：${belt.error}。请调整参数或重置轨道。`
      }
      if (system.mode === 2 && !system.error) {
        const record = evolveCivilization(civilization, environment(system), system.time - before, system.time)
        if (record) saveCivilization()
      }
      remaining -= part
    }
  }
  if (system.error) { paused = true; cancel(); message(system.error) }
}
function tick (now) {
  frame = 0
  if (!running()) { lastTime = 0; return }
  const elapsed = lastTime ? (now - lastTime) / 1000 : 0
  lastTime = now
  if (elapsed > 0) {
    advanceYears(elapsed * speed)
    if (!system.error) {
      realTime += elapsed
      sampleTrails(trails, system.bodies, realTime)
      advanceEvents(events, realTime, eventSettings)
    }
  }
  draw(elapsed)
  status()
  schedule()
}
function setPaused (value) { paused = value || reduced.matches; cancel(); status(); schedule() }
function syncFields () {
  if (!host) return
  const body = system.bodies.find(b => b.id === selectedId)
  const values = { mass: body.mass, luminosity: body.luminosity, x: body.position[0], y: body.position[1], z: body.position[2], vx: body.velocity[0], vy: body.velocity[1], vz: body.velocity[2], g: system.G, speed, softening: system.softening, boundary: system.boundary }
  for (const [id, value] of Object.entries(values)) byId('tb-' + id).value = String(Number(value.toPrecision(10)))
  byId('tb-luminosity').disabled = selectedId === 'planet'
  dirtyFields.clear()
}
function resetOrbit (fromPreset = false) {
  const mode = system.mode
  system = fromPreset ? makeSystem(preset) : structuredClone(initial)
  system.mode = mode
  if (fromPreset) initial = structuredClone(system)
  system.time = 0; system.accumulator = 0; system.error = null
  trails = {}; realTime = 0; lastTime = 0
  belt = makeBelt(system, observations.beltSettings)
  events = makeEvents(7301)
  advanceEvents(events, realTime, eventSettings)
  if (!civilization.dead) {
    const history = civilization.history
    civilization = createCivilization(civilization.number)
    civilization.history = history
  }
  message(reduced.matches ? '已减少动态，可用单步观测。' : '')
  syncFields(); status(); draw(0.25); schedule()
}
async function ensureScene () {
  if (!host || scene || sceneFailed) return
  if (loading) return loading
  loading = (async () => {
    try {
      const { createScene } = await import('./three-body-scene.mjs')
      scene = await createScene(byId('three-body-canvas'))
      if (active) { scene.resize(); draw(1); schedule() }
    } catch (error) {
      sceneFailed = true; paused = true
      host.querySelector('.tb-fallback').hidden = false
      message('WebGL 2 暂不可用：已显示静态观测窗。可继续阅读或使用单步查看数值。')
    }
    status()
  })()
  return loading
}
function startObservatory () {
  root.dataset.theme = 'three-body'
  storage.set('quark-theme', 'three-body')
  const url = new URL(location.href)
  if (url.searchParams.has('theme')) { url.searchParams.delete('theme'); history.replaceState(null, '', url) }
  if (!host) return
  host.hidden = false
  const oldMotion = byId('motion-toggle')
  byId('three-body-surface')?.replaceWith(canvas)
  if (oldMotion?.getAttribute('aria-pressed') !== 'true') oldMotion?.click()
  document.dispatchEvent(new CustomEvent('three-body-theme', { detail: { active: true } }))
  visible = true; lastTime = 0
  ensureScene().then(() => { scene?.resize(); draw(1); schedule() })
}

// A fresh copy exposes observations only. Acceptance tools cannot mutate the live simulation.
window.threeBodySnapshot = () => structuredClone({
  active, paused, mode: system.mode, view, preset, G: system.G, speed, simTime: system.time, realTime, forceMode, softening: system.softening, boundary: system.boundary, visual, observations, lagrange: referencePoints(), belt, events, eventSettings, effects: eventEffects(events, realTime, eventSettings.intensity),
  bodies: system.bodies.map(body => ({ ...body, trail: trails[body.id] || [] })),
  civilization: { state: civilization.era, dead: civilization.dead, number: civilization.number, reason: civilization.reason, events: civilization.history.map(e => ({ ...e, type: 'death' })) },
  renderer: scene ? scene.diagnostics() : { available: false, frames: 0, geometries: 0, textures: 0, camera: { position: [], quaternion: [] } },
  error: system.error, visible, animationScheduled: Boolean(frame)
})

if (host) {
  function syncVisual () {
    for (const [key, id] of Object.entries(visualFields)) {
      byId('tb-' + id).value = String(visual[key])
      byId('tb-' + id + '-value').value = visual[key].toFixed(2)
    }
  }
  try {
    const saved = JSON.parse(storage.get('quark-three-body-visual-v1') || 'null')
    for (const [key, id] of Object.entries(visualFields)) {
      const input = byId('tb-' + id), value = saved?.[key]
      if (Number.isFinite(value) && value >= Number(input.min) && value <= Number(input.max)) visual[key] = value
    }
  } catch { /* Ignore invalid local visual preferences. */ }
  syncVisual()
  for (const [key, id] of Object.entries(visualFields)) byId('tb-' + id).addEventListener('input', event => {
    const input = event.target, value = Number(input.value)
    if (!Number.isFinite(value) || value < Number(input.min) || value > Number(input.max)) return
    visual[key] = value
    byId('tb-' + id + '-value').value = value.toFixed(2)
    storage.set('quark-three-body-visual-v1', JSON.stringify(visual))
    draw(0)
  })
  byId('tb-reset-visual').addEventListener('click', () => {
    visual = { ...visualDefaults }; syncVisual()
    storage.set('quark-three-body-visual-v1', JSON.stringify(visual)); draw(0)
  })
  byId('tb-events-enabled').addEventListener('change', event => {
    eventSettings.enabled = event.target.checked
    advanceEvents(events, realTime, eventSettings); status(); draw(0)
  })
  for (const key of ['frequency', 'intensity']) byId('tb-event-' + key).addEventListener('input', event => {
    const input = event.target, value = Number(input.value)
    if (!Number.isFinite(value) || value < Number(input.min) || value > Number(input.max)) return
    eventSettings[key] = value
    byId('tb-event-' + key + '-value').value = value.toFixed(2) + '×'
    advanceEvents(events, realTime, eventSettings); status(); draw(0)
  })
  byId('tb-event-trigger').addEventListener('click', () => {
    if (!eventSettings.enabled) { message('请先开启随机空间天气。'); return }
    triggerEvent(events, realTime, byId('tb-event-type').value)
    message(paused ? '事件已就绪；继续观测后展开。' : '')
    status(); draw(0)
  })
  byId('tb-lagrange').addEventListener('change', event => { observations.lagrangeEnabled = event.target.checked; draw(0) })
  byId('tb-lagrange-pair').addEventListener('change', event => {
    if (!['a-b', 'a-c', 'b-c'].includes(event.target.value)) return
    observations.lagrangePair = event.target.value; draw(0)
  })
  byId('tb-belt').addEventListener('change', event => {
    observations.beltEnabled = event.target.checked
    if (observations.beltEnabled) belt = makeBelt(system, observations.beltSettings)
    draw(0)
  })
  byId('tb-belt-fit').addEventListener('change', event => { observations.fitBelt = event.target.checked; draw(0) })
  byId('tb-belt-form').addEventListener('submit', event => {
    event.preventDefault()
    try {
      const settings = { seed: 7301 }
      for (const key of ['count', 'inner', 'outer', 'inclination']) {
        const input = byId('tb-belt-' + key), value = Number(input.value)
        if (!input.value.trim() || !Number.isFinite(value) || value < Number(input.min) || value > Number(input.max)) throw new RangeError('碎冰带参数超出允许范围。')
        settings[key] = value
      }
      const nextBelt = makeBelt(system, settings)
      if (nextBelt.error) throw new RangeError(nextBelt.error)
      belt = nextBelt; observations.beltSettings = settings
      message('碎冰带已按当前星系重建，四天体轨道保持不变。'); draw(0)
    } catch (error) { message(error.message) }
  })
  byId('tb-pause').addEventListener('click', () => setPaused(!paused))
  byId('tb-step').addEventListener('click', () => { setPaused(true); advanceYears(RULES.DT); status(); draw(0) })
  byId('tb-reset').addEventListener('click', () => resetOrbit())
  byId('tb-new').addEventListener('click', () => { civilization = resetCivilization(civilization); saveCivilization(); resetOrbit(true) })
  byId('tb-mode').addEventListener('change', event => {
    try { setParameters(system, { mode: Number(event.target.value) }) }
    catch (error) { event.target.value = String(system.mode); message(error.message); return }
    if (!civilization.dead) {
      const history = civilization.history
      civilization = createCivilization(civilization.number)
      civilization.history = history
    }
    status(); draw(0)
  })
  byId('tb-view').addEventListener('change', event => { view = event.target.value; yaw = 0; pitch = 0; zoom = 1; status(); draw(paused ? 0.25 : 0.05) })
  byId('tb-preset').addEventListener('change', event => { preset = event.target.value; resetOrbit(true) })
  byId('tb-body').addEventListener('change', event => { selectedId = event.target.value; syncFields(); draw(0) })
  byId('tb-parameters').addEventListener('toggle', () => { if (byId('tb-parameters').open) syncFields() })
  byId('tb-form').addEventListener('input', event => { if (event.target.id) dirtyFields.add(event.target.id.replace('tb-', '')) })
  byId('tb-form').addEventListener('submit', event => {
    event.preventDefault()
    try {
      const number = id => {
        const input = byId('tb-' + id), value = Number(input.value)
        if (!input.value.trim() || !Number.isFinite(value) || value < Number(input.min) || value > Number(input.max)) throw new RangeError(`${input.closest('label').firstChild.textContent.trim()}超出允许范围，请检查参数。`)
        return value
      }
      const draft = structuredClone(system), nextSpeed = number('speed'), body = draft.bodies.find(b => b.id === selectedId)
      const position = ['x', 'y', 'z'].map((id, axis) => dirtyFields.has(id) ? number(id) : body.position[axis])
      const velocity = ['vx', 'vy', 'vz'].map((id, axis) => dirtyFields.has(id) ? number(id) : body.velocity[axis])
      const patch = { mass: number('mass'), luminosity: selectedId === 'planet' ? 0 : number('luminosity') }
      if (['x', 'y', 'z'].some(id => dirtyFields.has(id))) patch.position = position
      if (['vx', 'vy', 'vz'].some(id => dirtyFields.has(id))) patch.velocity = velocity
      updateBody(draft, selectedId, patch)
      const parameters = { G: number('g'), softening: number('softening') }
      if (dirtyFields.has('boundary')) parameters.boundary = number('boundary')
      setParameters(draft, parameters)
      system = draft; speed = nextSpeed; initial = structuredClone(system); trails = {}
      dirtyFields.clear()
      message('参数已应用，轨道从当前状态重新演化。'); status(); draw(0)
    } catch (error) { message(error.message) }
  })
  const descriptions = {
    gravity: '每对恒星的两支箭头大小相等、方向相反。当前使用带软化的万有引力，图中共同比例缩放。',
    acceleration: '亮箭头为所选天体合力，另一箭头表示加速度；F = ma，长度分别注明相对量。',
    radiation: '三条光路连接恒星与行星，辐照随距离平方衰减。地平线太阳数不由当前镜头决定。'
  }
  for (const button of host.querySelectorAll('[data-force]')) {
    const show = () => { forceMode = button.dataset.force; byId('tb-force-description').textContent = descriptions[forceMode]; status(); draw(0) }
    button.addEventListener('pointerenter', show)
    button.addEventListener('focus', show)
    button.addEventListener('click', show)
  }
  canvas = document.createElement('canvas')
  canvas.id = 'three-body-canvas'
  canvas.tabIndex = 0
  canvas.setAttribute('aria-label', '三恒星与行星的实时观测。拖动环视，方向键转动，加减键缩放；触屏可水平拖动，垂直滑动阅读。')
  let drag = null
  canvas.addEventListener('pointerdown', event => { drag = { id: event.pointerId, x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId) })
  canvas.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return
    yaw += (event.clientX - drag.x) * 0.008
    pitch = Math.max(-1.1, Math.min(1.1, pitch + (event.clientY - drag.y) * 0.006))
    drag.x = event.clientX; drag.y = event.clientY
    draw(0.25)
  })
  const endDrag = () => { drag = null }
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag)
  canvas.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') yaw -= 0.12
    else if (event.key === 'ArrowRight') yaw += 0.12
    else if (event.key === 'ArrowUp') pitch = Math.max(-1.1, pitch - 0.12)
    else if (event.key === 'ArrowDown') pitch = Math.min(1.1, pitch + 0.12)
    else if (event.key === '+' || event.key === '=') zoom = Math.min(3, zoom * 1.1)
    else if (event.key === '-') zoom = Math.max(0.5, zoom / 1.1)
    else if (event.key === 'Home') { yaw = 0; pitch = 0; zoom = 1 }
    else if (event.key === 'Escape') { forceMode = null; status() }
    else return
    event.preventDefault(); draw(0.25)
  })
  canvas.addEventListener('wheel', event => {
    if (document.activeElement !== canvas) return
    event.preventDefault(); zoom = Math.max(0.5, Math.min(3, zoom * (event.deltaY > 0 ? 1 / 1.1 : 1.1))); draw(0.25)
  }, { passive: false })
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); cancel(); sceneFailed = true; paused = true; message('图形上下文已丢失。请刷新页面恢复观测；博客阅读不受影响。'); status() })
  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting
    if (!visible) cancel()
    else { lastTime = 0; draw(0); schedule() }
  }, { threshold: 0.05 })
  observer.observe(canvas)
  document.addEventListener('visibilitychange', () => { cancel(); if (!document.hidden) { draw(0); schedule() } })
  reduced.addEventListener('change', () => { if (reduced.matches) setPaused(true); message(reduced.matches ? '已减少动态，可用单步观测。' : ''); status() })
  window.addEventListener('resize', () => { scene?.resize(); draw(0) })
  window.addEventListener('pagehide', () => { cancel(); saveCivilization(); scene?.dispose(); scene = null; loading = null })
  window.addEventListener('pageshow', event => { if (event.persisted && active) ensureScene() })
  syncFields(); status()
  if (reduced.matches) message('已减少动态，可用单步观测。')
}
startObservatory()
