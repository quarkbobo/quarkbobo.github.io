const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const publicRoot = path.resolve(__dirname, '..', 'public')
const built = relative => fs.readFileSync(path.join(publicRoot, relative), 'utf8')

class ClassList {
  constructor () {
    this.values = new Set()
  }

  add (...tokens) {
    for (const token of tokens) this.values.add(token)
  }

  toggle (token, force) {
    if (force) this.values.add(token)
    else this.values.delete(token)
    return Boolean(force)
  }

  contains (token) {
    return this.values.has(token)
  }
}

class Element {
  constructor (attributes = {}) {
    this.attributes = new Map(Object.entries(attributes))
    this.classList = new ClassList()
    this.listeners = new Map()
  }

  addEventListener (type, listener) {
    this.listeners.set(type, listener)
  }

  click () {
    this.listeners.get('click')?.()
  }

  getAttribute (name) {
    return this.attributes.get(name) ?? null
  }

  setAttribute (name, value) {
    this.attributes.set(name, value)
  }
}

test('generated navigation exposes a skip target and a controlled collapsed menu', () => {
  // Removing any relationship makes keyboard navigation ambiguous even if the templates still look similar.
  const output = built('index.html')
  const skip = output.match(/<a\b[^>]*class="skip-link"[^>]*href="([^"]+)"/)
  const main = output.match(/<main\b([^>]*)>/)
  const toggle = output.match(/<button\b([^>]*)class="nav-toggle"([^>]*)>/)
  const nav = output.match(/<nav\b([^>]*)id="site-menu"([^>]*)>/)

  assert.equal(skip?.[1], '#main-content')
  assert.match(`${main?.[1]}`, /id="main-content"/)
  assert.match(`${main?.[1]}`, /tabindex="-1"/)
  assert.match(`${toggle?.[1]} ${toggle?.[2]}`, /aria-expanded="false"/)
  assert.match(`${toggle?.[1]} ${toggle?.[2]}`, /aria-controls="site-menu"/)
  assert.match(`${nav?.[1]} ${nav?.[2]}`, /aria-label="主要导航"/)
})

test('generated site script keeps menu visibility and aria-expanded in sync', () => {
  // A visual-only toggle would leave assistive technology reporting the opposite state.
  const root = new Element()
  const toggle = new Element({ 'aria-expanded': 'false' })
  const menu = new Element()
  const document = {
    documentElement: root,
    querySelector (selector) {
      if (selector === '.nav-toggle') return toggle
      if (selector === '.site-nav') return menu
      return null
    }
  }

  vm.runInNewContext(built(path.join('js', 'site.js')), { document }, { filename: 'public/js/site.js' })

  assert.equal(root.classList.contains('is-enhanced'), true)
  toggle.click()
  assert.equal(toggle.getAttribute('aria-expanded'), 'true')
  assert.equal(menu.classList.contains('is-open'), true)
  toggle.click()
  assert.equal(toggle.getAttribute('aria-expanded'), 'false')
  assert.equal(menu.classList.contains('is-open'), false)
})
