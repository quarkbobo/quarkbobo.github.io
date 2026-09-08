const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const load = () => import(pathToFileURL(process.env.PLANET_POLISH_MODULE || path.resolve(__dirname, '../themes/fluid-particle/source/js/planet-flight.mjs')))

test('expansion hands off to forward motion without a pronounced speed valley', async () => {
  const { entryFrame, approachPosition } = await load()
  // Apparent angular size combines fullscreen expansion with camera distance.
  const size = time => {
    const frame = entryFrame(time)
    return (0.708723 + (1 - 0.708723) * frame.expansion) / Math.hypot(...approachPosition(frame.travel))
  }
  const speed = time => (Math.log(size(time + 1)) - Math.log(size(time - 1))) * 500
  assert.ok(speed(560) >= speed(280) * 0.4, 'forward movement must carry at least 40% of the expansion pace through the handoff')
})

test('entry retains the actual homepage camera and releases its parallax without a jump', async () => {
  const { entryPosition } = await load()
  const origin = [0.11, 1.07, 8]
  assert.deepEqual(entryPosition(0, origin), origin)
  assert.ok(Math.hypot(...entryPosition(1, origin).map((v, i) => v - origin[i])) < 0.00001)
  assert.deepEqual(entryPosition(560, origin), entryPosition(560))
  assert.deepEqual(entryPosition(1580, origin), entryPosition(1580))
})
