const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

class FakeEventTarget {
  constructor () { this.listeners = new Map() }
  addEventListener (type, handler, options) {
    const registrations = this.listeners.get(type) || []
    registrations.push({ handler, options })
    this.listeners.set(type, registrations)
  }
  removeEventListener (type, handler) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(candidate => candidate.handler !== handler))
  }
  dispatch (type, event = {}) {
    for (const registration of [...(this.listeners.get(type) || [])]) registration.handler({ type, ...event })
  }
  listenerCount (type) { return (this.listeners.get(type) || []).length }
  listenerOptions (type) { return (this.listeners.get(type) || []).map(registration => registration.options) }
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
    createdElements: 0,
    float64Lengths: [],
    clock: 0,
    nowValues: [],
    mutationObservers: [],
    intersectionObservers: [],
    resizeObservers: [],
    boundsReads: 0,
    outputImages: []
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
    putImageData (image) {
      if (kind === 'source') state.sourcePutCount++
      else {
        state.outputPutCount++
        if (options.recordOutputImages) state.outputImages.push(Uint8ClampedArray.from(image.data))
        if (options.outputPutThrowsAfter && state.outputPutCount > options.outputPutThrowsAfter) throw new Error('output put failure')
      }
    }
  })
  const outputContext = options.outputContext === null ? null : makeContext('output')
  const bounds = {
    left: options.bounds && Number.isFinite(options.bounds.left) ? options.bounds.left : 100,
    top: options.bounds && Number.isFinite(options.bounds.top) ? options.bounds.top : 50,
    width: options.bounds && Number.isFinite(options.bounds.width) ? options.bounds.width : (options.clientWidth || 344),
    height: options.bounds && Number.isFinite(options.bounds.height) ? options.bounds.height : (options.clientHeight || 304)
  }
  const canvas = {
    clientWidth: options.clientWidth || 344,
    clientHeight: options.clientHeight || 304,
    width: 0,
    height: 0,
    style: {},
    getContext: () => outputContext,
    getBoundingClientRect: () => { state.boundsReads++; return bounds },
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
      state.createdElements++
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
  const coarseQuery = new FakeMediaQuery('(pointer: coarse)', Boolean(options.coarsePointer))
  const noHoverQuery = new FakeMediaQuery('(hover: none)', Boolean(options.noHover))
  const injectedCore = options.core || require('../themes/fluid-particle/source/js/planet-core.js')
  const harnessCore = options.fixedPhase ? { ...injectedCore, advanceBasePhase: phase => phase } : injectedCore
  const window = Object.assign(new FakeEventTarget(), {
    document,
    FluidPlanetCore: harnessCore,
    devicePixelRatio: options.devicePixelRatio || 1,
    innerWidth: options.innerWidth || 1440,
    requestAnimationFrame: options.noRaf ? undefined : callback => { const id = state.nextId++; state.rafs.set(id, callback); return id },
    cancelAnimationFrame: id => state.rafs.delete(id),
    requestIdleCallback: options.noIdle ? undefined : callback => { const id = state.nextId++; state.idles.set(id, callback); return id },
    cancelIdleCallback: id => state.idles.delete(id),
    setTimeout: callback => { const id = state.nextId++; state.timers.set(id, callback); return id },
    clearTimeout: id => state.timers.delete(id),
    getComputedStyle: () => ({ getPropertyValue: name => name === '--planet-equator-angle' ? '-10deg' : '' }),
    matchMedia: query => query === mobileQuery.media
      ? mobileQuery
      : query === coarseQuery.media
        ? coarseQuery
        : query === noHoverQuery.media ? noHoverQuery : motionQuery,
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
  const source = typeof options.surfaceSource === 'string'
    ? options.surfaceSource
    : fs.readFileSync(path.resolve(__dirname, '../themes/fluid-particle/source/js/planet-surface.js'), 'utf8')
  class TrackedFloat64Array extends Float64Array {
    constructor (...args) {
      super(...args)
      if (args.length === 1 && typeof args[0] === 'number') state.float64Lengths.push(args[0])
    }
  }
  vm.runInNewContext(source, { window, globalThis: window, Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray, Float32Array, Float64Array: TrackedFloat64Array, Math, Object, Number, Error, TypeError })
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
    bounds,
    window,
    document,
    mobileQuery,
    motionQuery,
    coarseQuery,
    noHoverQuery,
    renderer: window.FluidPlanetSurface,
    flushIdle: () => flush(state.idles),
    flushTimers: () => flush(state.timers),
    flushRaf,
    mutateScene,
    setIntersection,
    triggerResize,
    queueDrawCost,
    pendingRafs,
    runCompletedDraws,
    lastOutputImage: () => state.outputImages.at(-1)
  }
}

const metricKeys = ['averageDrawMs', 'basePhase', 'canvasHeight', 'canvasWidth', 'drawCount', 'effectiveDpr', 'fallback', 'initialized', 'maxDrawMs', 'over8msPercent', 'p95DrawMs', 'pageVisible', 'qualityLevel', 'redrawFps', 'running', 'visible']

function imageDelta (image, baseline) {
  let delta = 0
  for (let index = 0; index < image.length; index++) delta += Math.abs(image[index] - baseline[index])
  return delta
}

function dispatchAt (harness, type, normalizedX, normalizedY, event = {}) {
  harness.window.dispatch(type, {
    clientX: harness.bounds.left + (normalizedX + 1) * harness.bounds.width / 2,
    clientY: harness.bounds.top + (normalizedY + 1) * harness.bounds.height / 2,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    ...event
  })
}

test('fine-pointer interaction accepts the planet ellipse and rejects canvas corners', () => {
  const h = createHarness({ recordOutputImages: true, fixedPhase: true, clientWidth: 96, clientHeight: 84 })
  const lifecycle = h.renderer.mount(h.canvas, { scene: h.scene, textureWidth: 64, textureHeight: 32 })
  h.flushIdle()
  const baseline = h.lastOutputImage()
  h.window.dispatch('pointermove', { clientX: h.bounds.left, clientY: h.bounds.top, pointerType: 'mouse', isPrimary: true })
  h.runCompletedDraws(2, 1)
  assert.deepEqual(h.lastOutputImage(), baseline)
  h.window.dispatch('pointermove', { clientX: h.bounds.left + h.bounds.width / 2, clientY: h.bounds.top + h.bounds.height / 2, pointerType: 'mouse', isPrimary: true })
  h.runCompletedDraws(2, 1)
  assert.notDeepEqual(h.lastOutputImage(), baseline)
  lifecycle.destroy()
})

test('pointer handlers use cached bounds with zero synchronous reads', () => {
  const h = createHarness({ fixedPhase: true, clientWidth: 96, clientHeight: 84 })
  const lifecycle = h.renderer.mount(h.canvas, { scene: h.scene, textureWidth: 64, textureHeight: 32 })
  h.flushIdle()
  h.flushRaf(0)
  assert.equal(h.state.boundsReads, 1)
  const reads = h.state.boundsReads
  dispatchAt(h, 'pointermove', 0, 0)
  dispatchAt(h, 'pointerdown', 0, 0)
  assert.equal(h.state.boundsReads, reads)
  assert.equal(h.window.listenerOptions('pointermove')[0].passive, true)
  assert.equal(h.window.listenerOptions('pointerdown')[0].passive, true)
  assert.equal(h.window.listenerOptions('scroll')[0].passive, true)
  lifecycle.destroy()
})

test('only a primary pointer with button zero replaces the single impact', () => {
  const realCore = require('../themes/fluid-particle/source/js/planet-core.js')
  const observed = []
  let ownedInteraction
  const core = {
    ...realCore,
    applyLocalizedGasDisplacement (...args) {
      ownedInteraction = ownedInteraction || args[5]
      assert.equal(args[5], ownedInteraction)
      observed.push({ ...args[5] })
      return realCore.applyLocalizedGasDisplacement(...args)
    }
  }
  const h = createHarness({ core, recordOutputImages: true, fixedPhase: true, clientWidth: 96, clientHeight: 84 })
  const lifecycle = h.renderer.mount(h.canvas, { scene: h.scene, textureWidth: 64, textureHeight: 32 })
  h.flushIdle()
  h.flushRaf(0)

  dispatchAt(h, 'pointerdown', -0.5, 0)
  h.runCompletedDraws(1, 1)
  assert.ok(observed.at(-1).impactX < -0.4)

  dispatchAt(h, 'pointerdown', 0.5, 0, { button: 1 })
  h.runCompletedDraws(1, 1)
  assert.ok(observed.at(-1).impactX < -0.4)

  dispatchAt(h, 'pointerdown', 0.5, 0, { isPrimary: false })
  h.runCompletedDraws(1, 1)
  assert.ok(observed.at(-1).impactX < -0.4)

  dispatchAt(h, 'pointerdown', 0.5, 0)
  h.runCompletedDraws(1, 1)
  assert.ok(observed.at(-1).impactX > 0.4)
  lifecycle.destroy()
})

test('impact image delta exceeds hover delta', () => {
  const render = type => {
    const h = createHarness({ recordOutputImages: true, fixedPhase: true, clientWidth: 96, clientHeight: 84 })
    const lifecycle = h.renderer.mount(h.canvas, { scene: h.scene, textureWidth: 64, textureHeight: 32 })
    h.flushIdle()
    const baseline = h.lastOutputImage()
    dispatchAt(h, type, 0, 0)
    h.runCompletedDraws(2, 1)
    const delta = imageDelta(h.lastOutputImage(), baseline)
    lifecycle.destroy()
    return delta
  }
  const hoverDelta = render('pointermove')
  const impactDelta = render('pointerdown')
  assert.ok(hoverDelta > 0)
  assert.ok(impactDelta > hoverDelta, { hoverDelta, impactDelta })
})

test('hover returns to fixed-phase baseline after 240 ms and impact after 720 ms', () => {
  const hover = createHarness({ recordOutputImages: true, fixedPhase: true, clientWidth: 96, clientHeight: 84 })
  const hoverLifecycle = hover.renderer.mount(hover.canvas, { scene: hover.scene, textureWidth: 64, textureHeight: 32 })
  hover.flushIdle()
  const hoverBaseline = hover.lastOutputImage()
  hover.flushRaf(0)
  dispatchAt(hover, 'pointermove', 0, 0)
  hover.flushRaf(50)
  assert.notDeepEqual(hover.lastOutputImage(), hoverBaseline)
  dispatchAt(hover, 'pointermove', 1, 1)
  hover.flushRaf(51)
  hover.flushRaf(291)
  assert.deepEqual(hover.lastOutputImage(), hoverBaseline)
  hoverLifecycle.destroy()

  const impact = createHarness({ recordOutputImages: true, fixedPhase: true, clientWidth: 96, clientHeight: 84 })
  const impactLifecycle = impact.renderer.mount(impact.canvas, { scene: impact.scene, textureWidth: 64, textureHeight: 32 })
  impact.flushIdle()
  const impactBaseline = impact.lastOutputImage()
  impact.flushRaf(0)
  dispatchAt(impact, 'pointerdown', 0, 0)
  impact.flushRaf(50)
  assert.notDeepEqual(impact.lastOutputImage(), impactBaseline)
  impact.flushRaf(720)
  assert.notDeepEqual(impact.lastOutputImage(), impactBaseline)
  impact.flushRaf(770)
  assert.deepEqual(impact.lastOutputImage(), impactBaseline)
  impactLifecycle.destroy()
})

test('mobile coarse and no-hover policies attach no pointer listeners', () => {
  const fine = createHarness({ clientWidth: 96, clientHeight: 84 })
  const fineLifecycle = fine.renderer.mount(fine.canvas, { scene: fine.scene, textureWidth: 64, textureHeight: 32 })
  assert.equal(fine.window.listenerCount('pointermove'), 1)
  assert.equal(fine.window.listenerCount('pointerdown'), 1)
  fine.coarseQuery.setMatches(true)
  assert.equal(fine.window.listenerCount('pointermove'), 0)
  assert.equal(fine.window.listenerCount('pointerdown'), 0)
  fine.coarseQuery.setMatches(false)
  assert.equal(fine.window.listenerCount('pointermove'), 1)
  assert.equal(fine.window.listenerCount('pointerdown'), 1)
  fineLifecycle.destroy()

  for (const [name, options] of [
    ['mobile', { mobile: true }],
    ['coarse', { coarsePointer: true }],
    ['no-hover', { noHover: true }],
    ['reduced', { reducedMotion: true }]
  ]) {
    const h = createHarness({ ...options, clientWidth: 96, clientHeight: 84 })
    const lifecycle = h.renderer.mount(h.canvas, { scene: h.scene, textureWidth: 64, textureHeight: 32 })
    assert.equal(h.window.listenerCount('pointermove'), 0, name)
    assert.equal(h.window.listenerCount('pointerdown'), 0, name)
    lifecycle.destroy()
  }
})

test('every blocker transition must clear interaction before cancellation or static redraw', () => {
  const cases = [
    ['manual pause', h => h.mutateScene('motion-paused'), h => h.mutateScene('motion-paused')],
    ['particle fallback', h => h.mutateScene('particle-fallback'), h => h.mutateScene('particle-fallback')],
    ['hidden', h => { h.document.hidden = true; h.document.dispatch('visibilitychange') }, h => { h.document.hidden = false; h.document.dispatch('visibilitychange') }],
    ['offscreen', h => h.setIntersection(false), h => h.setIntersection(true)],
    ['reduced motion', h => h.motionQuery.setMatches(true), h => h.motionQuery.setMatches(false)],
    ['mobile', h => h.mobileQuery.setMatches(true), h => h.mobileQuery.setMatches(false)],
    ['coarse', h => h.coarseQuery.setMatches(true), h => h.coarseQuery.setMatches(false)],
    ['no-hover', h => h.noHoverQuery.setMatches(true), h => h.noHoverQuery.setMatches(false)]
  ]
  for (const [name, block, unblock] of cases) {
    const h = createHarness({ recordOutputImages: true, fixedPhase: true, clientWidth: 96, clientHeight: 84 })
    const lifecycle = h.renderer.mount(h.canvas, { scene: h.scene, textureWidth: 64, textureHeight: 32 })
    h.flushIdle()
    const baseline = h.lastOutputImage()
    h.flushRaf(0)
    dispatchAt(h, 'pointerdown', 0, 0)
    h.flushRaf(50)
    assert.notDeepEqual(h.lastOutputImage(), baseline, `${name} setup`)
    block(h)
    if (name === 'reduced motion') assert.deepEqual(h.lastOutputImage(), baseline, `${name} static redraw`)
    unblock(h)
    h.flushRaf(h.state.clock + 1)
    h.flushRaf(h.state.clock + 50)
    assert.deepEqual(h.lastOutputImage(), baseline, name)
    lifecycle.destroy()
  }
})

test('scroll and resize coalesce one bounds refresh and recompute a stationary pointer', () => {
  const h = createHarness({ recordOutputImages: true, fixedPhase: true, clientWidth: 96, clientHeight: 84 })
  const lifecycle = h.renderer.mount(h.canvas, { scene: h.scene, textureWidth: 64, textureHeight: 32 })
  h.flushIdle()
  const baseline = h.lastOutputImage()
  h.flushRaf(0)
  assert.equal(h.state.boundsReads, 1)
  dispatchAt(h, 'pointermove', 0, 0)
  h.flushRaf(50)
  assert.notDeepEqual(h.lastOutputImage(), baseline)

  h.bounds.left += h.bounds.width * 2
  const reads = h.state.boundsReads
  h.window.dispatch('scroll')
  h.window.dispatch('scroll')
  h.triggerResize()
  h.triggerResize()
  assert.equal(h.state.boundsReads, reads)
  assert.equal(h.pendingRafs(), 1)
  h.flushRaf(100)
  assert.equal(h.state.boundsReads, reads + 1)
  h.flushRaf(340)
  assert.deepEqual(h.lastOutputImage(), baseline)
  lifecycle.destroy()
})

test('destroy and fallback remove pointer scroll media listeners and pending bounds refresh', () => {
  const destroyed = createHarness({ clientWidth: 96, clientHeight: 84 })
  const destroyedLifecycle = destroyed.renderer.mount(destroyed.canvas, { scene: destroyed.scene, textureWidth: 64, textureHeight: 32 })
  assert.ok(destroyed.pendingRafs() > 0)
  destroyedLifecycle.destroy()
  assert.equal(destroyed.pendingRafs(), 0)
  assert.equal(destroyed.window.listenerCount('pointermove'), 0)
  assert.equal(destroyed.window.listenerCount('pointerdown'), 0)
  assert.equal(destroyed.window.listenerCount('scroll'), 0)
  assert.equal(destroyed.motionQuery.listenerCount('change'), 0)
  assert.equal(destroyed.mobileQuery.listenerCount('change'), 0)
  assert.equal(destroyed.coarseQuery.listenerCount('change'), 0)
  assert.equal(destroyed.noHoverQuery.listenerCount('change'), 0)

  const realCore = require('../themes/fluid-particle/source/js/planet-core.js')
  let renders = 0
  const failed = createHarness({
    clientWidth: 96,
    clientHeight: 84,
    core: {
      ...realCore,
      renderProjectedFrame (...args) {
        renders++
        if (renders > 1) throw new Error('render failure')
        return realCore.renderProjectedFrame(...args)
      }
    }
  })
  const failedLifecycle = failed.renderer.mount(failed.canvas, { scene: failed.scene, textureWidth: 64, textureHeight: 32 })
  failed.flushIdle()
  dispatchAt(failed, 'pointermove', 0, 0)
  failed.flushRaf(0)
  failed.flushRaf(50)
  assert.equal(failedLifecycle.snapshot().fallback, true)
  assert.equal(failed.pendingRafs(), 0)
  assert.equal(failed.window.listenerCount('pointermove'), 0)
  assert.equal(failed.window.listenerCount('pointerdown'), 0)
  assert.equal(failed.window.listenerCount('scroll'), 0)
  assert.equal(failed.motionQuery.listenerCount('change'), 0)
  assert.equal(failed.mobileQuery.listenerCount('change'), 0)
  assert.equal(failed.coarseQuery.listenerCount('change'), 0)
  assert.equal(failed.noHoverQuery.listenerCount('change'), 0)
  failedLifecycle.destroy()
})

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
    ['projection setup', { core: { ...require('../themes/fluid-particle/source/js/planet-core.js'), createSphereMap: () => { throw new Error('projection failure') } } }],
    ['localized displacement API', { core: { ...require('../themes/fluid-particle/source/js/planet-core.js'), applyLocalizedGasDisplacement: undefined } }]
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

test('destroyed stale idle and timer initialization callbacks cannot revive a lifecycle', () => {
  for (const [name, options, queue] of [
    ['idle', {}, 'idles'],
    ['timer', { noIdle: true }, 'timers']
  ]) {
    const harness = createHarness({ ...options, textureWidth: 64, textureHeight: 32 })
    const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
    const stale = [...harness.state[queue].values()][0]
    lifecycle.destroy()
    assert.equal(harness.pendingRafs(), 0, name)
    assert.equal(harness.state[queue].size, 0, name)
    assert.equal(harness.document.listenerCount('visibilitychange'), 0, name)
    assert.equal(harness.motionQuery.listenerCount('change'), 0, name)
    assert.equal(harness.mobileQuery.listenerCount('change'), 0, name)
    assert.ok(harness.state.mutationObservers.every(observer => observer.disconnected), name)
    assert.ok(harness.state.intersectionObservers.every(observer => observer.disconnected), name)
    assert.ok(harness.state.resizeObservers.every(observer => observer.disconnected), name)
    stale({ didTimeout: false, timeRemaining: () => 50 })
    assert.equal(lifecycle.snapshot().initialized, false, name)
    assert.equal(harness.state.outputPutCount, 0, name)
  }
})

test('a stale idle initializer cannot revive a failed fallback lifecycle', () => {
  const surfacePath = path.resolve(__dirname, '../themes/fluid-particle/source/js/planet-surface.js')
  const guardedSource = fs.readFileSync(surfacePath, 'utf8')
  const runScenario = surfaceSource => {
    const baseCore = require('../themes/fluid-particle/source/js/planet-core.js')
    let renderCalls = 0
    const harness = createHarness({
      textureWidth: 64,
      textureHeight: 32,
      surfaceSource,
      core: {
        ...baseCore,
        renderProjectedFrame (...args) {
          renderCalls++
          if (renderCalls === 2) throw new Error('one-shot animation render failure')
          return baseCore.renderProjectedFrame(...args)
        }
      }
    })
    const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
    const staleInitializer = [...harness.state.idles.values()][0]
    assert.equal(typeof staleInitializer, 'function')
    harness.flushIdle()
    assert.equal(lifecycle.snapshot().initialized, true)
    harness.flushRaf(0)
    harness.flushRaf(50)
    const before = lifecycle.snapshot()
    const outputBefore = harness.state.outputPutCount
    const rafsBefore = harness.pendingRafs()
    staleInitializer({ didTimeout: false, timeRemaining: () => 50 })
    return {
      before,
      after: lifecycle.snapshot(),
      outputBefore,
      outputAfter: harness.state.outputPutCount,
      rafsBefore,
      rafsAfter: harness.pendingRafs(),
      ready: harness.scene.classList.contains('planet-ready'),
      fallbackClass: harness.scene.classList.contains('planet-fallback'),
      listeners: [
        harness.document.listenerCount('visibilitychange'),
        harness.motionQuery.listenerCount('change'),
        harness.mobileQuery.listenerCount('change')
      ],
      observers: [
        ...harness.state.mutationObservers,
        ...harness.state.intersectionObservers,
        ...harness.state.resizeObservers
      ]
    }
  }
  const assertFallbackIsInert = outcome => {
    assert.equal(outcome.before.fallback, true, 'one-shot animation failure enters fallback')
    assert.equal(outcome.before.initialized, false, 'failure clears initialized before stale initializer runs')
    assert.equal(outcome.after.fallback, true, 'stale initializer must leave fallback true')
    assert.equal(outcome.after.initialized, false, 'stale initializer must leave initialized false')
    assert.deepEqual(outcome.after, outcome.before, 'stale initializer must not change the fallback snapshot')
    assert.equal(outcome.outputAfter, outcome.outputBefore, 'stale initializer must not produce output')
    assert.equal(outcome.ready, false, 'stale initializer must not restore the ready class')
    assert.equal(outcome.fallbackClass, true, 'stale initializer keeps the fallback class')
    assert.equal(outcome.rafsAfter, outcome.rafsBefore, 'stale initializer must not schedule animation')
    assert.deepEqual(outcome.listeners, [0, 0, 0], 'failure cleanup removes owned listeners before stale initializer runs')
    assert.ok(outcome.observers.every(observer => observer.disconnected), 'failure cleanup disconnects owned observers before stale initializer runs')
  }

  assertFallbackIsInert(runScenario(guardedSource))

  const unguardedSource = guardedSource.replace(
    /(function initialize \(\) \{\s+idleId = 0\s+)if \(destroyed \|\| fallback\) return/,
    '$1if (destroyed) return'
  )
  assert.notEqual(unguardedSource, guardedSource, 'the in-memory mutation removes initialize fallback protection')
  assert.throws(
    () => assertFallbackIsInert(runScenario(unguardedSource)),
    /stale initializer must leave fallback true/
  )
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

test('mount defers renderer-owned bulk typed arrays until idle initialization', () => {
  const harness = createHarness({ textureWidth: 64, textureHeight: 32 })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  assert.deepEqual(harness.state.float64Lengths, [])
  assert.doesNotThrow(() => lifecycle.snapshot())
  assert.equal(harness.window.__planetSurfaceMetrics.mark(), 0)
  assert.doesNotThrow(() => harness.window.__planetSurfaceMetrics.measureSince(0))
  harness.flushIdle()
  assert.deepEqual(harness.state.float64Lengths, [1024, 1024, 120])
  lifecycle.destroy()
})

test('pre-idle resize still forces exactly one complete static first frame for every initial blocker', () => {
  const cases = [
    ['hidden', harness => { harness.document.hidden = true; harness.document.dispatch('visibilitychange') }],
    ['reduced', harness => harness.motionQuery.setMatches(true)],
    ['manual', harness => harness.mutateScene('motion-paused')],
    ['offscreen', harness => harness.setIntersection(false)]
  ]
  for (const [name, block] of cases) {
    const harness = createHarness({ textureWidth: 64, textureHeight: 32 })
    const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
    block(harness)
    harness.triggerResize()
    harness.flushIdle()
    const snapshot = lifecycle.snapshot()
    assert.equal(snapshot.initialized, true, name)
    assert.ok(snapshot.canvasWidth > 0, name)
    assert.equal(snapshot.drawCount, 1, name)
    assert.equal(harness.state.outputPutCount, 1, name)
    assert.equal(harness.scene.classList.contains('planet-ready'), true, name)
    assert.equal(harness.pendingRafs(), 0, name)
    lifecycle.destroy()
  }
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

test('redraw fps records only continuous animated intervals across every blocker epoch', () => {
  for (const [name, block, unblock] of [
    ['manual', harness => harness.mutateScene('motion-paused'), harness => harness.mutateScene('motion-paused')],
    ['hidden', harness => { harness.document.hidden = true; harness.document.dispatch('visibilitychange') }, harness => { harness.document.hidden = false; harness.document.dispatch('visibilitychange') }],
    ['offscreen', harness => harness.setIntersection(false), harness => harness.setIntersection(true)],
    ['reduced', harness => harness.motionQuery.setMatches(true), harness => harness.motionQuery.setMatches(false)]
  ]) {
    for (const fps of [20, 24, 30]) {
      const interval = 1000 / fps
      const realCore = require('../themes/fluid-particle/source/js/planet-core.js')
      const harness = createHarness({
        core: { ...realCore, computeBackingSize: options => ({ ...realCore.computeBackingSize(options), fps }) },
        textureWidth: 64,
        textureHeight: 32
      })
      const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
      harness.flushIdle()
      harness.flushRaf(1000)
      harness.flushRaf(1000 + interval)
      harness.flushRaf(1000 + interval * 2)
      harness.flushRaf(1000 + interval * 3)
      assert.ok(Math.abs(lifecycle.snapshot().redrawFps - fps) < 1e-9, `${name}/${fps} before`)
      block(harness)
      unblock(harness)
      harness.flushRaf(500000)
      harness.flushRaf(500000 + interval)
      assert.equal(lifecycle.snapshot().redrawFps, 0, `${name}/${fps} first redraw primes`)
      harness.flushRaf(500000 + interval * 2)
      harness.flushRaf(500000 + interval * 3)
      assert.ok(Math.abs(lifecycle.snapshot().redrawFps - fps) < 1e-9, `${name}/${fps} after`)
      lifecycle.destroy()
    }
  }
})

test('active resize and due animation commit one draw using the latest projection', () => {
  const harness = createHarness({ textureWidth: 64, textureHeight: 32 })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  harness.flushRaf(1000)
  harness.canvas.clientWidth = 400
  harness.triggerResize()
  const draws = lifecycle.snapshot().drawCount
  const puts = harness.state.outputPutCount
  harness.flushRaf(1050)
  assert.equal(lifecycle.snapshot().drawCount, draws + 1)
  assert.equal(harness.state.outputPutCount, puts + 1)
  lifecycle.destroy()
})

test('rounded-equal active resize does not double-draw a due animation frame', () => {
  const harness = createHarness({ clientWidth: 300, textureWidth: 64, textureHeight: 32 })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  harness.flushRaf(1000)
  harness.canvas.clientWidth = 301
  harness.triggerResize()
  const draws = lifecycle.snapshot().drawCount
  const puts = harness.state.outputPutCount
  const images = harness.state.createdImageData
  harness.flushRaf(1050)
  assert.equal(lifecycle.snapshot().drawCount, draws + 1)
  assert.equal(harness.state.outputPutCount, puts + 1)
  assert.equal(harness.state.createdImageData, images)
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

test('measurement accepts exactly 1024 draws and rejects negative or future markers', () => {
  const harness = createHarness({ textureWidth: 64, textureHeight: 32 })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  const marker = harness.window.__planetSurfaceMetrics.mark()
  harness.runCompletedDraws(1024, 2)
  assert.equal(harness.window.__planetSurfaceMetrics.measureSince(marker).complete, true)
  assert.equal(harness.window.__planetSurfaceMetrics.measureSince(-1).complete, false)
  assert.equal(harness.window.__planetSurfaceMetrics.measureSince(lifecycle.snapshot().drawCount + 1).complete, false)
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
  const stale = [...harness.state.rafs.values()][0]
  assert.doesNotThrow(() => harness.flushRaf(1050))
  assert.equal(lifecycle.snapshot().fallback, true)
  assert.equal(harness.scene.classList.contains('planet-fallback'), true)
  assert.equal(harness.scene.classList.contains('particle-fallback'), false)
  assert.equal(harness.pendingRafs(), 0)
  assert.equal(harness.document.listenerCount('visibilitychange'), 0)
  assert.equal(harness.motionQuery.listenerCount('change'), 0)
  assert.equal(harness.mobileQuery.listenerCount('change'), 0)
  assert.ok(harness.state.mutationObservers.every(observer => observer.disconnected))
  assert.ok(harness.state.intersectionObservers.every(observer => observer.disconnected))
  assert.ok(harness.state.resizeObservers.every(observer => observer.disconnected))
  const frozen = lifecycle.snapshot()
  const puts = harness.state.outputPutCount
  stale(2000)
  assert.deepEqual(lifecycle.snapshot(), frozen)
  assert.equal(harness.state.outputPutCount, puts)
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

test('rebuild, output, and quality failures clean every owned resource before destroy', () => {
  const realCore = require('../themes/fluid-particle/source/js/planet-core.js')
  const scenarios = [
    ['rebuild', {
      core: (() => {
        let maps = 0
        return { ...realCore, createSphereMap (...args) { maps++; if (maps > 1) throw new Error('rebuild failure'); return realCore.createSphereMap(...args) } }
      })(),
      trigger: harness => { harness.canvas.clientWidth = 400; harness.triggerResize() }
    }],
    ['output', { outputPutThrowsAfter: 1, trigger: harness => harness.flushRaf(1000) }],
    ['quality', {
      core: (() => {
        let records = 0
        return { ...realCore, recordDrawCost (...args) { records++; if (records > 1) throw new Error('quality failure'); return realCore.recordDrawCost(...args) } }
      })(),
      trigger: harness => harness.flushRaf(1000)
    }]
  ]
  for (const [name, options] of scenarios) {
    const harness = createHarness({ ...options, textureWidth: 64, textureHeight: 32 })
    const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
    harness.flushIdle()
    options.trigger(harness)
    assert.doesNotThrow(() => harness.flushRaf(1050), name)
    assert.equal(lifecycle.snapshot().fallback, true, name)
    assert.equal(harness.pendingRafs(), 0, name)
    assert.equal(harness.document.listenerCount('visibilitychange'), 0, name)
    assert.equal(harness.motionQuery.listenerCount('change'), 0, name)
    assert.equal(harness.mobileQuery.listenerCount('change'), 0, name)
    assert.ok(harness.state.mutationObservers.every(observer => observer.disconnected), name)
    assert.ok(harness.state.intersectionObservers.every(observer => observer.disconnected), name)
    assert.ok(harness.state.resizeObservers.every(observer => observer.disconnected), name)
    const snapshot = lifecycle.snapshot()
    const puts = harness.state.outputPutCount
    harness.flushRaf(2000)
    assert.deepEqual(lifecycle.snapshot(), snapshot, name)
    assert.equal(harness.state.outputPutCount, puts, name)
    lifecycle.destroy()
  }
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
  assert.equal(harness.pendingRafs(), 1)
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
  assert.equal(harness.pendingRafs(), 1)
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
  const record = source.slice(source.indexOf('function recordCompletedDraw'), source.indexOf('function drawCurrentFrame'))
  assert.ok(render.length > 0, 'renderFrame source slice is non-empty')
  assert.ok(draw.length > 0, 'drawCurrentFrame source slice is non-empty')
  assert.ok(record.length > 0, 'recordCompletedDraw source slice is non-empty')
  for (const forbidden of ['new ', 'createElement', 'createImageData', 'getContext', 'getComputedStyle', 'querySelector', 'setTimeout']) {
    assert.equal(render.includes(forbidden), false, `renderFrame contains ${forbidden}`)
    assert.equal(draw.includes(forbidden), false, `drawCurrentFrame contains ${forbidden}`)
    assert.equal(record.includes(forbidden), false, `recordCompletedDraw contains ${forbidden}`)
  }
  assert.equal(/=\s*\[/.test(render) || /=\s*\[/.test(draw) || /=\s*\[/.test(record), false)
  assert.equal(/=\s*\{/.test(render) || /=\s*\{/.test(draw) || /=\s*\{/.test(record), false)
  assert.equal(render.includes('computeCurrentBacking'), false, 'renderFrame delegates policy allocation only to rebuildProjection')
  assert.equal(render.includes('computeBackingSize'), false, 'renderFrame never calls the allocating backing-size policy directly')

  const harness = createHarness({ textureWidth: 64, textureHeight: 32 })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  const imageData = harness.state.createdImageData
  const elements = harness.state.createdElements
  const arrays = harness.state.float64Lengths.length
  const queries = harness.state.documentQueries
  harness.runCompletedDraws(4, 2)
  harness.canvas.clientWidth = 345
  harness.triggerResize()
  harness.queueDrawCost(2)
  harness.flushRaf(harness.state.clock + 50)
  assert.equal(harness.state.createdImageData, imageData)
  assert.equal(harness.state.createdElements, elements)
  assert.equal(harness.state.float64Lengths.length, arrays)
  assert.equal(harness.state.documentQueries, queries)
  lifecycle.destroy()
})
