const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '..')
const built = relative => fs.readFileSync(path.join(root, 'public', relative), 'utf8')
const themeAsset = relative => fs.readFileSync(path.join(root, 'themes', 'fluid-particle', 'source', relative), 'utf8')
const metricKeys = ['averageFrameMs', 'dpr', 'fps', 'layerCounts', 'longFramePercent', 'particleCount', 'qualityLevel']
const layerRatios = { dust: 0.84, glint: 0.13, streak: 0.03 }

const assertLayerQuota = snapshot => {
  const { layerCounts, particleCount } = snapshot
  assert.ok(Object.isFrozen(layerCounts))
  assert.deepEqual(Object.keys(layerCounts).sort(), ['dust', 'glint', 'streak'])
  assert.equal(layerCounts.dust + layerCounts.glint + layerCounts.streak, particleCount)
  for (const [layer, ratio] of Object.entries(layerRatios)) {
    assert.ok(
      Math.abs(layerCounts[layer] - particleCount * ratio) <= 1,
      `${particleCount} ${layer}: ${layerCounts[layer]}`
    )
  }
}

const circularDistance = (left, right) => {
  const distance = Math.abs(left - right) % 1
  return Math.min(distance, 1 - distance)
}

const circularCenter = particles => {
  const vector = particles.reduce((sum, particle) => {
    const angle = particle.phase * Math.PI * 2
    sum.x += Math.cos(angle)
    sum.y += Math.sin(angle)
    return sum
  }, { x: 0, y: 0 })
  const angle = Math.atan2(vector.y, vector.x) / (Math.PI * 2)
  return angle < 0 ? angle + 1 : angle
}

const glintGroups = particles => {
  const glints = particles.filter(particle => particle.layer === 'glint')
  const pending = new Set(glints.map((_, index) => index))
  const groups = []

  while (pending.size) {
    const first = pending.values().next().value
    pending.delete(first)
    const queue = [first]
    const component = []
    while (queue.length) {
      const currentIndex = queue.pop()
      const current = glints[currentIndex]
      component.push(current)
      for (const candidateIndex of [...pending]) {
        const candidate = glints[candidateIndex]
        const companions = current.band === candidate.band &&
          circularDistance(current.phase, candidate.phase) <= 0.025 &&
          Math.abs(current.lifetime - candidate.lifetime) <= 0.15
        if (companions) {
          pending.delete(candidateIndex)
          queue.push(candidateIndex)
        }
      }
    }
    groups.push(component)
  }
  return groups
}

const assertGlintGrouping = (pool, particleCount, expectedGlints) => {
  const active = pool.filter(particle => particle.index < particleCount)
  const glints = active.filter(particle => particle.layer === 'glint')
  const groups = glintGroups(active)
  assert.equal(glints.length, expectedGlints, `${particleCount} particle glint quota`)
  assert.ok(groups.length >= 1, `${particleCount} particle groups`)

  for (const group of groups) {
    assert.ok(group.length >= 2 && group.length <= 4, `${particleCount} group size ${group.length}`)
    assert.equal(new Set(group.map(particle => particle.band)).size, 1, `${particleCount} group orbit`)
    for (let left = 0; left < group.length; left++) {
      for (let right = left + 1; right < group.length; right++) {
        assert.ok(circularDistance(group[left].phase, group[right].phase) <= 0.025, `${particleCount} group phase`)
        assert.ok(Math.abs(group[left].lifetime - group[right].lifetime) <= 0.15, `${particleCount} group lifetime`)
      }
    }
  }

  for (let left = 0; left < groups.length; left++) {
    for (let right = left + 1; right < groups.length; right++) {
      if (groups[left][0].band !== groups[right][0].band) continue
      assert.ok(
        circularDistance(circularCenter(groups[left]), circularCenter(groups[right])) >= 0.04,
        `${particleCount} groups share phase space`
      )
    }
  }
}

const screenDistance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y)

const assertGlintScreenGeometry = (pool, draws, particleCount, viewport) => {
  const active = pool.filter(particle => particle.index < particleCount)
  const groups = glintGroups(active)
  const maximumGroupSpan = Math.min(viewport.width, viewport.height) * 0.07
  let renderedGroupCount = 0

  for (const [groupIndex, group] of groups.entries()) {
    const rendered = group.map(particle => draws.get(particle.index))
    if (rendered.every(draw => !draw)) continue
    assert.equal(rendered.every(Boolean), true, `${viewport.label} group is fully rendered`)
    renderedGroupCount++
    let minimumCenterDistance = Infinity
    let groupSpan = 0
    for (let left = 0; left < rendered.length; left++) {
      for (let right = left + 1; right < rendered.length; right++) {
        const distance = screenDistance(rendered[left], rendered[right])
        const minimumVisibleSeparation = (rendered[left].size + rendered[right].size) * 0.42
        minimumCenterDistance = Math.min(minimumCenterDistance, distance)
        groupSpan = Math.max(groupSpan, distance)
        assert.ok(
          distance >= minimumVisibleSeparation,
          `${viewport.label} group ${groupIndex} centers ${distance.toFixed(2)}px for ${minimumVisibleSeparation.toFixed(2)}px sprites`
        )
      }
    }
    assert.ok(Number.isFinite(minimumCenterDistance), `${viewport.label} group has a center-distance sample`)
    assert.ok(
      groupSpan <= maximumGroupSpan,
      `${viewport.label} group ${groupIndex} spans ${groupSpan.toFixed(2)}px (max ${maximumGroupSpan.toFixed(2)}px)`
    )
  }
  assert.ok(renderedGroupCount > 0, `${viewport.label} renders at least one complete glint group`)
}

const occurrences = (value, needle) => {
  let count = 0
  let cursor = 0
  while ((cursor = value.indexOf(needle, cursor)) !== -1) {
    count++
    cursor += needle.length
  }
  return count
}

class FakeEventTarget {
  constructor () {
    this.listeners = new Map()
  }

  addEventListener (type, handler, options) {
    const listeners = this.listeners.get(type) || []
    listeners.push({ handler, options })
    this.listeners.set(type, listeners)
  }

  removeEventListener (type, handler) {
    const listeners = this.listeners.get(type) || []
    this.listeners.set(type, listeners.filter(listener => listener.handler !== handler))
  }

  dispatch (type, event = {}) {
    const listeners = [...(this.listeners.get(type) || [])]
    for (const listener of listeners) listener.handler({ type, ...event })
  }

  listenerCount (type) {
    return (this.listeners.get(type) || []).length
  }

  listenerOptions (type) {
    return (this.listeners.get(type) || []).map(listener => listener.options)
  }
}

class FakeMediaQueryList extends FakeEventTarget {
  constructor (media, matches) {
    super()
    this.media = media
    this.matches = Boolean(matches)
  }

  setMatches (matches) {
    const next = Boolean(matches)
    if (next === this.matches) return
    this.matches = next
    this.dispatch('change', { matches: next, media: this.media })
  }

  addListener (handler) {
    this.addEventListener('change', handler)
  }

  removeListener (handler) {
    this.removeEventListener('change', handler)
  }
}

class FakeClassList {
  constructor () {
    this.values = new Set()
  }

  add (...tokens) {
    for (const token of tokens) this.values.add(token)
  }

  remove (...tokens) {
    for (const token of tokens) this.values.delete(token)
  }

  toggle (token, force) {
    if (force) this.values.add(token)
    else this.values.delete(token)
    return Boolean(force)
  }

  contains (token) {
    return this.values.has(token)
  }
}

class FakeControl extends FakeEventTarget {
  constructor () {
    super()
    this.attributes = new Map([
      ['aria-pressed', 'false'],
      ['aria-controls', 'space-scene']
    ])
    this.textContent = '暂停背景动态'
  }

  getAttribute (name) {
    return this.attributes.get(name) ?? null
  }

  setAttribute (name, value) {
    this.attributes.set(name, value)
  }
}

function createHarness (options = {}) {
  const state = {
    nextId: 1,
    rafs: new Map(),
    idles: new Map(),
    timers: new Map(),
    createdCanvases: 0,
    gradientCount: 0,
    drawImageCount: 0,
    shadowBlurWrites: 0,
    documentQueries: 0,
    boundsReads: 0,
    positionCalls: 0,
    positionCallsWithoutOutput: 0,
    positionOutputs: new Set(),
    elapsedSeconds: [],
    qualityFrameMs: [],
    drawFrames: []
  }
  const window = new FakeEventTarget()
  const document = new FakeEventTarget()

  function makeContext () {
    const context = {
      clearRect () {
        state.drawFrames.push({
          trailSegments: 0,
          maxPointerMagnitude: 0,
          pointerX: 0,
          pointerY: 0,
          strokes: [],
          particles: new Map(),
          draws: new Map(),
          positionedParticleIndex: -1
        })
      },
      setTransform () {},
      beginPath () {},
      moveTo () {},
      lineTo () {
        const frame = state.drawFrames[state.drawFrames.length - 1]
        if (frame) frame.trailSegments++
      },
      stroke () {
        const frame = state.drawFrames[state.drawFrames.length - 1]
        if (frame) frame.strokes.push({ alpha: context.globalAlpha, style: context.strokeStyle })
      },
      fillRect () {},
      drawImage (sprite, left, top, width, height) {
        state.drawImageCount++
        const frame = state.drawFrames[state.drawFrames.length - 1]
        if (frame && options.recordParticles && frame.positionedParticleIndex >= 0) {
          frame.draws.set(frame.positionedParticleIndex, {
            x: left + width / 2,
            y: top + height / 2,
            size: Math.max(width, height),
            alpha: context.globalAlpha
          })
        }
      },
      createRadialGradient () {
        state.gradientCount++
        return { addColorStop () {} }
      }
    }
    Object.defineProperty(context, 'shadowBlur', {
      set () { state.shadowBlurWrites++ }
    })
    return context
  }

  function makeCanvas (canvasOptions = {}) {
    const width = canvasOptions.width || options.width || 1000
    const height = canvasOptions.height || options.height || 600
    const context = makeContext()
    const scene = { classList: new FakeClassList() }
    return {
      width: 0,
      height: 0,
      clientWidth: width,
      clientHeight: height,
      _boundsLeft: canvasOptions.left || 0,
      _boundsTop: canvasOptions.top || 0,
      style: {},
      parentElement: scene,
      classList: new FakeClassList(),
      getBoundingClientRect () {
        state.boundsReads++
        return {
          left: this._boundsLeft,
          top: this._boundsTop,
          width: this.clientWidth,
          height: this.clientHeight
        }
      },
      getContext: () => canvasOptions.contextAvailable === false || options.contextAvailable === false ? null : context,
      _context: context,
      _scene: scene
    }
  }

  document.hidden = false
  document.readyState = 'complete'
  document.getElementById = () => {
    state.documentQueries++
    return null
  }
  document.querySelector = () => {
    throw new Error('render loop queried the DOM')
  }
  document.createElement = tagName => {
    assert.equal(tagName, 'canvas')
    state.createdCanvases++
    return makeCanvas({ width: 40, height: 40 })
  }

  window.document = document
  window.devicePixelRatio = options.dpr || 2
  window.innerWidth = options.width || 1000
  const motionQuery = new FakeMediaQueryList(
    '(prefers-reduced-motion: reduce)',
    options.reducedMotion
  )
  const coarsePointerQuery = new FakeMediaQueryList('(pointer: coarse)', options.coarsePointer)
  window.matchMedia = query => query.includes('prefers-reduced-motion')
    ? motionQuery
    : coarsePointerQuery
  window.performance = { now: () => 0 }
  window.setTimeout = callback => {
    const id = state.nextId++
    state.timers.set(id, callback)
    return id
  }
  window.clearTimeout = id => state.timers.delete(id)

  if (options.hasAnimationFrame !== false) {
    window.requestAnimationFrame = callback => {
      const id = state.nextId++
      state.rafs.set(id, callback)
      return id
    }
    window.cancelAnimationFrame = id => state.rafs.delete(id)
  }
  if (options.hasIdleCallback !== false) {
    window.requestIdleCallback = callback => {
      const id = state.nextId++
      state.idles.set(id, callback)
      return id
    }
    window.cancelIdleCallback = id => state.idles.delete(id)
  }

  const guardedMath = Object.create(Math)
  guardedMath.random = () => { throw new Error('Math.random used by renderer') }
  const context = vm.createContext({ window, document, console, Math: guardedMath })
  vm.runInContext(themeAsset(path.join('js', 'particle-core.js')), context, {
    filename: 'themes/fluid-particle/source/js/particle-core.js'
  })

  if (options.recordElapsed || options.recordPointer || options.recordParticles || options.recordPositionOutputs) {
    const realCore = window.FluidParticleCore
    window.FluidParticleCore = {
      ...realCore,
      advancePhase (phase, elapsedSeconds, lifetimeSeconds) {
        if (options.recordElapsed) state.elapsedSeconds.push(elapsedSeconds)
        return realCore.advancePhase(phase, elapsedSeconds, lifetimeSeconds)
      },
      nextQuality (qualityState, frameMs) {
        if (options.recordElapsed) state.qualityFrameMs.push(frameMs)
        return realCore.nextQuality(qualityState, frameMs)
      },
      positionParticle (particle, phase, viewport, pointer, output) {
        const frame = state.drawFrames[state.drawFrames.length - 1]
        if (frame && options.recordPointer) {
          frame.maxPointerMagnitude = Math.max(frame.maxPointerMagnitude, Math.hypot(pointer.x, pointer.y))
          frame.pointerX = pointer.x
          frame.pointerY = pointer.y
        }
        if (frame && options.recordParticles) {
          frame.particles.set(particle.index, particle)
          frame.positionedParticleIndex = particle.index
        }
        if (options.recordPositionOutputs) {
          state.positionCalls++
          if (output) state.positionOutputs.add(output)
          else state.positionCallsWithoutOutput++
        }
        return realCore.positionParticle(particle, phase, viewport, pointer, output)
      }
    }
  }
  if (options.missingCore) delete window.FluidParticleCore

  vm.runInContext(themeAsset(path.join('js', 'particle-flow.js')), context, {
    filename: 'themes/fluid-particle/source/js/particle-flow.js'
  })

  const flushIdle = () => {
    const callbacks = [...state.idles.values()]
    state.idles.clear()
    for (const callback of callbacks) callback({ didTimeout: false, timeRemaining: () => 50 })
  }
  const flushTimers = () => {
    const callbacks = [...state.timers.values()]
    state.timers.clear()
    for (const callback of callbacks) callback()
  }
  const flushRaf = timestamp => {
    const callbacks = [...state.rafs.values()]
    state.rafs.clear()
    for (const callback of callbacks) callback(timestamp)
    return callbacks.length
  }

  return {
    window,
    document,
    motionQuery,
    renderer: window.FluidParticleRenderer,
    state,
    makeCanvas,
    flushIdle,
    flushTimers,
    flushRaf,
    pendingRafs: () => state.rafs.size
  }
}

test('the generated home owns the approved particle and planet canvases while inner pages load no scene assets', () => {
  const home = built('index.html')
  const post = built(path.join('个人博客', 'Hello-World', 'index.html'))
  assert.equal(occurrences(home, 'id="particle-flow"'), 1)
  assert.equal(occurrences(home, 'id="planet-surface"'), 1)
  assert.equal(occurrences(home, 'id="cursor-comet"'), 1)
  assert.equal(occurrences(home, 'class="cursor-comet__segment"'), 8)
  assert.equal(occurrences(home, '<canvas'), 2)
  assert.equal(occurrences(home, '<script src="/js/particle-core.js" defer></script>'), 1)
  assert.equal(occurrences(home, '<script src="/js/particle-flow.js" defer></script>'), 1)
  assert.equal(occurrences(home, '<script src="/js/planet-core.js" defer></script>'), 1)
  assert.equal(occurrences(home, '<script src="/js/planet-surface.js" defer></script>'), 1)
  assert.equal(occurrences(home, '<script src="/js/cursor-comet-core.js" defer></script>'), 1)
  assert.equal(occurrences(home, '<script src="/js/cursor-comet.js" defer></script>'), 1)
  assert.equal(occurrences(home, '<link rel="stylesheet" href="/css/space-scene.css">'), 1)
  assert.equal(occurrences(post, '<canvas'), 0)
  assert.equal(occurrences(post, 'space-scene.css'), 0)
  assert.equal(occurrences(post, 'particle-core.js'), 0)
  assert.equal(occurrences(post, 'particle-flow.js'), 0)
  assert.equal(occurrences(post, 'planet-core.js'), 0)
  assert.equal(occurrences(post, 'planet-surface.js'), 0)
  assert.equal(occurrences(post, 'cursor-comet'), 0)
  const sceneScriptOrder = ['particle-core.js', 'particle-flow.js', 'planet-core.js', 'planet-surface.js', 'cursor-comet-core.js', 'cursor-comet.js']
    .map(name => home.indexOf(`/js/${name}`))
  assert.ok(sceneScriptOrder.every(index => index >= 0))
  assert.deepEqual(sceneScriptOrder, [...sceneScriptOrder].sort((left, right) => left - right))
})

test('mount defers initialization and exposes a frozen read-only metrics snapshot', () => {
  // Eager particle allocation or a writable diagnostics global would break startup and foreground verification.
  const harness = createHarness()
  const canvas = harness.makeCanvas()
  const lifecycle = harness.renderer.mount(canvas)

  assert.equal(lifecycle.snapshot().particleCount, 0)
  assert.equal(harness.pendingRafs(), 0)
  harness.flushIdle()

  const snapshot = lifecycle.snapshot()
  assert.deepEqual(Object.keys(snapshot).sort(), metricKeys)
  assert.equal(snapshot.particleCount, 320)
  assert.equal(snapshot.qualityLevel, 2)
  assert.ok(Object.isFrozen(snapshot))
  assert.ok(Object.isFrozen(snapshot.layerCounts))
  assert.ok(Object.isFrozen(harness.window.__fluidParticleMetrics))
  assert.equal(typeof harness.window.__fluidParticleMetrics.snapshot, 'function')
  assert.deepEqual(harness.window.__fluidParticleMetrics.snapshot(), snapshot)

  const descriptor = Object.getOwnPropertyDescriptor(harness.window, '__fluidParticleMetrics')
  assert.equal(typeof descriptor.get, 'function')
  assert.equal(descriptor.set, undefined)
  assert.equal(descriptor.configurable, false)
  assert.equal(Reflect.set(harness.window, '__fluidParticleMetrics', {}), false)
  lifecycle.destroy()
})

test('motion control pauses and resumes both the renderer state and its visible label', () => {
  // A label-only toggle would leave the continuous Canvas running or report the wrong pressed state.
  const harness = createHarness()
  const canvas = harness.makeCanvas()
  const control = new FakeControl()
  const lifecycle = harness.renderer.mount(canvas, { motionToggle: control })
  harness.flushIdle()

  assert.equal(control.listenerCount('click'), 1)
  assert.equal(harness.pendingRafs(), 1)
  control.dispatch('click')
  assert.equal(control.getAttribute('aria-pressed'), 'true')
  assert.equal(control.textContent, '继续背景动态')
  assert.equal(canvas._scene.classList.contains('motion-paused'), true)
  assert.equal(harness.pendingRafs(), 0)

  control.dispatch('click')
  assert.equal(control.getAttribute('aria-pressed'), 'false')
  assert.equal(control.textContent, '暂停背景动态')
  assert.equal(canvas._scene.classList.contains('motion-paused'), false)
  assert.equal(harness.pendingRafs(), 1)

  lifecycle.destroy()
  assert.equal(control.listenerCount('click'), 0)
})

test('app initialization reuses one renderer and one listener per global event type', () => {
  // Mounting twice must not duplicate window/document work for the single app-wide scene.
  const harness = createHarness()
  const first = harness.renderer.mount(harness.makeCanvas())
  const second = harness.renderer.mount(harness.makeCanvas())

  assert.equal(second, first)
  assert.equal(harness.window.listenerCount('resize'), 1)
  assert.equal(harness.window.listenerCount('scroll'), 1)
  assert.equal(harness.window.listenerCount('pointermove'), 1)
  assert.equal(harness.document.listenerCount('visibilitychange'), 1)
  first.destroy()

  const third = harness.renderer.mount(harness.makeCanvas())
  assert.notEqual(third, first)
  assert.equal(harness.window.listenerCount('resize'), 1)
  assert.equal(harness.window.listenerCount('scroll'), 1)
  assert.equal(harness.document.listenerCount('visibilitychange'), 1)
  third.destroy()
})

test('destroyed lifecycle handles cannot mutate a newly mounted scene', () => {
  // A stale handle must not pause the shared button while the replacement renderer keeps animating.
  const harness = createHarness()
  const canvas = harness.makeCanvas()
  const control = new FakeControl()
  const oldLifecycle = harness.renderer.mount(canvas, { motionToggle: control })
  harness.flushIdle()
  oldLifecycle.destroy()

  const destroyedSnapshot = oldLifecycle.snapshot()
  const newLifecycle = harness.renderer.mount(canvas, { motionToggle: control })
  harness.flushIdle()
  const assertNewSceneIsRunning = () => {
    assert.equal(harness.pendingRafs(), 1)
    assert.equal(control.getAttribute('aria-pressed'), 'false')
    assert.equal(control.textContent, '暂停背景动态')
    assert.equal(canvas._scene.classList.contains('motion-paused'), false)
    assert.equal(control.listenerCount('click'), 1)
    assert.equal(harness.window.listenerCount('resize'), 1)
    assert.equal(harness.document.listenerCount('visibilitychange'), 1)
  }

  assertNewSceneIsRunning()
  oldLifecycle.stop()
  assertNewSceneIsRunning()
  oldLifecycle.start()
  assertNewSceneIsRunning()
  oldLifecycle.destroy()
  assertNewSceneIsRunning()
  assert.deepEqual(oldLifecycle.snapshot(), destroyedSnapshot)

  newLifecycle.destroy()
})

test('mount falls back without Canvas, the particle core, or animation frames', async t => {
  // Any missing required API must hide only the Canvas while preserving the CSS Saturn scene.
  const cases = [
    ['2d context', { contextAvailable: false }],
    ['particle core', { missingCore: true }],
    ['animation frame', { hasAnimationFrame: false }]
  ]

  for (const [name, options] of cases) {
    await t.test(name, () => {
      const harness = createHarness(options)
      const canvas = harness.makeCanvas(options)
      const lifecycle = harness.renderer.mount(canvas)

      assert.equal(canvas._scene.classList.contains('particle-fallback'), true)
      assert.deepEqual(Object.keys(lifecycle.snapshot()).sort(), metricKeys)
      assert.doesNotThrow(() => lifecycle.start())
      assert.doesNotThrow(() => lifecycle.stop())
      assert.doesNotThrow(() => lifecycle.destroy())
      assert.equal(harness.pendingRafs(), 0)
    })
  }
})

test('visibility pauses animation and resumes with a reset timestamp', () => {
  // Retaining the hidden-tab timestamp would advance particles by the whole background interval.
  const harness = createHarness({ recordElapsed: true })
  const lifecycle = harness.renderer.mount(harness.makeCanvas())
  harness.flushIdle()
  harness.flushRaf(100)
  harness.flushRaf(116)

  harness.document.hidden = true
  harness.document.dispatch('visibilitychange')
  assert.equal(harness.pendingRafs(), 0)

  harness.document.hidden = false
  harness.document.dispatch('visibilitychange')
  assert.equal(harness.pendingRafs(), 1)
  harness.flushRaf(5000)
  harness.flushRaf(5016)

  assert.ok(harness.state.elapsedSeconds.length > 0)
  assert.ok(Math.max(...harness.state.elapsedSeconds) <= 0.0160000001)
  lifecycle.destroy()
})

test('reduced motion draws a fixed particle field without starting animation', () => {
  // Scheduling a continuous frame in reduced-motion mode would ignore the visitor's motion preference.
  const harness = createHarness({ reducedMotion: true })
  const lifecycle = harness.renderer.mount(harness.makeCanvas())
  harness.flushIdle()

  assert.equal(harness.pendingRafs(), 0)
  assert.ok(harness.state.drawImageCount > 0)
  lifecycle.start()
  assert.equal(harness.pendingRafs(), 0)
  lifecycle.destroy()
})

test('live reduced-motion changes switch immediately and preserve requested and visible running state', () => {
  // Keeping only the mount-time media-query value would animate after the preference changes or restart while paused/hidden.
  const harness = createHarness()
  const lifecycle = harness.renderer.mount(harness.makeCanvas())
  harness.flushIdle()

  assert.equal(harness.motionQuery.listenerCount('change'), 1)
  assert.equal(harness.pendingRafs(), 1)
  const drawsBeforeReduce = harness.state.drawFrames.length
  harness.motionQuery.setMatches(true)
  assert.equal(harness.pendingRafs(), 0)
  assert.equal(lifecycle.snapshot().particleCount, 36)
  assert.equal(lifecycle.snapshot().qualityLevel, 0)
  assert.ok(harness.state.drawFrames.length > drawsBeforeReduce, 'static field draws immediately')

  harness.motionQuery.setMatches(false)
  assert.equal(lifecycle.snapshot().particleCount, 320)
  assert.equal(lifecycle.snapshot().qualityLevel, 2)
  assert.equal(harness.pendingRafs(), 1)

  lifecycle.stop()
  harness.motionQuery.setMatches(true)
  harness.motionQuery.setMatches(false)
  assert.equal(harness.pendingRafs(), 0, 'an explicit stop survives preference restoration')
  lifecycle.start()
  assert.equal(harness.pendingRafs(), 1)

  harness.document.hidden = true
  harness.document.dispatch('visibilitychange')
  harness.motionQuery.setMatches(true)
  harness.motionQuery.setMatches(false)
  assert.equal(harness.pendingRafs(), 0, 'a hidden document does not restart')
  harness.document.hidden = false
  harness.document.dispatch('visibilitychange')
  assert.equal(harness.pendingRafs(), 1)

  lifecycle.destroy()
  assert.equal(harness.motionQuery.listenerCount('change'), 0)
  const drawsAfterDestroy = harness.state.drawFrames.length
  harness.motionQuery.setMatches(true)
  assert.equal(harness.pendingRafs(), 0)
  assert.equal(harness.state.drawFrames.length, drawsAfterDestroy)
})

test('a paused resize repaints one static frame without restarting animation', () => {
  // Resizing the backing store clears the visible canvas, so a stopped renderer must repaint without scheduling motion.
  const harness = createHarness({ width: 1280, height: 720 })
  const canvas = harness.makeCanvas()
  const lifecycle = harness.renderer.mount(canvas)
  harness.flushIdle()
  harness.flushRaf(100)
  lifecycle.stop()

  const clearsBeforeResize = harness.state.drawFrames.length
  const drawsBeforeResize = harness.state.drawImageCount
  canvas.clientWidth = 1200
  canvas.clientHeight = 760
  harness.window.innerWidth = 1200
  harness.window.dispatch('resize')
  assert.equal(harness.pendingRafs(), 1, 'resize work is queued once')
  harness.flushRaf(116)

  assert.ok(harness.state.drawFrames.length > clearsBeforeResize, 'resize clears then repaints a frame')
  assert.ok(harness.state.drawImageCount > drawsBeforeResize, 'particles redraw after the clear')
  assert.equal(harness.pendingRafs(), 0, 'the paused renderer stays stopped')
  lifecycle.destroy()
})

test('paused reduced-motion restoration repaints one static frame without restarting animation', () => {
  // Leaving reduced motion changes the particle budget; while explicitly stopped it still needs one replacement frame.
  const harness = createHarness()
  const lifecycle = harness.renderer.mount(harness.makeCanvas())
  harness.flushIdle()
  harness.flushRaf(100)
  lifecycle.stop()
  harness.motionQuery.setMatches(true)

  const clearsBeforeRestore = harness.state.drawFrames.length
  const drawsBeforeRestore = harness.state.drawImageCount
  harness.motionQuery.setMatches(false)

  assert.ok(harness.state.drawFrames.length > clearsBeforeRestore, 'restoration clears then repaints a frame')
  assert.ok(harness.state.drawImageCount > drawsBeforeRestore, 'restored-budget particles redraw after the clear')
  assert.equal(harness.pendingRafs(), 0, 'the paused renderer stays stopped')
  assert.equal(lifecycle.snapshot().particleCount, 320)
  lifecycle.destroy()
})

test('DPR is capped, coarse pointers use the mobile cap, and resize work is coalesced', async t => {
  // Unbounded backing stores or one resize frame per event would cause avoidable memory and layout work.
  await t.test('desktop cap and coalesced resize', () => {
    const harness = createHarness({ dpr: 3, width: 1000, height: 600 })
    const canvas = harness.makeCanvas()
    const lifecycle = harness.renderer.mount(canvas)
    harness.flushIdle()

    assert.equal(canvas.width, 1500)
    assert.equal(canvas.height, 900)
    assert.equal(lifecycle.snapshot().dpr, 1.5)
    lifecycle.stop()
    harness.window.dispatch('resize')
    harness.window.dispatch('resize')
    harness.window.dispatch('resize')
    assert.equal(harness.pendingRafs(), 1)
    harness.flushRaf(10)
    lifecycle.destroy()
  })

  await t.test('mobile cap and disabled pointer input', () => {
    const harness = createHarness({ dpr: 3, coarsePointer: true, width: 390, height: 700 })
    const canvas = harness.makeCanvas()
    const lifecycle = harness.renderer.mount(canvas)
    harness.flushIdle()

    assert.equal(canvas.width, 488)
    assert.equal(canvas.height, 875)
    assert.equal(lifecycle.snapshot().dpr, 1.25)
    assert.equal(harness.window.listenerCount('pointermove'), 0)
    lifecycle.destroy()
  })

  await t.test('narrow viewport disables pointer input and cuts the high-quality budget in half', () => {
    const desktop = createHarness({ dpr: 3, width: 1000, height: 700 })
    const desktopLifecycle = desktop.renderer.mount(desktop.makeCanvas())
    desktop.flushIdle()

    const mobile = createHarness({ dpr: 3, width: 320, height: 740 })
    const mobileLifecycle = mobile.renderer.mount(mobile.makeCanvas())
    mobile.flushIdle()

    assert.equal(mobileLifecycle.snapshot().dpr, 1.25)
    assert.equal(mobile.window.listenerCount('pointermove'), 0)
    assert.ok(mobileLifecycle.snapshot().particleCount <= desktopLifecycle.snapshot().particleCount * 0.55)
    assert.equal(mobileLifecycle.snapshot().particleCount, 160)
    desktopLifecycle.destroy()
    mobileLifecycle.destroy()
  })
})

test('desktop to mobile resize applies mobile rendering and zeroes pointer displacement', () => {
  // Keeping the mount-time desktop policy would overdraw the narrow viewport and retain pointer bending.
  const harness = createHarness({ dpr: 3, width: 1280, height: 720, recordPointer: true })
  const canvas = harness.makeCanvas()
  const lifecycle = harness.renderer.mount(canvas)
  harness.flushIdle()

  harness.window.dispatch('pointermove', { clientX: 1280, clientY: 720 })
  harness.flushRaf(100)
  harness.flushRaf(116)
  assert.ok(harness.state.drawFrames.at(-1).maxPointerMagnitude > 0)

  lifecycle.stop()
  harness.window.innerWidth = 390
  canvas.clientWidth = 390
  canvas.clientHeight = 700
  harness.window.dispatch('resize')
  assert.equal(harness.pendingRafs(), 1)
  harness.flushRaf(200)

  const mobile = lifecycle.snapshot()
  assert.equal(mobile.particleCount, 160)
  assert.equal(mobile.layerCounts.dust, 134)
  assert.equal(mobile.layerCounts.glint, 21)
  assert.equal(mobile.layerCounts.streak, 5)
  assert.equal(mobile.dpr, 1.25)
  assert.equal(canvas.width, 488)
  assert.equal(harness.window.listenerCount('pointermove'), 0)

  const mobileFrameStart = harness.state.drawFrames.length
  harness.window.dispatch('pointermove', { clientX: 390, clientY: 700 })
  lifecycle.start()
  harness.flushRaf(216)
  harness.flushRaf(232)
  const mobileFrames = harness.state.drawFrames.slice(mobileFrameStart)
  assert.ok(mobileFrames.length >= 2)
  assert.ok(mobileFrames.every(frame => frame.maxPointerMagnitude === 0))
  lifecycle.destroy()
})

test('mobile to desktop resize restores desktop rendering and pointer displacement', () => {
  // Keeping the mount-time mobile pool would leave a widened viewport sparse and permanently non-interactive.
  const harness = createHarness({ dpr: 3, width: 390, height: 700, recordPointer: true })
  const canvas = harness.makeCanvas()
  const lifecycle = harness.renderer.mount(canvas)
  harness.flushIdle()
  lifecycle.stop()

  harness.window.innerWidth = 1280
  canvas.clientWidth = 1280
  canvas.clientHeight = 720
  harness.window.dispatch('resize')
  assert.equal(harness.pendingRafs(), 1)
  harness.flushRaf(100)

  const desktop = lifecycle.snapshot()
  assert.equal(desktop.particleCount, 320)
  assert.equal(desktop.layerCounts.dust, 269)
  assert.equal(desktop.layerCounts.glint, 42)
  assert.equal(desktop.layerCounts.streak, 9)
  assert.equal(desktop.dpr, 1.5)
  assert.equal(canvas.width, 1920)
  assert.equal(harness.window.listenerCount('pointermove'), 1)

  harness.window.dispatch('pointermove', { clientX: 1280, clientY: 720 })
  lifecycle.start()
  harness.flushRaf(116)
  harness.flushRaf(132)
  assert.ok(harness.state.drawFrames.at(-1).maxPointerMagnitude > 0)
  lifecycle.destroy()
})

test('repeated breakpoint crossings keep one pointer listener and destroy removes it', () => {
  // Attaching on every desktop resize would accumulate handlers and make pointer displacement multiply over time.
  const harness = createHarness({ dpr: 3, width: 1280, height: 720 })
  const canvas = harness.makeCanvas()
  const lifecycle = harness.renderer.mount(canvas)
  harness.flushIdle()
  lifecycle.stop()

  let timestamp = 100
  for (const width of [390, 1280, 390, 1280, 390, 1280]) {
    harness.window.innerWidth = width
    canvas.clientWidth = width
    harness.window.dispatch('resize')
    assert.equal(harness.pendingRafs(), 1)
    harness.flushRaf(timestamp)
    timestamp += 16
    assert.equal(harness.window.listenerCount('pointermove'), width < 768 ? 0 : 1)
  }

  lifecycle.destroy()
  assert.equal(harness.window.listenerCount('pointermove'), 0)
  assert.equal(harness.pendingRafs(), 0)
})

test('breakpoint resize preserves the current quality level and switches its policy budget', () => {
  // Hard-coding only the high-quality 160/320 budgets would break adaptive level 1 after a resize.
  const harness = createHarness({ dpr: 3, width: 1280, height: 720 })
  const canvas = harness.makeCanvas()
  const lifecycle = harness.renderer.mount(canvas)
  harness.flushIdle()

  let timestamp = 100
  harness.flushRaf(timestamp)
  for (let frame = 0; frame < 120; frame++) {
    timestamp += 20
    harness.flushRaf(timestamp)
  }
  assert.equal(lifecycle.snapshot().qualityLevel, 1)
  assert.equal(lifecycle.snapshot().particleCount, 210)
  lifecycle.stop()

  harness.window.innerWidth = 390
  canvas.clientWidth = 390
  harness.window.dispatch('resize')
  harness.flushRaf(timestamp + 16)
  const mobile = lifecycle.snapshot()
  assert.equal(mobile.qualityLevel, 1)
  assert.equal(mobile.particleCount, 110)
  assert.equal(mobile.layerCounts.dust, 93)
  assert.equal(mobile.layerCounts.glint, 14)
  assert.equal(mobile.layerCounts.streak, 3)

  harness.window.innerWidth = 1280
  canvas.clientWidth = 1280
  harness.window.dispatch('resize')
  harness.flushRaf(timestamp + 32)
  const desktop = lifecycle.snapshot()
  assert.equal(desktop.qualityLevel, 1)
  assert.equal(desktop.particleCount, 210)
  assert.equal(desktop.layerCounts.dust, 177)
  assert.equal(desktop.layerCounts.glint, 27)
  assert.equal(desktop.layerCounts.streak, 6)
  lifecycle.destroy()
})

test('raw RAF time drives metrics and quality while motion is clamped to 50ms', () => {
  // Passing the clamped delta to metrics or quality would hide a real 200ms foreground stall.
  const harness = createHarness({ recordElapsed: true })
  const lifecycle = harness.renderer.mount(harness.makeCanvas())
  harness.flushIdle()
  harness.flushRaf(100)
  harness.flushRaf(300)

  assert.ok(Math.max(...harness.state.elapsedSeconds) <= 0.0500000001)
  assert.deepEqual(harness.state.qualityFrameMs, [200])
  assert.equal(lifecycle.snapshot().averageFrameMs, 200)
  assert.equal(lifecycle.snapshot().fps, 5)
  assert.equal(lifecycle.snapshot().longFramePercent, 100)
  lifecycle.destroy()
})

test('long-frame metrics count only frames slower than 24ms', () => {
  // Counting 22ms frames would report a different threshold from the foreground performance contract.
  const harness = createHarness()
  const lifecycle = harness.renderer.mount(harness.makeCanvas())
  harness.flushIdle()
  harness.flushRaf(100)
  harness.flushRaf(122)

  assert.equal(lifecycle.snapshot().longFramePercent, 0)

  harness.flushRaf(147)
  assert.equal(lifecycle.snapshot().longFramePercent, 50)
  lifecycle.destroy()
})

test('every desktop quality level keeps an approximately 84/13/3 layer quota', () => {
  // Filtering one finite random sample by index would leave high and lower budgets with biased streak ratios.
  const harness = createHarness()
  const canvas = harness.makeCanvas()
  const lifecycle = harness.renderer.mount(canvas)
  harness.flushIdle()
  assert.equal(lifecycle.snapshot().qualityLevel, 2)
  assertLayerQuota(lifecycle.snapshot())

  let timestamp = 100
  harness.flushRaf(timestamp)
  for (let frame = 0; frame < 120; frame++) {
    timestamp += 20
    harness.flushRaf(timestamp)
  }
  assert.equal(lifecycle.snapshot().qualityLevel, 1)
  assert.equal(lifecycle.snapshot().particleCount, 210)
  assertLayerQuota(lifecycle.snapshot())

  for (let frame = 0; frame < 120; frame++) {
    timestamp += 20
    harness.flushRaf(timestamp)
  }
  assert.equal(lifecycle.snapshot().qualityLevel, 0)
  assert.equal(lifecycle.snapshot().particleCount, 120)
  assert.equal(lifecycle.snapshot().dpr, 1.25)
  assert.equal(canvas.width, 1250)
  assertLayerQuota(lifecycle.snapshot())

  for (let frame = 0; frame < 120; frame++) {
    timestamp += 15
    harness.flushRaf(timestamp)
  }
  assert.equal(lifecycle.snapshot().qualityLevel, 1)
  assert.equal(lifecycle.snapshot().dpr, 1.5)
  assert.equal(canvas.width, 1500)
  lifecycle.destroy()
})

test('quality-budget removals fade out while inactive phases keep advancing through wrap', () => {
  // Skipping a removed particle before phase advancement freezes its orbit and makes later restoration jump backward.
  const harness = createHarness({ recordParticles: true })
  const lifecycle = harness.renderer.mount(harness.makeCanvas())
  harness.flushIdle()

  let timestamp = 100
  harness.flushRaf(timestamp)
  for (let frame = 0; frame < 119; frame++) {
    timestamp += 20
    harness.flushRaf(timestamp)
  }

  assert.equal(lifecycle.snapshot().qualityLevel, 2)
  const fullFrame = harness.state.drawFrames.at(-1)
  const inactivePool = [...fullFrame.particles.values()].filter(particle => particle.index >= 210)
  const fadingParticle = inactivePool.find(particle =>
    particle.layer === 'dust' && particle.phase > 0.2 && particle.phase < 0.75
  )
  const wrappingParticle = inactivePool.reduce((latest, particle) =>
    !latest || particle.phase > latest.phase ? particle : latest
  , null)
  assert.ok(fadingParticle, 'the deterministic inactive prefix contains a mid-orbit dust sample')
  assert.ok(wrappingParticle && wrappingParticle.phase > 0.9, 'the deterministic pool contains a near-wrap sample')

  const fadingPhaseBeforeRemoval = fadingParticle.phase
  const fadingAlphaBeforeRemoval = fullFrame.draws.get(fadingParticle.index).alpha
  let expectedWrappingPhase = wrappingParticle.phase
  let wrapped = false
  const removalAlphas = []

  for (let frame = 0; frame < 3; frame++) {
    timestamp += 20
    harness.flushRaf(timestamp)
    const frameDraw = harness.state.drawFrames.at(-1).draws.get(fadingParticle.index)
    assert.ok(frameDraw, `removed particle remains drawable during fade frame ${frame}`)
    removalAlphas.push(frameDraw.alpha)
    const previousWrappingPhase = expectedWrappingPhase
    expectedWrappingPhase = (expectedWrappingPhase + 0.02 / wrappingParticle.lifetime) % 1
    wrapped = wrapped || expectedWrappingPhase < previousWrappingPhase
    assert.ok(
      Math.abs(wrappingParticle.phase - expectedWrappingPhase) < 1e-12,
      `inactive phase advances on fade frame ${frame}`
    )
  }

  assert.equal(lifecycle.snapshot().qualityLevel, 1)
  assert.equal(lifecycle.snapshot().particleCount, 210)
  assertLayerQuota(lifecycle.snapshot())
  assert.ok(fadingParticle.phase > fadingPhaseBeforeRemoval, 'the removed mid-orbit sample advances')
  assert.ok(removalAlphas[0] > 0 && removalAlphas[0] < fadingAlphaBeforeRemoval)
  assert.ok(removalAlphas[1] > 0 && removalAlphas[1] < removalAlphas[0])
  assert.ok(removalAlphas[2] > 0 && removalAlphas[2] < removalAlphas[1])

  for (let frame = 0; frame < 80 && !wrapped; frame++) {
    const previousPhase = expectedWrappingPhase
    timestamp += 50
    harness.flushRaf(timestamp)
    expectedWrappingPhase = (expectedWrappingPhase + 0.05 / wrappingParticle.lifetime) % 1
    wrapped = expectedWrappingPhase < previousPhase
    assert.ok(
      Math.abs(wrappingParticle.phase - expectedWrappingPhase) < 1e-12,
      `inactive phase stays continuous near wrap frame ${frame}`
    )
  }
  assert.equal(wrapped, true, 'the inactive sample crosses phase wrap during the test')
  lifecycle.destroy()
})

test('restored quality particles fade in over multiple frames while metrics expose the target quota', () => {
  // Restoring a hidden prefix at full alpha in one frame produces a visible quality-switch flash.
  const harness = createHarness({ recordParticles: true })
  const lifecycle = harness.renderer.mount(harness.makeCanvas())
  harness.flushIdle()

  let timestamp = 100
  harness.flushRaf(timestamp)
  const pool = [...harness.state.drawFrames.at(-1).particles.values()]
  for (let frame = 0; frame < 120; frame++) {
    timestamp += 20
    harness.flushRaf(timestamp)
  }
  assert.equal(lifecycle.snapshot().qualityLevel, 1)

  for (let frame = 0; frame < 119; frame++) {
    timestamp += 15
    harness.flushRaf(timestamp)
  }
  assert.equal(lifecycle.snapshot().qualityLevel, 1)
  const restoredParticle = pool.find(particle =>
    particle.index >= 210 && particle.layer === 'dust' && particle.phase > 0.2 && particle.phase < 0.75
  )
  assert.ok(restoredParticle, 'the restored prefix contains a mid-orbit dust sample')

  const restoredAlphas = []
  for (let frame = 0; frame < 3; frame++) {
    timestamp += 15
    harness.flushRaf(timestamp)
    const draw = harness.state.drawFrames.at(-1).draws.get(restoredParticle.index)
    assert.ok(draw, `restored particle is drawable on fade frame ${frame}`)
    restoredAlphas.push(draw.alpha)
  }

  assert.equal(lifecycle.snapshot().qualityLevel, 2)
  assert.equal(lifecycle.snapshot().particleCount, 320)
  assertLayerQuota(lifecycle.snapshot())
  assert.ok(restoredAlphas[0] > 0)
  assert.ok(restoredAlphas[1] > restoredAlphas[0])
  assert.ok(restoredAlphas[2] > restoredAlphas[1])
  lifecycle.destroy()
})

test('mobile-to-desktop additions fade in instead of appearing at full alpha', () => {
  // A running breakpoint expansion must transition the added desktop prefix without changing the reported target budget.
  const harness = createHarness({ width: 390, height: 700, recordParticles: true })
  const canvas = harness.makeCanvas()
  const lifecycle = harness.renderer.mount(canvas)
  harness.flushIdle()

  harness.flushRaf(100)
  harness.window.innerWidth = 1280
  canvas.clientWidth = 1280
  canvas.clientHeight = 720
  harness.window.dispatch('resize')
  harness.flushRaf(116)
  assert.equal(lifecycle.snapshot().particleCount, 320)
  assertLayerQuota(lifecycle.snapshot())

  harness.flushRaf(132)
  const firstDesktopFrame = harness.state.drawFrames.at(-1)
  const addedParticle = [...firstDesktopFrame.particles.values()].find(particle =>
    particle.index >= 160 && particle.layer === 'dust' && particle.phase > 0.2 && particle.phase < 0.75
  )
  assert.ok(addedParticle, 'the added desktop prefix contains a mid-orbit dust sample')
  const addedAlphas = [firstDesktopFrame.draws.get(addedParticle.index).alpha]

  harness.flushRaf(148)
  addedAlphas.push(harness.state.drawFrames.at(-1).draws.get(addedParticle.index).alpha)
  harness.flushRaf(164)
  addedAlphas.push(harness.state.drawFrames.at(-1).draws.get(addedParticle.index).alpha)

  assert.ok(addedAlphas[0] > 0)
  assert.ok(addedAlphas[1] > addedAlphas[0])
  assert.ok(addedAlphas[2] > addedAlphas[1])
  lifecycle.destroy()
})

test('every supported particle prefix keeps deterministic two-to-four glint groups with readable screen geometry', () => {
  // Metadata-only phase checks miss sprites that overlap or split across opposite ends when member phases wrap.
  const capture = viewport => {
    const harness = createHarness({ recordParticles: true, width: viewport.width, height: viewport.height })
    const lifecycle = harness.renderer.mount(harness.makeCanvas())
    harness.flushIdle()
    const frames = []
    for (let frameIndex = 0; frameIndex < 120; frameIndex++) {
      harness.flushRaf(100 + frameIndex * 16)
      const frame = harness.state.drawFrames.at(-1)
      frames.push({
        pool: [...frame.particles.values()]
          .sort((left, right) => left.index - right.index)
          .map(particle => ({
            index: particle.index,
            layer: particle.layer,
            band: particle.band,
            phase: particle.phase,
            lifetime: particle.lifetime,
            size: particle.size,
            jitter: particle.jitter,
            wave: particle.wave
          })),
        draws: new Map(frame.draws)
      })
    }
    lifecycle.destroy()
    return frames
  }

  const desktopViewport = { label: '1280x720 desktop/320', width: 1280, height: 720 }
  const mobileViewport = { label: '390x700 mobile/160', width: 390, height: 700 }
  const first = capture(desktopViewport)
  const second = capture(desktopViewport)
  const mobile = capture(mobileViewport)
  assert.deepEqual(first, second)
  assert.equal(first[0].pool.length, 320)
  assert.equal(mobile[0].pool.length, 160)
  assert.equal(first[0].pool.every(particle =>
    Number.isFinite(particle.size) && Number.isFinite(particle.jitter) && Number.isFinite(particle.wave)
  ), true, 'screen geometry retains the generated size, jitter, and wave inputs')

  const budgets = [
    [24, 3],
    [36, 5],
    [70, 9],
    [110, 14],
    [120, 16],
    [160, 21],
    [210, 27],
    [320, 42]
  ]
  for (const [particleCount, expectedGlints] of budgets) {
    assertGlintGrouping(first[0].pool, particleCount, expectedGlints)
  }
  for (let frameIndex = 0; frameIndex < first.length; frameIndex++) {
    assertGlintScreenGeometry(mobile[frameIndex].pool, mobile[frameIndex].draws, 160, {
      ...mobileViewport,
      label: `${mobileViewport.label} frame ${frameIndex}`
    })
    assertGlintScreenGeometry(first[frameIndex].pool, first[frameIndex].draws, 320, {
      ...desktopViewport,
      label: `${desktopViewport.label} frame ${frameIndex}`
    })
  }
})

test('quality removals keep fading streak trails instead of cutting them off', () => {
  // Fading only the streak sprite would leave its line to disappear one frame earlier than the particle.
  const harness = createHarness({ recordParticles: true })
  const lifecycle = harness.renderer.mount(harness.makeCanvas())
  harness.flushIdle()

  let timestamp = 100
  harness.flushRaf(timestamp)
  for (let frame = 0; frame < 89; frame++) {
    timestamp += 50
    harness.flushRaf(timestamp)
  }
  for (let frame = 0; frame < 30; frame++) {
    timestamp += 1
    harness.flushRaf(timestamp)
  }
  assert.equal(lifecycle.snapshot().qualityLevel, 2)

  timestamp += 20
  harness.flushRaf(timestamp)
  const transitionFrame = harness.state.drawFrames.at(-1)
  const transitionStreaks = [...transitionFrame.particles.values()].filter(particle =>
    particle.layer === 'streak' &&
    transitionFrame.draws.has(particle.index) &&
    particle.phase > 0.055 &&
    particle.streakSlot % 6 < 2
  )
  const removedTrails = transitionStreaks.filter(particle => particle.index >= 210)
  assert.ok(removedTrails.length > 0, 'the deterministic burst includes a removed streak trail')
  assert.equal(lifecycle.snapshot().qualityLevel, 1)
  assert.equal(transitionFrame.trailSegments, transitionStreaks.length, 'removed streak lines remain during fade')
  assert.ok(transitionFrame.strokes.some(stroke => {
    const fullAlpha = stroke.style.includes('103, 234, 255') ? 0.82 * 0.7 : 0.76 * 0.7
    return stroke.alpha > 0 && stroke.alpha < fullAlpha
  }), 'at least one retained trail stroke uses its fading particle opacity')
  lifecycle.destroy()
})

test('mobile-to-desktop streak trails share the added particles fade-in alpha', () => {
  // A dim new streak sprite with a full-bright trail would still flash at a running breakpoint expansion.
  const harness = createHarness({ width: 390, height: 700, recordParticles: true })
  const canvas = harness.makeCanvas()
  const lifecycle = harness.renderer.mount(canvas)
  harness.flushIdle()

  let timestamp = 100
  harness.flushRaf(timestamp)
  for (let frame = 0; frame < 101; frame++) {
    timestamp += 50
    harness.flushRaf(timestamp)
  }
  assert.equal(lifecycle.snapshot().qualityLevel, 2)

  harness.window.innerWidth = 1280
  canvas.clientWidth = 1280
  canvas.clientHeight = 720
  harness.window.dispatch('resize')
  timestamp += 16
  harness.flushRaf(timestamp)
  timestamp += 16
  harness.flushRaf(timestamp)

  const firstDesktopFrame = harness.state.drawFrames.at(-1)
  const addedTrails = [...firstDesktopFrame.particles.values()].filter(particle =>
    particle.index >= 160 &&
    particle.layer === 'streak' &&
    firstDesktopFrame.draws.has(particle.index) &&
    particle.phase > 0.055 &&
    (particle.streakSlot - 6 + 9) % 9 < 2
  )
  assert.ok(addedTrails.length > 0, 'the deterministic burst includes an added desktop streak trail')
  assert.equal(lifecycle.snapshot().particleCount, 320)
  assert.ok(firstDesktopFrame.strokes.some(stroke => {
    const fullAlpha = stroke.style.includes('103, 234, 255') ? 0.82 * 0.7 : 0.76 * 0.7
    return stroke.alpha > 0 && stroke.alpha < fullAlpha
  }), 'at least one new trail stroke starts below full alpha')
  lifecycle.destroy()
})

test('streak trails have deterministic quiet intervals and sparse burst frames', () => {
  // Drawing every streak line on every frame would turn the rare high-energy layer into constant visual noise.
  const harness = createHarness()
  const lifecycle = harness.renderer.mount(harness.makeCanvas())
  harness.flushIdle()

  let timestamp = 100
  harness.flushRaf(timestamp)
  for (let frame = 0; frame < 520; frame++) {
    timestamp += 16
    harness.flushRaf(timestamp)
  }

  const frames = harness.state.drawFrames.slice(1)
  const trailCounts = frames.map(frame => frame.trailSegments)
  let quietRun = 0
  let longestQuietRun = 0
  for (const count of trailCounts) {
    quietRun = count === 0 ? quietRun + 1 : 0
    longestQuietRun = Math.max(longestQuietRun, quietRun)
  }

  assert.ok(trailCounts.some(count => count > 0), 'a complete cycle includes a trail burst')
  assert.ok(longestQuietRun >= 60, `longest quiet run: ${longestQuietRun}`)
  assert.ok(Math.max(...trailCounts) <= 2, `max simultaneous trails: ${Math.max(...trailCounts)}`)
  assert.ok(Math.max(...trailCounts) < lifecycle.snapshot().layerCounts.streak)
  lifecycle.destroy()
})

test('the hot loop reuses sprites and destroy removes every owned listener and callback', () => {
  // Recreating gradients/sprites or retaining listeners per frame would violate the renderer's hot-loop contract.
  const harness = createHarness()
  const lifecycle = harness.renderer.mount(harness.makeCanvas())
  harness.flushIdle()
  const gradientsAfterWarmup = harness.state.gradientCount
  const canvasesAfterWarmup = harness.state.createdCanvases
  const queriesAfterBoot = harness.state.documentQueries

  assert.equal(gradientsAfterWarmup, 2)
  assert.equal(canvasesAfterWarmup, 2)
  const pointerOptions = harness.window.listenerOptions('pointermove')
  assert.equal(pointerOptions.length, 1)
  assert.equal(pointerOptions[0].passive, true)
  for (let frame = 0; frame < 8; frame++) harness.flushRaf(100 + frame * 16)

  assert.equal(harness.state.gradientCount, gradientsAfterWarmup)
  assert.equal(harness.state.createdCanvases, canvasesAfterWarmup)
  assert.equal(harness.state.shadowBlurWrites, 0)
  assert.equal(harness.state.documentQueries, queriesAfterBoot)
  assert.equal(harness.window.listenerCount('pointermove'), 1)
  assert.equal(harness.window.listenerCount('resize'), 1)
  assert.equal(harness.window.listenerCount('scroll'), 1)
  assert.equal(harness.document.listenerCount('visibilitychange'), 1)

  const second = harness.renderer.mount(harness.makeCanvas())
  harness.flushIdle()
  assert.equal(harness.state.gradientCount, gradientsAfterWarmup)
  assert.equal(harness.state.createdCanvases, canvasesAfterWarmup)
  second.destroy()
  lifecycle.destroy()

  assert.equal(harness.window.listenerCount('pointermove'), 0)
  assert.equal(harness.window.listenerCount('resize'), 0)
  assert.equal(harness.window.listenerCount('scroll'), 0)
  assert.equal(harness.document.listenerCount('visibilitychange'), 0)
  assert.equal(harness.pendingRafs(), 0)
})

test('pointer events use cached bounds and the hot loop reuses two position outputs', () => {
  // Reading bounds in an active render frame or omitting scratch outputs would scale layout/allocation work with input and particles.
  const harness = createHarness({ recordPointer: true, recordPositionOutputs: true })
  const lifecycle = harness.renderer.mount(harness.makeCanvas())
  harness.flushIdle()
  const initialBoundsReads = harness.state.boundsReads
  assert.equal(initialBoundsReads, 1, 'initial resize caches one canvas bound')

  for (let index = 0; index < 20; index++) {
    harness.window.dispatch('pointermove', { clientX: 800 + index, clientY: 500 + index })
  }
  assert.equal(harness.state.boundsReads, initialBoundsReads, 'pointer handler performs no layout read')
  harness.flushRaf(100)
  assert.equal(harness.state.boundsReads, initialBoundsReads, 'an active render frame performs no layout read')

  for (let index = 0; index < 10; index++) {
    harness.window.dispatch('pointermove', { clientX: 900 + index, clientY: 550 + index })
  }
  assert.equal(harness.state.boundsReads, initialBoundsReads)
  harness.flushRaf(116)
  assert.equal(harness.state.boundsReads, initialBoundsReads)
  assert.ok(harness.state.drawFrames.at(-1).maxPointerMagnitude > 0)

  let timestamp = 116
  for (let frame = 0; frame < 92; frame++) {
    timestamp += 50
    harness.flushRaf(timestamp)
  }

  assert.ok(harness.state.positionCalls > lifecycle.snapshot().particleCount)
  assert.equal(harness.state.positionCallsWithoutOutput, 0)
  assert.equal(harness.state.positionOutputs.size, 2)
  assert.equal(harness.state.boundsReads, initialBoundsReads, 'steady animation never re-reads bounds')
  lifecycle.destroy()
})

test('scroll and resize coalesce one bounds refresh and keep a stationary pointer canvas-relative', () => {
  // A cached client-to-canvas transform must be invalidated when scrolling moves the canvas under a stationary pointer.
  const harness = createHarness({ recordPointer: true })
  const canvas = harness.makeCanvas()
  const lifecycle = harness.renderer.mount(canvas)
  harness.flushIdle()

  assert.equal(harness.window.listenerCount('scroll'), 1)
  harness.window.dispatch('pointermove', { clientX: 1000, clientY: 300 })
  let timestamp = 100
  harness.flushRaf(timestamp)
  for (let frame = 0; frame < 12; frame++) {
    timestamp += 50
    harness.flushRaf(timestamp)
  }
  const pointerBeforeScroll = harness.state.drawFrames.at(-1).pointerX
  assert.ok(pointerBeforeScroll > 7, `pointer settles near the right edge: ${pointerBeforeScroll}`)

  const readsBeforeRefresh = harness.state.boundsReads
  const pendingBeforeRefresh = harness.pendingRafs()
  canvas._boundsLeft = 500
  for (let event = 0; event < 20; event++) {
    harness.window.dispatch('scroll')
    harness.window.dispatch('resize')
  }
  assert.equal(harness.state.boundsReads, readsBeforeRefresh, 'event handlers perform no synchronous layout read')
  assert.equal(harness.pendingRafs(), pendingBeforeRefresh + 1, 'scroll and resize share one refresh frame')

  timestamp += 50
  harness.flushRaf(timestamp)
  assert.equal(harness.state.boundsReads, readsBeforeRefresh + 1, 'the merged refresh reads bounds once')
  for (let frame = 0; frame < 12; frame++) {
    timestamp += 50
    harness.flushRaf(timestamp)
  }
  const pointerAfterScroll = harness.state.drawFrames.at(-1).pointerX
  assert.ok(
    Math.abs(pointerAfterScroll) < Math.abs(pointerBeforeScroll) * 0.1,
    `stationary pointer is recomputed against moved bounds: ${pointerAfterScroll}`
  )

  lifecycle.destroy()
  assert.equal(harness.window.listenerCount('scroll'), 0)
})

test('requestIdleCallback falls back to a deferred timer', () => {
  // Browsers without idle callbacks must still defer particle allocation instead of initializing eagerly.
  const harness = createHarness({ hasIdleCallback: false })
  const lifecycle = harness.renderer.mount(harness.makeCanvas())

  assert.equal(lifecycle.snapshot().particleCount, 0)
  assert.equal(harness.state.timers.size, 1)
  harness.flushTimers()
  assert.equal(lifecycle.snapshot().particleCount, 320)
  assert.equal(harness.pendingRafs(), 1)
  lifecycle.destroy()
})

test('destroy cancels initialization and coalesced resize work before it runs', async t => {
  // A callback that outlives the renderer can allocate particles or resize a detached Canvas.
  await t.test('pending idle callback', () => {
    const harness = createHarness()
    const lifecycle = harness.renderer.mount(harness.makeCanvas())

    assert.equal(harness.state.idles.size, 1)
    lifecycle.destroy()
    assert.equal(harness.state.idles.size, 0)
    harness.flushIdle()
    assert.equal(lifecycle.snapshot().particleCount, 0)
  })

  await t.test('pending timer fallback', () => {
    const harness = createHarness({ hasIdleCallback: false })
    const lifecycle = harness.renderer.mount(harness.makeCanvas())

    assert.equal(harness.state.timers.size, 1)
    lifecycle.destroy()
    assert.equal(harness.state.timers.size, 0)
    harness.flushTimers()
    assert.equal(lifecycle.snapshot().particleCount, 0)
  })

  await t.test('pending resize frame', () => {
    const harness = createHarness()
    const lifecycle = harness.renderer.mount(harness.makeCanvas())
    harness.flushIdle()
    lifecycle.stop()
    harness.window.dispatch('resize')

    assert.equal(harness.pendingRafs(), 1)
    lifecycle.destroy()
    assert.equal(harness.pendingRafs(), 0)
  })

  await t.test('pending scroll bounds frame', () => {
    const harness = createHarness()
    const lifecycle = harness.renderer.mount(harness.makeCanvas())
    harness.flushIdle()
    lifecycle.stop()
    harness.window.dispatch('scroll')

    assert.equal(harness.pendingRafs(), 1)
    lifecycle.destroy()
    assert.equal(harness.pendingRafs(), 0)
    assert.equal(harness.window.listenerCount('scroll'), 0)
  })
})
