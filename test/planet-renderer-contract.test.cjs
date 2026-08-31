const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

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
    documentQueries: 0
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
  const document = {
    hidden: false,
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
    },
    addEventListener () {},
    removeEventListener () {}
  }
  const window = {
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
    matchMedia: query => ({ media: query, matches: query.includes('max-width') ? Boolean(options.mobile) : Boolean(options.reducedMotion), addEventListener () {}, removeEventListener () {} }),
    performance: { now: () => 0 }
  }
  const source = fs.readFileSync(path.resolve(__dirname, '../themes/fluid-particle/source/js/planet-surface.js'), 'utf8')
  vm.runInNewContext(source, { window, globalThis: window, Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray, Float32Array, Float64Array, Math, Object, Number, Error, TypeError })
  const flush = queue => {
    const entries = [...queue.values()]
    queue.clear()
    entries.forEach(callback => callback({ didTimeout: false, timeRemaining: () => 50 }))
    return entries.length
  }
  exposeAutoCanvas = true
  return {
    state,
    scene,
    canvas,
    window,
    renderer: window.FluidPlanetSurface,
    flushIdle: () => flush(state.idles),
    flushTimers: () => flush(state.timers)
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
  assert.equal(snapshot.running, false)
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
