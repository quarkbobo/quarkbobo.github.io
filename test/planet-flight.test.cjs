const test = require('node:test')
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const load = () => import(pathToFileURL(path.resolve(__dirname, '../themes/fluid-particle/source/js/planet-flight.mjs')))

test('orbit bounds keep the camera outside the core and inside the interior dome', async () => {
  const { constrainView, orbitPosition } = await load()
  for (const radius of [-100, 0, 8, 200]) {
    const view = constrainView({ yaw: 2, pitch: 4, radius })
    const point = orbitPosition(view)
    assert.ok(view.radius >= 6 && view.radius <= 14)
    assert.ok(view.pitch <= 0.85)
    assert.ok(Math.abs(Math.hypot(...point) - view.radius) < 1e-8)
  }
})

test('approach flies from the same exterior view through the radius 1.5 sphere', async () => {
  const { approachPosition } = await load()
  assert.deepEqual(approachPosition(0), [0, 1, 8])
  assert.ok(Math.hypot(...approachPosition(1)) < 1.5)
  assert.deepEqual(approachPosition(-1), approachPosition(0))
  assert.deepEqual(approachPosition(2), approachPosition(1))
})

test('one timeline fully covers the scene seam and settles the interior before enabling it', async () => {
  const { entryFrame, ENTRY_DURATION, SCENE_SEAM } = await load()
  assert.equal(typeof entryFrame, 'function')
  assert.equal(entryFrame(0).expansion, 0)
  assert.equal(entryFrame(0).veil, 0)
  assert.equal(entryFrame(0).cloud, 0)
  for (const offset of [-30, 0, 30]) assert.equal(entryFrame(SCENE_SEAM + offset).cloud, 1)
  assert.equal(entryFrame(SCENE_SEAM - 1).inside, false)
  assert.equal(entryFrame(SCENE_SEAM).inside, true)
  const end = entryFrame(ENTRY_DURATION)
  assert.equal(end.arrival, 1)
  assert.equal(end.cloud, 0)
  assert.equal(end.hud, 1)
  assert.equal(end.complete, true)
  assert.deepEqual(entryFrame(ENTRY_DURATION + 5000), end)
})

test('opening transform preserves the planet center and projected scale across a host resize', async () => {
  const { openingTransform } = await load()
  const source = { left: 560, top: 72, width: 760, height: 850, fov: 52 }
  const target = { left: 0, top: 0, width: 1440, height: 1000, fov: 42 }
  const transform = openingTransform(source, target)
  assert.equal(target.width / 2 + transform.x, source.left + source.width / 2)
  assert.equal(target.height / 2 + transform.y, source.top + source.height / 2)
  const projected = rect => rect.height / Math.tan(rect.fov * Math.PI / 360)
  assert.ok(Math.abs(projected(target) * transform.scale - projected(source)) < 1e-8)
})

test('return is fully covered while the interior changes back to the exterior', async () => {
  const { returnFrame, RETURN_DURATION } = await load()
  assert.equal(returnFrame(0).outside, false)
  assert.equal(returnFrame(260).cloud, 1)
  assert.equal(returnFrame(260).outside, true)
  const end = returnFrame(RETURN_DURATION)
  assert.equal(end.collapse, 1)
  assert.equal(end.veil, 0)
  assert.equal(end.cloud, 0)
  assert.equal(end.complete, true)
})
