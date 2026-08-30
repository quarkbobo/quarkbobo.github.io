const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '..')
const built = relative => fs.readFileSync(path.join(root, 'public', relative), 'utf8')
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

class FakeClassList {
  constructor () {
    this.values = new Set()
  }

  add (...tokens) {
    for (const token of tokens) this.values.add(token)
  }

  contains (token) {
    return this.values.has(token)
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
    elapsedSeconds: [],
    qualityFrameMs: [],
    drawFrames: []
  }
  const window = new FakeEventTarget()
  const document = new FakeEventTarget()

  function makeContext () {
    const context = {
      clearRect () { state.drawFrames.push({ trailSegments: 0 }) },
      setTransform () {},
      beginPath () {},
      moveTo () {},
      lineTo () {
        const frame = state.drawFrames[state.drawFrames.length - 1]
        if (frame) frame.trailSegments++
      },
      stroke () {},
      fillRect () {},
      drawImage () { state.drawImageCount++ },
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
      style: {},
      parentElement: scene,
      classList: new FakeClassList(),
      getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
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
  window.matchMedia = query => ({
    matches: query.includes('prefers-reduced-motion')
      ? Boolean(options.reducedMotion)
      : query.includes('pointer: coarse') && Boolean(options.coarsePointer)
  })
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
  vm.runInContext(built('js/particle-core.js'), context, { filename: 'public/js/particle-core.js' })

  if (options.recordElapsed) {
    const realCore = window.FluidParticleCore
    window.FluidParticleCore = {
      ...realCore,
      advancePhase (phase, elapsedSeconds, lifetimeSeconds) {
        state.elapsedSeconds.push(elapsedSeconds)
        return realCore.advancePhase(phase, elapsedSeconds, lifetimeSeconds)
      },
      nextQuality (qualityState, frameMs) {
        state.qualityFrameMs.push(frameMs)
        return realCore.nextQuality(qualityState, frameMs)
      }
    }
  }
  if (options.missingCore) delete window.FluidParticleCore

  vm.runInContext(built('js/particle-flow.js'), context, { filename: 'public/js/particle-flow.js' })

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
    renderer: window.FluidParticleRenderer,
    state,
    makeCanvas,
    flushIdle,
    flushTimers,
    flushRaf,
    pendingRafs: () => state.rafs.size
  }
}

test('the generated home owns one particle canvas and inner pages load no scene assets', () => {
  // Duplicating the scene or leaking it onto a post would violate the one-canvas, home-only boundary.
  const home = built('index.html')
  const post = built(path.join('个人博客', 'Hello-World', 'index.html'))

  assert.equal(occurrences(home, 'id="particle-flow"'), 1)
  assert.equal(occurrences(home, '<script src="/js/particle-core.js" defer></script>'), 1)
  assert.equal(occurrences(home, '<script src="/js/particle-flow.js" defer></script>'), 1)
  assert.equal(occurrences(home, '<link rel="stylesheet" href="/css/space-scene.css">'), 1)
  assert.equal(occurrences(post, 'particle-flow'), 0)
  assert.equal(occurrences(post, 'space-scene.css'), 0)
  assert.equal(occurrences(post, 'particle-core.js'), 0)
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
  assert.equal(harness.document.listenerCount('visibilitychange'), 1)

  const second = harness.renderer.mount(harness.makeCanvas())
  harness.flushIdle()
  assert.equal(harness.state.gradientCount, gradientsAfterWarmup)
  assert.equal(harness.state.createdCanvases, canvasesAfterWarmup)
  second.destroy()
  lifecycle.destroy()

  assert.equal(harness.window.listenerCount('pointermove'), 0)
  assert.equal(harness.window.listenerCount('resize'), 0)
  assert.equal(harness.document.listenerCount('visibilitychange'), 0)
  assert.equal(harness.pendingRafs(), 0)
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
})
