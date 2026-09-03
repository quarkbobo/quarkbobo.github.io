const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '..')
const sourcePath = path.join(root, 'themes', 'fluid-particle', 'source', 'js', 'cursor-comet.js')
const coreSource = fs.readFileSync(path.join(root, 'themes', 'fluid-particle', 'source', 'js', 'cursor-comet-core.js'), 'utf8')

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
    for (const listener of [...(this.listeners.get(type) || [])]) {
      listener.handler({ type, target: this, ...event })
    }
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
}

class FakeClassList {
  constructor (values = []) {
    this.values = new Set(values)
  }

  add (...tokens) {
    for (const token of tokens) this.values.add(token)
  }

  remove (...tokens) {
    for (const token of tokens) this.values.delete(token)
  }

  contains (token) {
    return this.values.has(token)
  }
}

class FakeStyle {
  constructor () {
    this.properties = new Map()
  }

  setProperty (name, value) {
    this.properties.set(name, String(value))
  }

  getPropertyValue (name) {
    return this.properties.get(name) || ''
  }
}

class FakeSegment extends FakeEventTarget {
  constructor () {
    super()
    this.dataset = { active: 'false', phase: '0' }
    this.style = new FakeStyle()
    this.ink = { className: 'cursor-comet__ink' }
  }

  getBoundingClientRect () {
    throw new Error('comet runtime read layout')
  }
}

function createHarness (options = {}) {
  const state = {
    nextRaf: 1,
    rafs: new Map(),
    observers: []
  }
  const window = new FakeEventTarget()
  const document = new FakeEventTarget()
  const scene = { classList: new FakeClassList(options.sceneClasses) }
  const segments = Array.from({ length: 8 }, () => new FakeSegment())
  const overlay = {
    segments,
    appendCalls: 0,
    querySelectorAll (selector) {
      assert.equal(selector, '.cursor-comet__segment')
      return segments
    },
    appendChild () {
      this.appendCalls++
    },
    getBoundingClientRect () {
      throw new Error('comet runtime read layout')
    }
  }

  const queries = new Map([
    ['(max-width: 760px)', new FakeMediaQueryList('(max-width: 760px)', options.mobile)],
    ['(pointer: coarse)', new FakeMediaQueryList('(pointer: coarse)', options.coarse)],
    ['(pointer: fine)', new FakeMediaQueryList('(pointer: fine)', options.fine !== false)],
    ['(hover: hover)', new FakeMediaQueryList('(hover: hover)', options.hover !== false)],
    ['(prefers-reduced-motion: reduce)', new FakeMediaQueryList('(prefers-reduced-motion: reduce)', options.reduced)]
  ])

  class FakeMutationObserver {
    constructor (callback) {
      this.callback = callback
      this.connected = false
      this.target = null
      this.options = null
      state.observers.push(this)
    }

    observe (target, observerOptions) {
      this.connected = true
      this.target = target
      this.options = observerOptions
    }

    disconnect () {
      this.connected = false
    }
  }

  document.hidden = Boolean(options.hidden)
  document.getElementById = id => id === 'cursor-comet' ? overlay : id === 'space-scene' ? scene : null
  document.createElement = () => { throw new Error('comet runtime created a node') }
  window.document = document
  window.matchMedia = query => {
    assert.ok(queries.has(query), `unexpected media query: ${query}`)
    return queries.get(query)
  }
  window.requestAnimationFrame = callback => {
    const id = state.nextRaf++
    state.rafs.set(id, callback)
    return id
  }
  window.cancelAnimationFrame = id => state.rafs.delete(id)

  const context = vm.createContext({ window, document, MutationObserver: FakeMutationObserver, console, Math, Object, Number })
  vm.runInContext(coreSource, context, { filename: 'cursor-comet-core.js' })
  assert.ok(fs.existsSync(sourcePath), 'cursor-comet runtime exists')
  vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), context, { filename: 'cursor-comet.js' })

  const flushRaf = timestamp => {
    const callbacks = [...state.rafs.values()]
    state.rafs.clear()
    for (const callback of callbacks) callback(timestamp)
    return callbacks.length
  }

  return {
    api: window.FluidCursorComet,
    window,
    document,
    overlay,
    scene,
    queries,
    observers: state.observers,
    flushRaf,
    pendingRafs: () => state.rafs.size,
    notifySceneMutation: () => {
      for (const observer of state.observers) {
        if (observer.connected) observer.callback([{ type: 'attributes', attributeName: 'class', target: scene }])
      }
    }
  }
}

function drawTwoSegments (h, start = 0) {
  dispatchMouseMove(h, { clientX: start, clientY: 10, timeStamp: 0 })
  dispatchMouseMove(h, { clientX: start + 20, clientY: 10, timeStamp: 16 })
  h.flushRaf(16)
  dispatchMouseMove(h, { clientX: start + 40, clientY: 10, timeStamp: 32 })
  h.flushRaf(32)
}

function dispatchMouseMove (h, event) {
  h.window.dispatch('pointermove', { pointerType: 'mouse', ...event })
}

test('fine hover pointer coalesces movement and cycles the fixed eight-node pool', () => {
  const h = createHarness({ fine: true, hover: true })
  const life = h.api.mount(h.overlay, { scene: h.scene })
  dispatchMouseMove(h, { clientX: 10, clientY: 10, timeStamp: 0 })
  dispatchMouseMove(h, { clientX: 42, clientY: 10, timeStamp: 16 })
  assert.equal(h.pendingRafs(), 1)
  h.flushRaf(16)
  assert.equal(life.snapshot().activeSegments, 1)
  assert.equal(h.overlay.segments.length, 8)
  assert.equal(h.overlay.segments[0].style.getPropertyValue('--comet-length'), '32px')

  for (let index = 0; index < 8; index++) {
    dispatchMouseMove(h, { clientX: 50 + index * 8, clientY: 10, timeStamp: 32 + index * 16 })
    h.flushRaf(32 + index * 16)
  }
  assert.equal(life.snapshot().poolIndex, 1)
  assert.equal(life.snapshot().activeSegments, 8)
  assert.equal(h.overlay.appendCalls, 0)
})

test('one-pixel mouse moves accumulate from the accepted anchor until one segment reaches four pixels', () => {
  const h = createHarness()
  const life = h.api.mount(h.overlay, { scene: h.scene })
  dispatchMouseMove(h, { clientX: 10, clientY: 10, timeStamp: 0 })

  for (let offset = 1; offset <= 4; offset++) {
    dispatchMouseMove(h, { clientX: 10 + offset, clientY: 10, timeStamp: offset * 16 })
    h.flushRaf(offset * 16)
  }

  assert.equal(life.snapshot().activeSegments, 1)
  assert.equal(life.snapshot().poolIndex, 1)
  assert.equal(h.overlay.segments[0].style.getPropertyValue('--comet-length'), '4px')
})

test('hybrid fine-pointer media never lets touch or pen movement create comet state', () => {
  for (const pointerType of ['touch', 'pen']) {
    const h = createHarness({ fine: true, hover: true })
    const life = h.api.mount(h.overlay, { scene: h.scene })
    h.window.dispatch('pointermove', { clientX: 10, clientY: 10, timeStamp: 0, pointerType })
    h.window.dispatch('pointermove', { clientX: 30, clientY: 10, timeStamp: 16, pointerType })

    assert.equal(h.pendingRafs(), 0, pointerType)
    assert.equal(life.snapshot().activeSegments, 0, pointerType)
    assert.equal(life.snapshot().poolIndex, 0, pointerType)
  }
})

test('non-mouse window exits preserve an existing mouse comet while mouse exit clears it', () => {
  for (const pointerType of ['touch', 'pen']) {
    const h = createHarness()
    const life = h.api.mount(h.overlay, { scene: h.scene })
    drawTwoSegments(h)
    assert.equal(life.snapshot().activeSegments, 2, pointerType)

    h.window.dispatch('pointerout', { pointerType, relatedTarget: null })
    assert.equal(life.snapshot().activeSegments, 2, pointerType)
  }

  const h = createHarness()
  const life = h.api.mount(h.overlay, { scene: h.scene })
  drawTwoSegments(h)
  h.window.dispatch('pointerout', { pointerType: 'mouse', relatedTarget: null })
  assert.equal(life.snapshot().activeSegments, 0)
})

test('blocked pointer policies start disabled without attaching pointer movement', () => {
  for (const options of [
    { mobile: true },
    { coarse: true },
    { fine: false },
    { hover: false },
    { reduced: true }
  ]) {
    const h = createHarness(options)
    const snapshot = h.api.mount(h.overlay, { scene: h.scene }).snapshot()
    assert.equal(snapshot.enabled, false, JSON.stringify(options))
    assert.equal(snapshot.listenerAttached, false, JSON.stringify(options))
    assert.equal(h.window.listenerCount('pointermove'), 0, JSON.stringify(options))
  }
})

test('eligible pointer listener is passive and twenty rapid moves queue only one frame', () => {
  const h = createHarness()
  h.api.mount(h.overlay, { scene: h.scene })
  assert.equal(h.window.listenerCount('pointermove'), 1)
  assert.equal(h.window.listenerOptions('pointermove').length, 1)
  assert.equal(h.window.listenerOptions('pointermove')[0].passive, true)

  for (let index = 0; index < 20; index++) {
    dispatchMouseMove(h, { clientX: index * 5, clientY: 4, timeStamp: index })
  }
  assert.equal(h.pendingRafs(), 1)
  h.flushRaf(20)
  assert.equal(h.overlay.appendCalls, 0)
  assert.equal(h.api.mount(h.overlay, { scene: h.scene }).snapshot().activeSegments, 1)
})

test('mount is idempotent and snapshots are frozen records', () => {
  const h = createHarness()
  const first = h.api.mount(h.overlay, { scene: h.scene })
  const second = h.api.mount(h.overlay, { scene: h.scene })
  const snapshot = first.snapshot()
  assert.equal(first, second)
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(snapshot))
  assert.deepEqual(Object.keys(snapshot).sort(), ['activeSegments', 'enabled', 'listenerAttached', 'poolIndex'])
  assert.equal(h.window.listenerCount('pointermove'), 1)
  assert.equal(h.observers.length, 1)
  assert.equal(h.overlay.segments.every(segment => segment.listenerCount('animationend') === 1), true)
})

test('animation end returns a faded pooled segment to inactive', () => {
  const h = createHarness()
  const life = h.api.mount(h.overlay, { scene: h.scene })
  drawTwoSegments(h)
  assert.equal(life.snapshot().activeSegments, 2)
  h.overlay.segments[0].dispatch('animationend', { animationName: 'comet-fade-a' })
  assert.equal(h.overlay.segments[0].dataset.active, 'false')
  assert.equal(life.snapshot().activeSegments, 1)
})

test('pause, fallback, hidden, window leave, and blur clear every pooled segment', () => {
  const cases = [
    {
      label: 'pause',
      act (h) {
        h.scene.classList.add('motion-paused')
        h.notifySceneMutation()
      }
    },
    {
      label: 'fallback',
      act (h) {
        h.scene.classList.add('particle-fallback')
        h.notifySceneMutation()
      }
    },
    {
      label: 'hidden',
      act (h) {
        h.document.hidden = true
        h.document.dispatch('visibilitychange')
      }
    },
    { label: 'window leave', act: h => h.window.dispatch('pointerout', { pointerType: 'mouse', relatedTarget: null }) },
    { label: 'blur', act: h => h.window.dispatch('blur') }
  ]

  for (const entry of cases) {
    const h = createHarness()
    const life = h.api.mount(h.overlay, { scene: h.scene })
    drawTwoSegments(h)
    assert.equal(life.snapshot().activeSegments, 2, entry.label)
    entry.act(h)
    assert.equal(life.snapshot().activeSegments, 0, entry.label)
    assert.equal(h.overlay.segments.every(segment => segment.dataset.active === 'false'), true, entry.label)
  }
})

test('policy re-enable restores one listener and seeds a fresh point', () => {
  const h = createHarness()
  const life = h.api.mount(h.overlay, { scene: h.scene })
  drawTwoSegments(h)
  const coarse = h.queries.get('(pointer: coarse)')
  coarse.setMatches(true)
  assert.equal(h.window.listenerCount('pointermove'), 0)
  assert.equal(life.snapshot().activeSegments, 0)

  coarse.setMatches(false)
  assert.equal(h.window.listenerCount('pointermove'), 1)
  dispatchMouseMove(h, { clientX: 500, clientY: 400, timeStamp: 100 })
  assert.equal(h.pendingRafs(), 0)
  dispatchMouseMove(h, { clientX: 510, clientY: 400, timeStamp: 116 })
  assert.equal(h.pendingRafs(), 1)
  h.flushRaf(116)
  assert.equal(life.snapshot().activeSegments, 1)
  assert.equal(h.overlay.segments[2].style.getPropertyValue('--comet-length'), '10px')
})

test('destroy cancels work and removes every owned observer and listener', () => {
  const h = createHarness()
  const life = h.api.mount(h.overlay, { scene: h.scene })
  dispatchMouseMove(h, { clientX: 0, clientY: 0, timeStamp: 0 })
  dispatchMouseMove(h, { clientX: 20, clientY: 0, timeStamp: 16 })
  assert.equal(h.pendingRafs(), 1)

  life.destroy()
  assert.equal(h.pendingRafs(), 0)
  assert.equal(h.window.listenerCount('pointermove'), 0)
  assert.equal(h.window.listenerCount('pointerout'), 0)
  assert.equal(h.window.listenerCount('blur'), 0)
  assert.equal(h.document.listenerCount('visibilitychange'), 0)
  assert.equal([...h.queries.values()].every(query => query.listenerCount('change') === 0), true)
  assert.equal(h.overlay.segments.every(segment => segment.listenerCount('animationend') === 0), true)
  assert.equal(h.observers.every(observer => observer.connected === false), true)
  const snapshot = life.snapshot()
  assert.equal(snapshot.enabled, false)
  assert.equal(snapshot.listenerAttached, false)
  assert.equal(snapshot.activeSegments, 0)
  assert.equal(snapshot.poolIndex, 0)
})
