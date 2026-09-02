const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const modulePath = path.resolve(__dirname, '../themes/fluid-particle/source/js/cursor-comet-core.js')
const core = require(modulePath)

test('segment ignores jitter, caps length, and keeps the current point as its head', () => {
  const out = {}
  assert.equal(core.writeSegment({ x: 10, y: 10, time: 0 }, { x: 12, y: 12, time: 16 }, out), false)
  assert.equal(core.writeSegment({ x: 0, y: 0, time: 0 }, { x: 200, y: 0, time: 20 }, out), true)
  assert.deepEqual(out, { x: 128, y: 0, length: 72, angle: 0, width: 2.5 })
})

test('speed maps monotonically to one through two-point-five pixels', () => {
  const slow = {}
  const fast = {}
  assert.equal(core.writeSegment({ x: 0, y: 0, time: 0 }, { x: 8, y: 0, time: 80 }, slow), true)
  assert.equal(core.writeSegment({ x: 0, y: 0, time: 0 }, { x: 8, y: 0, time: 1 }, fast), true)
  assert.ok(slow.width >= 1 && slow.width < fast.width && fast.width <= 2.5)
})

test('pool index cycles over exactly eight reusable slots', () => {
  assert.deepEqual(Array.from({ length: 10 }, (_, index) => core.nextPoolIndex(index, 8)), [1, 2, 3, 4, 5, 6, 7, 0, 1, 2])
})

test('negative diagonal writes a tail behind the current point and preserves output identity', () => {
  const out = { sentinel: true }
  const result = core.writeSegment({ x: 10, y: 20, time: 5 }, { x: 4, y: 14, time: 9 }, out)
  assert.equal(result, true)
  assert.equal(out.sentinel, true)
  assert.equal(out.x, 10)
  assert.equal(out.y, 20)
  assert.equal(out.length, Math.hypot(6, 6))
  assert.equal(out.angle, -3 * Math.PI / 4)
  assert.ok(out.width > 1 && out.width <= 2.5)
})

test('segment rejects nonfinite points and missing output without mutating output', () => {
  const out = { x: 1, y: 2, length: 3, angle: 4, width: 5 }
  assert.equal(core.writeSegment({ x: NaN, y: 0, time: 0 }, { x: 10, y: 0, time: 1 }, out), false)
  assert.deepEqual(out, { x: 1, y: 2, length: 3, angle: 4, width: 5 })
  assert.equal(core.writeSegment({ x: 0, y: 0, time: 0 }, { x: 10, y: Infinity, time: 1 }, out), false)
  assert.deepEqual(out, { x: 1, y: 2, length: 3, angle: 4, width: 5 })
  assert.equal(core.writeSegment({ x: 0, y: 0, time: 0 }, { x: 10, y: 0, time: 1 }, null), false)
})

test('invalid pool sizes return zero', () => {
  assert.equal(core.nextPoolIndex(3, 0), 0)
  assert.equal(core.nextPoolIndex(3, -1), 0)
  assert.equal(core.nextPoolIndex(3, 1.5), 0)
  assert.equal(core.nextPoolIndex(3, NaN), 0)
  assert.equal(core.nextPoolIndex(3, '8'), 0)
})

test('browser script exposes the same frozen API as CommonJS', () => {
  const source = fs.readFileSync(modulePath, 'utf8')
  const window = {}
  vm.runInNewContext(source, { window, globalThis: window, Math, Object, Number })
  assert.deepEqual(Object.keys(window.FluidCursorCometCore).sort(), Object.keys(core).sort())
  assert.ok(Object.isFrozen(core))
  assert.ok(Object.isFrozen(window.FluidCursorCometCore))
})

test('hot geometry functions do not access DOM or allocate storage', () => {
  const source = fs.readFileSync(modulePath, 'utf8')
  const writeBody = source.match(/function writeSegment[\s\S]*?\n  }/)?.[0] || ''
  const poolBody = source.match(/function nextPoolIndex[\s\S]*?\n  }/)?.[0] || ''
  assert.ok(writeBody)
  assert.ok(poolBody)
  assert.doesNotMatch(`${writeBody}${poolBody}`, /\bnew\s+|Array\.|Object\.|window|document|getContext|getComputedStyle|querySelector|createElement/)
})
