const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const core = require(path.resolve(__dirname, '../themes/fluid-particle/source/js/home-latest-core.js'))
const runtimePath = path.resolve(__dirname, '../themes/fluid-particle/source/js/home-latest.js')

class FakeClassList {
  constructor () {
    this.values = new Set()
  }

  toggle (token, force) {
    if (force) this.values.add(token)
    else this.values.delete(token)
  }

  contains (token) {
    return this.values.has(token)
  }
}

const card = publishedAt => ({
  dataset: { publishedAt },
  classList: new FakeClassList()
})

test('home runtime marks current posts and moves them before ordinary and future cards', () => {
  global.FluidHomeLatestCore = core
  delete require.cache[runtimePath]
  const { mount } = require(runtimePath)
  delete global.FluidHomeLatestCore

  const now = Date.parse('2026-09-03T12:00:00.000Z')
  const future = card('2026-09-04T12:00:00.000Z')
  const ordinary = card('2026-08-01T12:00:00.000Z')
  const recent = card('2026-09-02T12:00:00.000Z')
  const children = [future, ordinary, recent]
  const grid = {
    querySelectorAll: selector => {
      assert.equal(selector, '[data-latest-card]')
      return [...children]
    },
    appendChild: entry => {
      children.splice(children.indexOf(entry), 1)
      children.push(entry)
    }
  }

  const snapshot = mount(grid, now)

  assert.deepEqual(children, [recent, ordinary, future])
  assert.equal(recent.classList.contains('is-new'), true)
  assert.equal(ordinary.classList.contains('is-new'), false)
  assert.equal(future.classList.contains('is-new'), false)
  assert.deepEqual(snapshot, { cardCount: 3, newCount: 1 })
  assert.equal(Object.isFrozen(snapshot), true)
})
