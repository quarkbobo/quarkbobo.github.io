const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const target = path.resolve(__dirname, '../themes/fluid-particle/source/js/three-body-events.mjs')
async function load () { assert.ok(fs.existsSync(target), 'event implementation exists'); return import(pathToFileURL(target)) }
const between = (value, min, max) => assert.ok(value >= min && value <= max, `${value} outside ${min}..${max}`)
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`)

test('fixed seeds produce independent reproducible event schedules and a first wait of 8–14 seconds', async () => {
  const { makeEvents } = await load(), a = makeEvents(), b = makeEvents()
  assert.deepEqual(a, b); assert.notEqual(a.history, b.history)
  assert.equal(a.seed, 7301); assert.equal(a.active, null); assert.deepEqual(a.history, [])
  between(a.nextAt, 8, 14); assert.notEqual(makeEvents(7302).nextAt, a.nextAt)
  for (const seed of [-1, 1.1, NaN, Infinity, 2 ** 32]) assert.throws(() => makeEvents(seed), RangeError)
})

test('natural events begin once, have bounded duration and schedule their next quiet interval', async () => {
  const { makeEvents, advanceEvents } = await load(), s = makeEvents(), due = s.nextAt
  advanceEvents(s, due - 0.01); assert.equal(s.active, null); assert.equal(s.history.length, 0)
  advanceEvents(s, due)
  assert.ok(['flare', 'dust', 'aurora'].includes(s.active.type))
  assert.ok(['star-a', 'star-b', 'star-c'].includes(s.active.starId))
  assert.equal(s.active.startedAt, due); between(s.active.duration, 6, 10)
  assert.equal(s.history.length, 1); assert.deepEqual(s.history[0], s.active)
  between(s.nextAt - due - s.active.duration, 20, 45)
  const end = due + s.active.duration
  advanceEvents(s, end); assert.equal(s.active, null); assert.equal(s.history.length, 1)
})

test('repeated advancement or effect rendering at the same time cannot duplicate events or consume randomness', async () => {
  const { makeEvents, advanceEvents, eventEffects } = await load(), s = makeEvents(), due = s.nextAt
  advanceEvents(s, due); const copy = structuredClone(s)
  for (let i = 0; i < 100; i++) { advanceEvents(s, due); eventEffects(s, due + 2) }
  assert.deepEqual(s, copy)
})

test('frequency limits scale first and subsequent waits without overlapping two effects', async () => {
  const { makeEvents, advanceEvents } = await load()
  for (const frequency of [0.25, 1, 3]) {
    const s = makeEvents(); advanceEvents(s, 0, { frequency })
    between(s.nextAt, 8 / frequency, 14 / frequency)
    advanceEvents(s, s.nextAt, { frequency })
    between(s.nextAt - s.active.startedAt - s.active.duration, 20 / frequency, 45 / frequency)
    assert.equal(s.history.length, 1)
  }
})

test('disable clears an active visual and reenabling schedules from the current clock without catchup', async () => {
  const { makeEvents, advanceEvents } = await load(), s = makeEvents()
  advanceEvents(s, s.nextAt); const records = structuredClone(s.history)
  advanceEvents(s, 20, { enabled: false }); assert.equal(s.active, null)
  advanceEvents(s, 5000, { enabled: false }); assert.deepEqual(s.history, records)
  advanceEvents(s, 5000, { enabled: true }); assert.equal(s.active, null)
  between(s.nextAt - 5000, 8, 14); assert.deepEqual(s.history, records)
})

test('frequency changes schedule forward instead of retroactively triggering a burst', async () => {
  const { makeEvents, advanceEvents } = await load(), s = makeEvents(), now = s.nextAt - 0.01
  advanceEvents(s, now, { frequency: 3 }); assert.equal(s.active, null); assert.ok(s.nextAt > now)
  advanceEvents(s, s.nextAt, { frequency: 3 }); const active = structuredClone(s.active)
  advanceEvents(s, active.startedAt + 1, { frequency: 0.25 }); assert.deepEqual(s.active, active)
  between(s.nextAt - active.startedAt - active.duration, 20 / 0.25, 45 / 0.25)
  assert.equal(s.history.length, 1)
})

test('long clock jumps skip expired visuals, keep truthful history and replan only one future event', async () => {
  const { makeEvents, advanceEvents } = await load(), s = makeEvents()
  advanceEvents(s, 1000000)
  assert.equal(s.active, null); assert.deepEqual(s.history, []); between(s.nextAt - 1000000, 20, 45)
  advanceEvents(s, s.nextAt); const history = structuredClone(s.history)
  advanceEvents(s, 2000000)
  assert.equal(s.active, null); assert.deepEqual(s.history, history); between(s.nextAt - 2000000, 20, 45)
})

test('manual triggers replace one active event; the sine envelope is isolated to the chosen effect and stays within 0–2', async () => {
  const { makeEvents, triggerEvent, eventEffects } = await load(), s = makeEvents()
  for (const [index, type] of ['flare', 'dust', 'aurora'].entries()) {
    triggerEvent(s, index, type); const e = s.active
    assert.equal(e.type, type); assert.equal(e.startedAt, index); assert.equal(s.history.length, index + 1)
    const start = eventEffects(s, index, 2), middle = eventEffects(s, index + e.duration / 2, 2), end = eventEffects(s, index + e.duration, 2)
    for (const output of [start, middle, end]) for (const v of [output.flare.strength, output.dust, output.aurora]) between(v, 0, 2)
    near(start.flare.strength + start.dust + start.aurora, 0)
    near(end.flare.strength + end.dust + end.aurora, 0)
    near(middle.flare.strength + middle.dust + middle.aurora, 2)
    if (type === 'flare') { assert.equal(middle.flare.starId, e.starId); near(middle.flare.strength, 2) }
    else { assert.equal(middle.flare.starId, null); near(middle[type], 2) }
    const dark = eventEffects(s, index + e.duration / 2, 0)
    near(dark.flare.strength + dark.dust + dark.aurora, 0)
  }
})

test('seeded random triggers reach all three types and stars, with history bounded to the most recent eight', async () => {
  const { makeEvents, triggerEvent } = await load(), a = makeEvents(), b = makeEvents(), types = new Set(), stars = new Set()
  for (let i = 0; i < 90; i++) {
    triggerEvent(a, i); triggerEvent(b, i); types.add(a.active.type); stars.add(a.active.starId)
    assert.ok(a.history.length <= 8); assert.notEqual(a.active, a.history.at(-1))
  }
  assert.deepEqual(a, b); assert.equal(types.size, 3); assert.equal(stars.size, 3)
  assert.deepEqual(a.history.map(e => e.id), [83, 84, 85, 86, 87, 88, 89, 90])
})

test('invalid parameters cannot mutate the schedule, randomness or history', async () => {
  const { makeEvents, advanceEvents, triggerEvent, eventEffects } = await load(), s = makeEvents(), before = structuredClone(s)
  for (const value of [-1, NaN, Infinity]) assert.throws(() => advanceEvents(s, value), RangeError)
  for (const settings of [{ frequency: 0.24 }, { frequency: 3.01 }, { frequency: NaN }, { intensity: -1 }, { intensity: 2.1 }, { enabled: 'yes' }]) assert.throws(() => advanceEvents(s, 1, settings), RangeError)
  assert.throws(() => triggerEvent(s, 1, 'collision'), RangeError)
  assert.throws(() => eventEffects(s, 1, Infinity), RangeError)
  assert.deepEqual(s, before)
})

test('clock reset discards the old active visual and replans from zero while preserving actual history', async () => {
  const { makeEvents, advanceEvents, triggerEvent } = await load(), s = makeEvents()
  triggerEvent(s, 100, 'dust'); const history = structuredClone(s.history)
  advanceEvents(s, 0)
  assert.equal(s.active, null); between(s.nextAt, 8, 14); assert.deepEqual(s.history, history)
})
