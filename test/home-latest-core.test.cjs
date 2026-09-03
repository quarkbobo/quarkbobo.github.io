const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const modulePath = path.resolve(__dirname, '../themes/fluid-particle/source/js/home-latest-core.js')

assert.ok(fs.existsSync(modulePath), 'home latest core module exists')
const { NEW_WINDOW_MS, publicationState } = require(modulePath)

test('the new-post window includes its exact zero and 72-hour boundaries', () => {
  const now = Date.parse('2026-09-03T12:00:00.000Z')

  assert.equal(publicationState(now, now), 'new')
  assert.equal(publicationState(now - NEW_WINDOW_MS, now), 'new')
})

test('posts older than 72 hours are ordinary and future posts are not new', () => {
  const now = Date.parse('2026-09-03T12:00:00.000Z')

  assert.equal(publicationState(now - NEW_WINDOW_MS - 1, now), 'ordinary')
  assert.equal(publicationState(now + 1, now), 'future')
})

test('publication state accepts ISO strings and rejects invalid dates and clocks', () => {
  const now = Date.parse('2026-09-03T12:00:00.000Z')

  assert.equal(publicationState('2026-09-02T12:00:00.000Z', now), 'new')
  assert.equal(publicationState('not-a-date', now), 'invalid')
  assert.equal(publicationState(now, Number.NaN), 'invalid')
})

test('the public API and its 72-hour constant are immutable', () => {
  const api = require(modulePath)

  assert.equal(NEW_WINDOW_MS, 72 * 60 * 60 * 1000)
  assert.equal(Object.isFrozen(api), true)
})
