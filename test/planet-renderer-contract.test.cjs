const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

class FakeEventTarget {
  constructor () { this.listeners = new Map() }
  addEventListener (type, handler) {
    const handlers = this.listeners.get(type) || []
    handlers.push(handler)
    this.listeners.set(type, handlers)
  }
  removeEventListener (type, handler) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(candidate => candidate !== handler))
  }
  dispatch (type, event = {}) {
    for (const handler of [...(this.listeners.get(type) || [])]) handler({ type, ...event })
  }
  listenerCount (type) { return (this.listeners.get(type) || []).length }
}

class FakeObserver {
  constructor (callback, registry) { this.callback = callback; this.disconnected = false; registry.push(this) }
  observe (target) { this.target = target }
  disconnect () { this.disconnected = true }
  trigger (entries) { if (!this.disconnected) this.callback(entries, this) }
}

class FakeMediaQuery extends FakeEventTarget {
  constructor (media, matches) { super(); this.media = media; this.matches = matches }
  setMatches (matches) {
    if (Boolean(matches) === this.matches) return
    this.matches = Boolean(matches)
    this.dispatch('change', { matches: this.matches, media: this.media })
  }
  addListener (handler) { this.addEventListener('change', handler) }
  removeListener (handler) { this.removeEventListener('change', handler) }
}

function createHarness (options = {}) {
  const state = {
    nextId: 1,
    rafs: new Map(),
    idles: new Map(),
    timers: new Map(),
    sourceCanvases: [],
    outputPutCount: 0,
    sourcePutCount: 0,
    createdImageData: 0,
    documentQueries: 0,
    clock: 0,
    nowValues: [],
    mutationObservers: [],
    intersectionObservers: [],
    resizeObservers: []
  }
  const classes = new Set()
  const scene = {
    classList: {
      add: token => classes.add(token),
      remove: token => classes.delete(token),
      contains: token => classes.has(token)
    }
  }
  const makeContext = kind => ({
    createImageData (width, height) {
      state.createdImageData++
      return { width, height, data: new Uint8ClampedArray(width * height * 4) }
    },
    putImageData () {
      if (kind === 'source') state.sourcePutCount++
      else state.outputPutCount++
    }
  })
  const outputContext = options.outputContext === null ? null : makeContext('output')
  const canvas = {
    clientWidth: options.clientWidth || 344,
    clientHeight: options.clientHeight || 304,
    width: 0,
    height: 0,
    style: {},
    getContext: () => outputContext,
    closest: selector => selector === '#space-scene' ? scene : null
  }
  let exposeAutoCanvas = Boolean(options.autoMount)
  const document = Object.assign(new FakeEventTarget(), {
    hidden: Boolean(options.hidden),
    visibilityState: 'visible',
    getElementById (id) {
      state.documentQueries++
      if (!exposeAutoCanvas) return null
      return id === 'planet-surface' ? canvas : id === 'space-scene' ? scene : null
    },
    createElement (name) {
      assert.equal(name, 'canvas')
      const source = {
        width: 0,
        height: 0,
        getContext: () => options.sourceContext === null ? null : makeContext('source')
      }
      state.sourceCanvases.push(source)
      return source
    }
  })
  const mobileQuery = new FakeMediaQuery('(max-width: 760px)', Boolean(options.mobile))
  const motionQuery = new FakeMediaQuery('(prefers-reduced-motion: reduce)', Boolean(options.reducedMotion))
  const window = Object.assign(new FakeEventTarget(), {
    document,
    FluidPlanetCore: options.core || require('../themes/fluid-particle/source/js/planet-core.js'),
    devicePixelRatio: options.devicePixelRatio || 1,
    innerWidth: options.innerWidth || 1440,
    requestAnimationFrame: options.noRaf ? undefined : callback => { const id = state.nextId++; state.rafs.set(id, callback); return id },
    cancelAnimationFrame: id => state.rafs.delete(id),
    requestIdleCallback: options.noIdle ? undefined : callback => { const id = state.nextId++; state.idles.set(id, callback); return id },
    cancelIdleCallback: id => state.idles.delete(id),
    setTimeout: callback => { const id = state.nextId++; state.timers.set(id, callback); return id },
    clearTimeout: id => state.timers.delete(id),
    getComputedStyle: () => ({ getPropertyValue: name => name === '--planet-equator-angle' ? '-10deg' : '' }),
    matchMedia: query => query === mobileQuery.media ? mobileQuery : motionQuery,
    performance: { now: () => state.nowValues.length ? state.nowValues.shift() : state.clock }
  })
  if (!options.noMutationObserver) window.MutationObserver = class extends FakeObserver {
    constructor (callback) { super(callback, state.mutationObservers) }
  }
  if (!options.noIntersectionObserver) window.IntersectionObserver = class extends FakeObserver {
    constructor (callback) { super(callback, state.intersectionObservers) }
  }
  if (!options.noResizeObserver) window.ResizeObserver = class extends FakeObserver {
    constructor (callback) { super(callback, state.resizeObservers) }
  }
  const source = fs.readFileSync(path.resolve(__dirname, '../themes/fluid-particle/source/js/planet-surface.js'), 'utf8')
  vm.runInNewContext(source, { window, globalThis: window, Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray, Float32Array, Float64Array, Math, Object, Number, Error, TypeError })
  const flush = queue => {
    const entries = [...queue.values()]
    queue.clear()
    entries.forEach(callback => callback({ didTimeout: false, timeRemaining: () => 50 }))
    return entries.length
  }
  const flushRaf = timestamp => {
    state.clock = timestamp
    const callbacks = [...state.rafs.values()]
    state.rafs.clear()
    callbacks.forEach(callback => callback(timestamp))
    return callbacks.length
  }
  const mutateScene = token => {
    if (scene.classList.contains(token)) scene.classList.remove(token)
    else scene.classList.add(token)
    state.mutationObservers.forEach(observer => observer.trigger([{ type: 'attributes', attributeName: 'class', target: scene }]))
  }
  const setIntersection = isIntersecting => state.intersectionObservers.forEach(observer => observer.trigger([{ target: canvas, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 }]))
  const triggerResize = () => state.resizeObservers.forEach(observer => observer.trigger([{ target: canvas, contentRect: { width: canvas.clientWidth, height: canvas.clientHeight } }]))
  const queueDrawCost = cost => state.nowValues.push(state.clock, state.clock + cost)
  const pendingRafs = () => state.rafs.size
  const runCompletedDraws = (count, drawCost) => {
    const initial = window.__planetSurfaceMetrics.snapshot().drawCount
    let callbacks = 0
    while (window.__planetSurfaceMetrics.snapshot().drawCount < initial + count) {
      const index = window.__planetSurfaceMetrics.snapshot().drawCount - initial
      queueDrawCost(typeof drawCost === 'function' ? drawCost(index) : drawCost)
      flushRaf(state.clock + 50)
      callbacks++
      if (callbacks > count * 4 + 10) throw new Error('renderer stalled before completing requested draws')
    }
  }
  exposeAutoCanvas = true
  return {
    state,
    scene,
    canvas,
    window,
    document,
    mobileQuery,
    motionQuery,
    renderer: window.FluidPlanetSurface,
    flushIdle: () => flush(state.idles),
    flushTimers: () => flush(state.timers),
    flushRaf,
    mutateScene,
    setIntersection,
    triggerResize,
    queueDrawCost,
    pendingRafs,
    runCompletedDraws
  }
}

const metricKeys = ['averageDrawMs', 'basePhase', 'canvasHeight', 'canvasWidth', 'drawCount', 'effectiveDpr', 'fallback', 'initialized', 'maxDrawMs', 'over8msPercent', 'p95DrawMs', 'pageVisible', 'qualityLevel', 'redrawFps', 'running', 'visible']

test('mount defers work, builds a detached 1024x512 texture, and reveals only a complete frame', () => {
  const harness = createHarness()
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene })
  assert.equal(lifecycle.snapshot().initialized, false)
  assert.equal(harness.scene.classList.contains('planet-ready'), false)
  assert.equal(harness.state.outputPutCount, 0)
  harness.flushIdle()
  const snapshot = lifecycle.snapshot()
  assert.equal(harness.state.sourceCanvases.length, 1)
  assert.deepEqual([harness.state.sourceCanvases[0].width, harness.state.sourceCanvases[0].height], [1024, 512])
  assert.equal(harness.state.sourcePutCount, 1)
  assert.equal(harness.state.outputPutCount, 1)
  assert.equal(harness.scene.classList.contains('planet-ready'), true)
  assert.equal(snapshot.initialized, true)
  assert.equal(snapshot.running, true)
  assert.deepEqual(Object.keys(snapshot).sort(), metricKeys)
  assert.ok(Object.isFrozen(snapshot))
  assert.equal(typeof harness.window.__planetSurfaceMetrics.snapshot, 'function')
  assert.equal(typeof harness.window.__planetSurfaceMetrics.mark, 'function')
  assert.equal(typeof harness.window.__planetSurfaceMetrics.measureSince, 'function')
  lifecycle.destroy()
})

test('mount is idempotent and destroy permits one clean remount', () => {
  const harness = createHarness()
  const first = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  const second = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  assert.equal(first, second)
  first.destroy()
  const third = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  assert.notEqual(third, first)
  third.destroy()
})

test('destroy hides the completed frame until a remount finishes its own first frame', () => {
  const harness = createHarness()
  const first = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  assert.equal(harness.scene.classList.contains('planet-ready'), true)
  assert.equal(harness.state.outputPutCount, 1)

  first.destroy()
  const second = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  assert.equal(harness.scene.classList.contains('planet-ready'), false)
  assert.equal(second.snapshot().initialized, false)
  assert.equal(harness.state.outputPutCount, 1)

  harness.flushIdle()
  assert.equal(harness.scene.classList.contains('planet-ready'), true)
  assert.equal(harness.state.outputPutCount, 2)
  second.destroy()
})

test('quality state setup is deferred and its failures stay isolated to the planet', async t => {
  await t.test('successful setup starts after mount returns', () => {
    const core = require('../themes/fluid-particle/source/js/planet-core.js')
    let calls = 0
    const harness = createHarness({
      core: { ...core, createQualityState: level => { calls++; return core.createQualityState(level) } }
    })
    const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
    assert.equal(calls, 0)
    assert.equal(lifecycle.snapshot().qualityLevel, 2)
    harness.flushIdle()
    assert.equal(calls, 1)
    assert.equal(lifecycle.snapshot().initialized, true)
    lifecycle.destroy()
  })

  await t.test('failed setup falls back only after the deferred callback', () => {
    let calls = 0
    const harness = createHarness({
      core: { ...require('../themes/fluid-particle/source/js/planet-core.js'), createQualityState: () => { calls++; throw new Error('quality failure') } }
    })
    const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
    assert.equal(calls, 0)
    assert.equal(harness.scene.classList.contains('planet-fallback'), false)
    harness.flushIdle()
    assert.equal(calls, 1)
    assert.equal(harness.scene.classList.contains('planet-fallback'), true)
    assert.equal(lifecycle.snapshot().fallback, true)
    lifecycle.destroy()
  })
})

test('browser auto-mount creates the same single lifecycle returned by a later mount call', () => {
  const harness = createHarness({ autoMount: true })
  assert.equal(harness.state.idles.size, 1)
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene })
  assert.equal(harness.state.idles.size, 1)
  harness.flushIdle()
  assert.equal(lifecycle.snapshot().initialized, true)
  lifecycle.destroy()
})

test('initialization failures isolate the planet and never mutate particle state', async t => {
  for (const [name, options] of [
    ['2d context', { outputContext: null }],
    ['source context', { sourceContext: null }],
    ['animation frame', { noRaf: true }],
    ['quality setup', { core: { ...require('../themes/fluid-particle/source/js/planet-core.js'), createQualityState: () => { throw new Error('quality failure') } } }],
    ['texture generation', { core: { ...require('../themes/fluid-particle/source/js/planet-core.js'), fillTexturePixels: () => { throw new Error('texture failure') } } }],
    ['projection setup', { core: { ...require('../themes/fluid-particle/source/js/planet-core.js'), createSphereMap: () => { throw new Error('projection failure') } } }]
  ]) {
    await t.test(name, () => {
      const harness = createHarness(options)
      const particleSentinel = Object.freeze({ qualityLevel: 2 })
      harness.window.__fluidParticleMetrics = particleSentinel
      const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
      harness.flushIdle()
      assert.equal(harness.scene.classList.contains('planet-fallback'), true)
      assert.equal(harness.scene.classList.contains('particle-fallback'), false)
      assert.equal(harness.scene.classList.contains('planet-ready'), false)
      assert.equal(harness.window.__fluidParticleMetrics, particleSentinel)
      assert.equal(lifecycle.snapshot().fallback, true)
      assert.doesNotThrow(() => lifecycle.destroy())
    })
  }
})

test('a missing target Canvas returns an isolated no-op fallback without throwing', () => {
  const harness = createHarness()
  const lifecycle = harness.renderer.mount(null, { scene: harness.scene })
  assert.equal(harness.scene.classList.contains('planet-fallback'), true)
  assert.equal(harness.scene.classList.contains('particle-fallback'), false)
  assert.equal(lifecycle.snapshot().fallback, true)
  assert.doesNotThrow(() => lifecycle.destroy())
})

test('timer fallback performs one complete frame when idle callbacks are unavailable', () => {
  const harness = createHarness({ noIdle: true })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene })
  assert.equal(harness.state.timers.size, 1)
  harness.flushTimers()
  assert.equal(harness.state.outputPutCount, 1)
  assert.equal(lifecycle.snapshot().initialized, true)
  lifecycle.destroy()
})

test('planet metrics are a read-only frozen diagnostics API', () => {
  const harness = createHarness()
  const descriptor = Object.getOwnPropertyDescriptor(harness.window, '__planetSurfaceMetrics')
  assert.equal(typeof descriptor.get, 'function')
  assert.equal(descriptor.set, undefined)
  assert.equal(descriptor.configurable, false)
  assert.equal(Reflect.set(harness.window, '__planetSurfaceMetrics', {}), false)
  assert.ok(Object.isFrozen(harness.window.__planetSurfaceMetrics))
  assert.deepEqual(Object.keys(harness.window.__planetSurfaceMetrics).sort(), ['mark', 'measureSince', 'snapshot'])
})

test('all blockers compose and clearing only one never resumes the renderer', () => {
  const harness = createHarness({ textureWidth: 64, textureHeight: 32 })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  assert.equal(harness.pendingRafs(), 1)
  harness.mutateScene('motion-paused')
  harness.setIntersection(false)
  assert.equal(harness.pendingRafs(), 0)
  harness.mutateScene('motion-paused')
  assert.equal(harness.pendingRafs(), 0)
  harness.setIntersection(true)
  assert.equal(harness.pendingRafs(), 1)
  harness.mutateScene('particle-fallback')
  assert.equal(harness.pendingRafs(), 0)
  assert.equal(harness.scene.classList.contains('planet-fallback'), false)
  harness.mutateScene('particle-fallback')
  assert.equal(harness.pendingRafs(), 1)
  lifecycle.destroy()
})

test('resume establishes a timestamp before advancing the preserved unwrapped phase', () => {
  const harness = createHarness({ textureWidth: 64, textureHeight: 32 })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  harness.flushRaf(1000)
  harness.flushRaf(1040)
  const beforePause = lifecycle.snapshot().basePhase
  harness.mutateScene('motion-paused')
  harness.mutateScene('motion-paused')
  harness.flushRaf(500000)
  assert.equal(lifecycle.snapshot().basePhase, beforePause)
  harness.flushRaf(500040)
  const expected = beforePause + 40 / 70000 * Math.PI * 2
  assert.ok(Math.abs(lifecycle.snapshot().basePhase - expected) < 1e-9)
  lifecycle.destroy()
})

test('a zero RAF timestamp is a valid priming timestamp rather than a sentinel', () => {
  const harness = createHarness({ textureWidth: 64, textureHeight: 32 })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  const initialDrawCount = lifecycle.snapshot().drawCount
  harness.flushRaf(0)
  harness.flushRaf(40)
  assert.equal(lifecycle.snapshot().drawCount, initialDrawCount + 1)
  assert.ok(Math.abs(lifecycle.snapshot().basePhase - 40 / 70000 * Math.PI * 2) < 1e-9)
  lifecycle.destroy()
})

test('visibility and reduced motion each block live animation without catch-up', () => {
  const harness = createHarness({ textureWidth: 64, textureHeight: 32 })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  harness.document.hidden = true
  harness.document.dispatch('visibilitychange')
  assert.equal(harness.pendingRafs(), 0)
  harness.document.hidden = false
  harness.document.dispatch('visibilitychange')
  assert.equal(harness.pendingRafs(), 1)
  const puts = harness.state.outputPutCount
  harness.motionQuery.setMatches(true)
  assert.equal(harness.state.outputPutCount, puts + 1)
  assert.equal(harness.pendingRafs(), 0)
  harness.motionQuery.setMatches(false)
  assert.equal(harness.pendingRafs(), 1)
  lifecycle.destroy()
})

test('offscreen state stops animation until the intersection observer reports visibility', () => {
  const harness = createHarness({ textureWidth: 64, textureHeight: 32 })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  harness.setIntersection(false)
  assert.equal(lifecycle.snapshot().visible, false)
  assert.equal(harness.pendingRafs(), 0)
  harness.setIntersection(true)
  assert.equal(lifecycle.snapshot().visible, true)
  assert.equal(harness.pendingRafs(), 1)
  lifecycle.destroy()
})

test('760 is mobile, 768 is desktop, and rounded-equal resizes do not rebuild projection', () => {
  const harness = createHarness({ mobile: true, innerWidth: 760, clientWidth: 300, textureWidth: 64, textureHeight: 32 })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  assert.equal(lifecycle.snapshot().effectiveDpr <= 1.25, true)
  const imageCount = harness.state.createdImageData
  harness.canvas.clientWidth = 301
  harness.triggerResize()
  harness.flushRaf(10)
  assert.equal(harness.state.createdImageData, imageCount)
  harness.canvas.clientWidth = 340
  harness.triggerResize()
  harness.flushRaf(20)
  assert.ok(harness.state.createdImageData > imageCount)
  harness.mobileQuery.setMatches(false)
  harness.flushRaf(30)
  assert.equal(lifecycle.snapshot().effectiveDpr <= 1.5, true)
  assert.equal(lifecycle.snapshot().qualityLevel, 2)
  lifecycle.destroy()
})

test('renderer ignores warmup then maps quality ordinal without touching particle metrics', () => {
  const harness = createHarness({ textureWidth: 64, textureHeight: 32 })
  const sentinel = Object.freeze({ snapshot: () => Object.freeze({ qualityLevel: 2 }) })
  Object.defineProperty(harness.window, '__fluidParticleMetrics', { value: sentinel, writable: false })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  harness.runCompletedDraws(119, 5)
  assert.equal(lifecycle.snapshot().qualityLevel, 2)
  harness.runCompletedDraws(120, 5)
  assert.equal(lifecycle.snapshot().qualityLevel, 1)
  assert.equal(harness.window.__fluidParticleMetrics, sentinel)
  const drawCountBeforeCadenceProbe = lifecycle.snapshot().drawCount
  const cadenceStart = harness.state.clock
  harness.flushRaf(cadenceStart + 40)
  assert.equal(lifecycle.snapshot().drawCount, drawCountBeforeCadenceProbe)
  harness.flushRaf(cadenceStart + 42)
  assert.equal(lifecycle.snapshot().drawCount, drawCountBeforeCadenceProbe + 1)
  harness.mobileQuery.setMatches(true)
  harness.flushRaf(harness.state.clock + 50)
  assert.equal(lifecycle.snapshot().qualityLevel, 1)
  assert.ok(lifecycle.snapshot().canvasWidth <= 288)
  lifecycle.destroy()
})

test('breakpoint cadence changes even when rounded backing dimensions remain equal', () => {
  const harness = createHarness({ clientWidth: 300, textureWidth: 64, textureHeight: 32 })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  harness.flushRaf(1000)
  harness.flushRaf(1040)
  const draws = lifecycle.snapshot().drawCount
  harness.mobileQuery.setMatches(true)
  harness.flushRaf(1050)
  assert.equal(lifecycle.snapshot().canvasWidth, 304)
  harness.flushRaf(1089)
  assert.equal(lifecycle.snapshot().drawCount, draws)
  harness.flushRaf(1090)
  assert.equal(lifecycle.snapshot().drawCount, draws + 1)
  lifecycle.destroy()
})

test('read-only measurement markers summarize exactly the selected successful draws', () => {
  const harness = createHarness({ textureWidth: 64, textureHeight: 32 })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  const metrics = harness.window.__planetSurfaceMetrics
  const marker = metrics.mark()
  harness.runCompletedDraws(20, index => index === 7 ? 9 : 2)
  const sample = metrics.measureSince(marker)
  assert.equal(sample.complete, true)
  assert.equal(sample.drawCount, 20)
  assert.equal(sample.averageDrawMs, 2.35)
  assert.equal(sample.p95DrawMs, 2)
  assert.equal(sample.maxDrawMs, 9)
  assert.equal(sample.over8msPercent, 5)
  assert.ok(Object.isFrozen(sample))
  assert.equal(lifecycle.snapshot().drawCount >= 21, true)
  lifecycle.destroy()
})

test('measurement markers older than the 1024-entry draw history are incomplete', () => {
  const harness = createHarness({ textureWidth: 64, textureHeight: 32 })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  const marker = harness.window.__planetSurfaceMetrics.mark()
  harness.runCompletedDraws(1025, 2)
  assert.equal(harness.window.__planetSurfaceMetrics.measureSince(marker).complete, false)
  lifecycle.destroy()
})

test('destroy cancels every callback, listener, and owned observer', () => {
  const harness = createHarness({ textureWidth: 64, textureHeight: 32 })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  lifecycle.destroy()
  assert.equal(harness.pendingRafs(), 0)
  assert.equal(harness.document.listenerCount('visibilitychange'), 0)
  assert.equal(harness.motionQuery.listenerCount('change'), 0)
  assert.equal(harness.mobileQuery.listenerCount('change'), 0)
  assert.ok(harness.state.mutationObservers.every(observer => observer.disconnected))
  assert.ok(harness.state.intersectionObservers.every(observer => observer.disconnected))
  assert.ok(harness.state.resizeObservers.every(observer => observer.disconnected))
})

test('an animation-time render failure freezes only the planet and is never uncaught', () => {
  const realCore = require('../themes/fluid-particle/source/js/planet-core.js')
  let renderCalls = 0
  const core = {
    ...realCore,
    renderProjectedFrame (...args) {
      renderCalls++
      if (renderCalls > 1) throw new Error('animation render failure')
      return realCore.renderProjectedFrame(...args)
    }
  }
  const harness = createHarness({ core, textureWidth: 64, textureHeight: 32 })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  harness.flushRaf(1000)
  assert.doesNotThrow(() => harness.flushRaf(1050))
  assert.equal(lifecycle.snapshot().fallback, true)
  assert.equal(harness.scene.classList.contains('planet-fallback'), true)
  assert.equal(harness.scene.classList.contains('particle-fallback'), false)
  assert.equal(harness.pendingRafs(), 0)
  lifecycle.destroy()
})

test('an animation-time phase failure freezes only the planet and is never uncaught', () => {
  const realCore = require('../themes/fluid-particle/source/js/planet-core.js')
  const harness = createHarness({
    core: { ...realCore, advanceBasePhase: () => { throw new Error('phase failure') } },
    textureWidth: 64,
    textureHeight: 32
  })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  harness.flushRaf(1000)
  assert.doesNotThrow(() => harness.flushRaf(1050))
  assert.equal(lifecycle.snapshot().fallback, true)
  assert.equal(harness.pendingRafs(), 0)
  lifecycle.destroy()
})

test('resize work stays latched while hidden and is coalesced after visibility returns', () => {
  const harness = createHarness({ textureWidth: 64, textureHeight: 32 })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  const imageCount = harness.state.createdImageData
  harness.document.hidden = true
  harness.document.dispatch('visibilitychange')
  harness.canvas.clientWidth = 400
  harness.triggerResize()
  assert.equal(harness.pendingRafs(), 0)
  assert.equal(harness.state.createdImageData, imageCount)
  harness.document.hidden = false
  harness.document.dispatch('visibilitychange')
  assert.equal(harness.pendingRafs(), 2)
  harness.flushRaf(50)
  assert.ok(harness.state.createdImageData > imageCount)
  lifecycle.destroy()
})

test('resize work stays latched while offscreen and is coalesced after intersection returns', () => {
  const harness = createHarness({ textureWidth: 64, textureHeight: 32 })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  const imageCount = harness.state.createdImageData
  harness.setIntersection(false)
  harness.canvas.clientWidth = 400
  harness.triggerResize()
  assert.equal(harness.pendingRafs(), 0)
  assert.equal(harness.state.createdImageData, imageCount)
  harness.setIntersection(true)
  assert.equal(harness.pendingRafs(), 2)
  harness.flushRaf(50)
  assert.ok(harness.state.createdImageData > imageCount)
  lifecycle.destroy()
})

test('missing required mutation observation falls back while optional observer gaps remain safe', () => {
  const required = createHarness({ noMutationObserver: true })
  const failed = required.renderer.mount(required.canvas, { scene: required.scene, textureWidth: 64, textureHeight: 32 })
  required.flushIdle()
  assert.equal(failed.snapshot().fallback, true)
  assert.equal(required.scene.classList.contains('particle-fallback'), false)
  failed.destroy()

  const optional = createHarness({ noIntersectionObserver: true, noResizeObserver: true })
  const live = optional.renderer.mount(optional.canvas, { scene: optional.scene, textureWidth: 64, textureHeight: 32 })
  optional.flushIdle()
  assert.equal(live.snapshot().fallback, false)
  optional.window.dispatch('resize')
  optional.flushRaf(50)
  assert.equal(live.snapshot().visible, true)
  live.destroy()
})

test('hot redraw helpers avoid allocating or querying DOM', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../themes/fluid-particle/source/js/planet-surface.js'), 'utf8')
  const render = source.slice(source.indexOf('function renderFrame'), source.indexOf('function onMutation'))
  const draw = source.slice(source.indexOf('function drawCurrentFrame'), source.indexOf('function rebuildProjection'))
  for (const forbidden of ['new ', 'createElement', 'createImageData', 'getContext', 'getComputedStyle', 'querySelector', 'setTimeout']) {
    assert.equal(render.includes(forbidden), false, `renderFrame contains ${forbidden}`)
    assert.equal(draw.includes(forbidden), false, `drawCurrentFrame contains ${forbidden}`)
  }
  assert.equal(/=\s*\[/.test(render) || /=\s*\[/.test(draw), false)
  assert.equal(/=\s*\{/.test(render) || /=\s*\{/.test(draw), false)
})
