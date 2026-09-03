const test = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')

const { finePointerMatchMediaFixtureScript } = require('./browser-match-media-fixture.cjs')

function createNativeMatchMedia () {
  const calls = []
  const records = []

  function matchMedia (query) {
    calls.push(query)
    const record = {
      media: query,
      matches: query === '(prefers-reduced-motion: reduce)',
      onchange: null,
      listenerCalls: [],
      addEventListener (...args) {
        assert.equal(this, record)
        record.listenerCalls.push(['addEventListener', ...args])
      },
      removeEventListener (...args) {
        assert.equal(this, record)
        record.listenerCalls.push(['removeEventListener', ...args])
      },
      addListener (...args) {
        assert.equal(this, record)
        record.listenerCalls.push(['addListener', ...args])
      },
      removeListener (...args) {
        assert.equal(this, record)
        record.listenerCalls.push(['removeListener', ...args])
      }
    }
    records.push(record)
    return record
  }

  return { calls, records, matchMedia }
}

test('fine-pointer browser fixture overrides only input capabilities and retains native listener APIs', () => {
  const native = createNativeMatchMedia()
  const window = { matchMedia: native.matchMedia }

  vm.runInNewContext(finePointerMatchMediaFixtureScript(), { window })

  assert.equal(window.matchMedia('(pointer: coarse)').matches, false)
  const fine = window.matchMedia('(pointer: fine)')
  assert.equal(fine.matches, true)
  assert.equal(window.matchMedia('(hover: hover)').matches, true)
  assert.equal(window.matchMedia('(hover: none)').matches, false)

  const changeListener = () => {}
  fine.addEventListener('change', changeListener)
  fine.removeEventListener('change', changeListener)
  fine.addListener(changeListener)
  fine.removeListener(changeListener)
  assert.deepEqual(native.records[1].listenerCalls, [
    ['addEventListener', 'change', changeListener],
    ['removeEventListener', 'change', changeListener],
    ['addListener', changeListener],
    ['removeListener', changeListener]
  ])

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  assert.strictEqual(reducedMotion, native.records[4])
  assert.equal(reducedMotion.matches, true)

  const mobile = window.matchMedia('(max-width: 760px)')
  assert.strictEqual(mobile, native.records[5])
  assert.deepEqual(native.calls, [
    '(pointer: coarse)',
    '(pointer: fine)',
    '(hover: hover)',
    '(hover: none)',
    '(prefers-reduced-motion: reduce)',
    '(max-width: 760px)'
  ])
})
